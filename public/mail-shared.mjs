export class MailError extends Error {
  constructor(code, message, status = 400, retryAfter = null) {
    super(message);
    this.name = 'MailError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function parseAccount(line) {
  if (typeof line !== 'string' || !line.trim()) throw new MailError('INPUT_EMPTY', '请先粘贴一条邮箱账号信息。');
  if (line.length > 32768) throw new MailError('INPUT_SIZE', '账号信息过长，请检查是否粘贴了多条记录。');
  if (/[\r\n]/.test(line.trim())) throw new MailError('INPUT_MULTIPLE', '当前验证页一次读取一个邮箱，请只粘贴一行。');
  const match = line.trim().match(/^([^\s@]+@[^\s@]+?\.[^\s@]+?)----(.*?)----([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|[a-f\d]{16})----(\S+)$/i);
  if (!match) throw new MailError('INPUT_FORMAT', '格式应为 email----password----client_id----refresh_token；client_id 通常是应用的 UUID。');
  return { email: match[1], password: match[2], clientId: match[3], refreshToken: match[4] };
}

export function validateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MailError('INPUT_FORMAT', '请求格式不正确。');
  const { email, clientId, refreshToken } = input;
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new MailError('INPUT_EMAIL', '邮箱地址格式不正确。');
  if (typeof clientId !== 'string' || !/^([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|[a-f\d]{16})$/i.test(clientId)) throw new MailError('INPUT_CLIENT', 'client_id 格式不正确。');
  if (typeof refreshToken !== 'string' || !refreshToken.length || refreshToken.length > 24000 || /\s/.test(refreshToken)) throw new MailError('INPUT_TOKEN', 'refresh_token 不能为空、包含空白或超过长度限制。');
  const count = input.count ?? 5;
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new MailError('INPUT_COUNT', '读取数量须为 1–30 封。');
  const protocol = input.protocol ?? 'auto';
  if (!['auto', 'graph', 'imap'].includes(protocol)) throw new MailError('INPUT_PROTOCOL', '请选择自动、Graph 或 IMAP。');
  const folder = input.folder ?? 'inbox';
  if (!['inbox', 'junkemail'].includes(folder)) throw new MailError('INPUT_FOLDER', '请选择收件箱或垃圾邮件。');
  const tenant = input.tenant ?? 'consumers';
  if (!['consumers', 'common'].includes(tenant)) throw new MailError('INPUT_TENANT', '登录类型不正确。');
  if (input.includeBody !== undefined && typeof input.includeBody !== 'boolean') throw new MailError('INPUT_BODY', '正文选项格式不正确。');
  if (input.keyword !== undefined && (typeof input.keyword !== 'string' || input.keyword.length > 200)) throw new MailError('INPUT_KEYWORD', '关键词不能超过 200 字。');
  // The password stays in the browser and is never used or passed upstream.
  return { email, clientId, refreshToken, count, protocol, folder, tenant, includeBody: input.includeBody ?? true, keyword: (input.keyword ?? '').trim() };
}

export function extractCodes(text) {
  const codes = new Set();
  const pattern = /(?:验证码|校验码|安全代码|安全码|确认码|verification\s+code|security\s+code|one[ -]time\s+(?:code|password)|\botp\b|\bcode\b)[^\d\r\n]{0,55}(\d{4,8})(?!\d)/gi;
  for (const match of text.matchAll(pattern)) codes.add(match[1]);
  return [...codes].slice(0, 5);
}

export function filterMessages(messages, keyword) {
  const term = keyword.toLowerCase();
  return messages.filter(message => !term || [message.subject, message.from, message.preview, message.body].some(value => String(value || '').toLowerCase().includes(term)));
}
