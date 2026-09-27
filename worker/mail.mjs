import { ImapFlow } from 'imapflow';
import PostalMime from 'postal-mime';
import { compile } from 'html-to-text';
import sanitizeHtml from 'sanitize-html';
import { MailError, validateRequest, extractCodes, filterMessages } from '../public/mail-shared.mjs';

const SCOPES = {
  graph: 'https://graph.microsoft.com/Mail.Read offline_access',
  imap: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
};
const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_IMAP_BYTES = 2 * 1024 * 1024;
const htmlText = compile({ wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } }], limits: { maxInputLength: MAX_MESSAGE_BYTES, maxDepth: 40, maxChildNodes: 10000 } });
const color = /^(?:#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d\s.,%]+\))$/i;
const length = /^(?:0|\d{1,4}(?:\.\d{1,3})?(?:px|pt|em|rem|%))$/i;
const spacing = /^(?:(?:0|auto|\d{1,4}(?:\.\d{1,3})?(?:px|pt|em|rem|%))(?:\s+|$)){1,4}$/i;
const safeStyles = {
  color: [color], 'background-color': [color],
  'font-family': [/^[a-z\d ,"'-]{1,180}$/i], 'font-size': [length],
  'font-weight': [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i], 'font-style': [/^(?:normal|italic|oblique)$/i],
  'line-height': [/^(?:normal|\d{1,3}(?:\.\d{1,3})?(?:px|pt|em|rem|%)?)$/i],
  'text-align': [/^(?:left|right|center|justify|start|end)$/i],
  'text-decoration': [/^(?:none|underline|line-through|overline)$/i],
  'letter-spacing': [length], 'vertical-align': [/^(?:baseline|top|middle|bottom|text-top|text-bottom|sub|super)$/i],
  'white-space': [/^(?:normal|pre|pre-wrap|pre-line)$/i],
  'border-collapse': [/^(?:collapse|separate)$/i], 'border-spacing': [spacing],
  'border-style': [/^(?:none|solid|dotted|dashed|double)$/i], 'border-width': [length], 'border-color': [color],
  'border-radius': [length], width: [length, /^auto$/], 'max-width': [length], height: [length, /^auto$/],
  'table-layout': [/^(?:auto|fixed)$/i],
};
for (const property of ['margin', 'padding']) {
  safeStyles[property] = [spacing];
  for (const side of ['top', 'right', 'bottom', 'left']) safeStyles[`${property}-${side}`] = [length, /^auto$/];
}

// Keep email typography/tables, but no executable markup, navigable links,
// images, external styles or CSS values capable of fetching a resource.
export function sanitizeMailHTML(html) {
  return sanitizeHtml(String(html || '').slice(0, 160000), {
    allowedTags: ['div', 'section', 'article', 'header', 'footer', 'main', 'p', 'span', 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'small', 'sub', 'sup', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'font'],
    allowedAttributes: {
      '*': ['style', 'title', { name: 'dir', values: ['ltr', 'rtl', 'auto'] }],
      table: ['width', 'align', 'cellpadding', 'cellspacing', 'border', 'bgcolor'],
      td: ['colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'bgcolor'],
      th: ['colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'bgcolor'],
      col: ['span', 'width'], colgroup: ['span', 'width'], ol: ['start', 'type'], li: ['value'], font: ['color', 'size', 'face'],
    },
    allowedStyles: { '*': safeStyles },
    allowedSchemes: [], allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'xmp', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math'],
    nestingLimit: 40,
  });
}

export async function boundedJSON(response, limit = 3 * 1024 * 1024) {
  if (!response.body) throw new MailError('UPSTREAM_EMPTY', '微软返回了空响应，请稍后重试。', 502);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new MailError('RESPONSE_SIZE', '邮件内容过大，请减少读取数量或关闭“读取正文”。', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new MailError('UPSTREAM_RESPONSE', '微软返回了无法解析的响应，请稍后重试。', 502); }
}

function upstreamError(response, data, stage) {
  if (response.status === 429) {
    const delay = Math.max(1, Math.min(3600, Number(response.headers.get('retry-after')) || 60));
    return new MailError('THROTTLED', `微软接口暂时限流，请在 ${delay} 秒后再试。`, 429, delay);
  }
  if (response.status >= 500) return new MailError('UPSTREAM_UNAVAILABLE', '微软服务暂时不可用，请稍后重试。', 502);
  const raw = typeof data.error === 'string' ? data.error : data.error?.code;
  const code = String(raw || 'MICROSOFT_ERROR').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90);
  const aad = String(data.error_description || '').match(/AADSTS(\d+)/)?.[1];
  let message = '微软拒绝了读取请求，请检查应用授权和令牌。';
  if (code === 'invalid_grant') message = '令牌无效、已过期或不适用于此次请求，需要检查原应用授权或重新获取令牌。';
  if (code === 'invalid_client' || code === 'unauthorized_client') message = '应用标识或应用类型不匹配；机密客户端可能还要求应用自身的密钥。';
  if (code === 'invalid_scope' || code === 'consent_required' || aad === '65001') message = '原应用没有所需邮件权限，需要为对应的 Graph 或 IMAP 权限重新授权。';
  if (aad === '700016') message = '找不到此应用，请检查 client_id，以及高级选项中的登录类型。';
  if (aad === '7000218') message = '此应用要求客户端密钥，仅凭这四个字段无法完成授权。';
  if (['50076', '50079', '50173', '700082', '700084'].includes(aad)) message = '此令牌需要重新登录 Microsoft 完成授权。';
  if (response.status === 403) message = '当前授权没有读取该邮箱的权限，或邮箱访问被 Microsoft 策略限制。';
  if (response.status === 401) message = '访问令牌不适用于当前邮件接口，或已失效。';
  if (response.status === 404) message = '没有找到邮箱或所选文件夹，请检查邮箱类型和应用授权。';
  return new MailError(`${stage.toUpperCase()}_${code}${aad ? `_AADSTS${aad}` : ''}`, message, 422);
}

async function refreshAccess(input, protocol, state, fetcher, signal) {
  const response = await fetcher(`https://login.microsoftonline.com/${input.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: input.clientId, refresh_token: state.refreshToken, grant_type: 'refresh_token', scope: SCOPES[protocol] }),
    redirect: 'manual',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (response.status >= 300 && response.status < 400) throw new MailError('UPSTREAM_REDIRECT', '微软授权端点返回了意外跳转，请稍后重试。', 502);
  const data = await boundedJSON(response, 128 * 1024);
  if (!response.ok || !data.access_token) throw upstreamError(response, data, 'oauth');
  if (typeof data.refresh_token === 'string' && data.refresh_token) state.refreshToken = data.refresh_token;
  return data.access_token;
}

function normalizeMessage(message) {
  const body = String(message.body || '');
  const clipped = body.slice(0, 160000);
  const result = {
    id: String(message.id),
    subject: String(message.subject || '（无主题）').slice(0, 2000),
    from: String(message.from || '未知发件人').slice(0, 2000),
    date: message.date || null,
    isRead: Boolean(message.isRead),
    preview: String(message.preview || '').slice(0, 1000),
    body: clipped,
    html: message.html ? sanitizeMailHTML(message.html) : '',
    note: message.note || (body.length > clipped.length || String(message.html || '').length > 160000 ? '正文超过展示上限，已截断。' : ''),
  };
  result.codes = extractCodes(`${result.subject}\n${result.preview}\n${result.body}`);
  return result;
}

export async function readGraph(input, accessToken, { fetcher = fetch, signal }) {
  const fields = 'id,subject,from,receivedDateTime,isRead,bodyPreview' + (input.includeBody ? ',body' : '');
  const url = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${input.folder}/messages`);
  url.search = new URLSearchParams({ '$top': String(input.count), '$orderby': 'receivedDateTime desc', '$select': fields }).toString();
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="html"' },
    redirect: 'manual',
    signal,
  });
  if (response.status >= 300 && response.status < 400) throw new MailError('UPSTREAM_REDIRECT', '微软邮件端点返回了意外跳转，请稍后重试。', 502);
  const data = await boundedJSON(response);
  if (!response.ok) throw upstreamError(response, data, 'graph');
  if (!Array.isArray(data.value)) throw new MailError('GRAPH_RESPONSE', '微软返回的邮件列表格式异常。', 502);
  const messages = [];
  for (const item of data.value.slice(0, input.count)) {
    let body = input.includeBody ? item.body?.content || '' : '';
    let html = '';
    if (input.includeBody && item.body?.contentType?.toLowerCase() === 'html') {
      html = body;
      body = htmlText(body.slice(0, MAX_MESSAGE_BYTES));
    }
    const sender = item.from?.emailAddress;
    messages.push(normalizeMessage({ id: item.id, subject: item.subject, from: sender?.name ? `${sender.name} <${sender.address || ''}>` : sender?.address, date: item.receivedDateTime, isRead: item.isRead, preview: item.bodyPreview, body, html }));
  }
  return { messages, warning: data['@odata.nextLink'] ? '微软返回了部分邮件；此验证页仅展示本次返回的最近一页。' : '' };
}

export async function readImap(input, accessToken, { signal, createImap = options => new ImapFlow(options) }) {
  const client = createImap({
    host: 'outlook.office365.com', port: 993, secure: true,
    auth: { user: input.email, accessToken },
    logger: false, emitLogs: false, logRaw: false, disableAutoIdle: true,
    connectionTimeout: 12000, greetingTimeout: 10000, socketTimeout: 12000,
  });
  client.on('error', () => {});
  const close = () => client.close();
  signal.addEventListener('abort', close, { once: true });
  let lock;
  try {
    signal.throwIfAborted();
    await client.connect();
    let folder = 'INBOX';
    if (input.folder === 'junkemail') {
      const folders = await client.list();
      folder = folders.find(item => item.specialUse === '\\Junk')?.path || folders.find(item => /^(junk|junk email|垃圾邮件)$/i.test(item.path))?.path;
      if (!folder) throw new MailError('IMAP_FOLDER', '没有找到垃圾邮件文件夹，请先尝试收件箱。', 422);
    }
    lock = await client.getMailboxLock(folder, { readOnly: true });
    const total = client.mailbox.exists;
    if (!total) return { messages: [], warning: '' };
    const rows = await client.fetchAll(`${Math.max(1, total - input.count + 1)}:${total}`, { envelope: true, flags: true, size: true, internalDate: true });
    rows.sort((a, b) => b.uid - a.uid);
    const messages = [];
    let downloadedBytes = 0;
    for (const row of rows) {
      signal.throwIfAborted();
      let body = '';
      let html = '';
      let note = '';
      if (input.includeBody) {
        if (row.size > MAX_MESSAGE_BYTES || downloadedBytes >= MAX_IMAP_BYTES || downloadedBytes + row.size > MAX_IMAP_BYTES) note = '邮件或本次读取总量过大，仅显示邮件头；可减少数量后重试。';
        else {
          const remaining = Math.min(MAX_MESSAGE_BYTES, MAX_IMAP_BYTES - downloadedBytes);
          const full = await client.fetchOne(row.uid, { source: { maxLength: remaining + 1 } }, { uid: true });
          if (full?.source?.length > remaining) note = '邮件超过本次大小上限，仅显示邮件头。';
          else if (full?.source) {
            downloadedBytes += full.source.length;
            try {
              const parsed = await PostalMime.parse(full.source);
              html = parsed.html || '';
              body = parsed.text || (html ? htmlText(html.slice(0, MAX_MESSAGE_BYTES)) : '');
            }
            catch { note = '此邮件正文无法解析，邮件头仍可查看。'; }
          } else note = '邮件已被移动或删除，正文未能读取。';
        }
      }
      const sender = row.envelope?.from?.[0];
      messages.push(normalizeMessage({ id: row.uid, subject: row.envelope?.subject, from: sender?.name ? `${sender.name} <${sender.address || ''}>` : sender?.address, date: (row.internalDate || row.envelope?.date)?.toISOString?.() || null, isRead: row.flags?.has('\\Seen'), preview: body.slice(0, 200), body, html, note }));
    }
    return { messages, warning: input.includeBody ? '' : 'IMAP 摘要模式读取主题、发件人和时间；开启正文后可查看内容与验证码。' };
  } catch (error) {
    if (signal.aborted) throw new MailError('TIMEOUT', '读取超时，请减少数量，或稍后重试。', 504);
    if (error instanceof MailError) throw error;
    if (error.authenticationFailed || error.name === 'AuthenticationFailure') throw new MailError('IMAP_AUTH', 'IMAP 授权失败，请检查邮箱与令牌是否匹配，以及 Outlook 设置中是否已开启 IMAP。', 422);
    throw new MailError('IMAP_CONNECTION', '无法完成 IMAP 连接或读取。请检查邮箱的 IMAP 设置与授权，也可切换 Graph 重试。', 502);
  } finally {
    lock?.release();
    signal.removeEventListener('abort', close);
    // This is a short, read-only request; close the socket without an IDLE session.
    client.close();
  }
}

export function publicError(error) {
  if (error instanceof MailError) return error;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return new MailError('TIMEOUT', '请求超时或已取消，请稍后重试。', 504);
  return new MailError('NETWORK', '连接 Microsoft 失败，请稍后重试。', 502);
}

export async function readMail(raw, { fetcher = fetch, imapReader = readImap, signal = AbortSignal.timeout(45000) } = {}) {
  const input = validateRequest(raw);
  const state = { refreshToken: input.refreshToken };
  const attempts = [];
  const protocols = input.protocol === 'auto' ? ['graph', 'imap'] : [input.protocol];
  for (let index = 0; index < protocols.length; index++) {
    const protocol = protocols[index];
    try {
      const token = await refreshAccess(input, protocol, state, fetcher, signal);
      const result = await (protocol === 'graph' ? readGraph(input, token, { fetcher, signal }) : imapReader(input, token, { signal }));
      attempts.push({ protocol, ok: true, code: 'OK', message: '读取成功' });
      return { email: input.email, protocol, folder: input.folder, scanned: result.messages.length, messages: filterMessages(result.messages, input.keyword), keyword: input.keyword, warning: result.warning, attempts, refreshedToken: state.refreshToken !== input.refreshToken ? state.refreshToken : null };
    } catch (caught) {
      const error = publicError(caught);
      attempts.push({ protocol, ok: false, code: error.code, message: error.message });
      if (index === protocols.length - 1 || error.status === 429 || error.status >= 500 || error.status === 413) {
        error.attempts = attempts;
        error.refreshedToken = state.refreshToken !== input.refreshToken ? state.refreshToken : null;
        throw error;
      }
    }
  }
}
