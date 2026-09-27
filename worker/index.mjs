import { MailError } from '../public/mail-shared.mjs';
import { boundedJSON, readMail, publicError } from './mail.mjs';
import { lookupIP, lookupDomain, NetworkError } from './network.mjs';

const API_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export function createHandler(reader = readMail, network = { ip: lookupIP, domain: lookupDomain }) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { ...API_HEADERS, ...headers } });
    const isMail = url.pathname === '/api/outlook/read';
    const networkKind = url.pathname === '/api/network/ip' ? 'ip' : url.pathname === '/api/network/domain' ? 'domain' : null;
    if (!isMail && !networkKind) return json({ error: { code: 'NOT_FOUND', message: '接口不存在。' } }, 404);
    if (request.method !== 'POST') return json({ error: { code: 'METHOD', message: '请使用 POST 请求。' } }, 405, { Allow: 'POST' });
    if (request.headers.get('origin') !== url.origin || request.headers.get('x-daykit-client') !== (isMail ? 'mail-reader' : 'network-tools')) return json({ error: { code: 'ORIGIN', message: '请从本站工具页面发起请求。' } }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: { code: 'CONTENT_TYPE', message: '请求必须使用 JSON。' } }, 415);
    try {
      if (Number(request.headers.get('content-length')) > 65536) throw new MailError('INPUT_SIZE', '请求内容过长。', 413);
      let input;
      try { input = await boundedJSON(request, 65536); }
      catch (error) { throw new MailError('INPUT_JSON', '请求 JSON 无效或内容超过 64 KB。', error.status === 413 ? 413 : 400); }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(isMail ? 45000 : 25000)]);
      const result = isMail ? await reader(input, { signal }) : await network[networkKind](input, { request, signal });
      return json(result);
    } catch (caught) {
      const error = caught instanceof MailError || caught instanceof NetworkError ? caught : isMail ? publicError(caught) : new NetworkError('NETWORK', '网络查询暂时失败，请稍后重试。', 502);
      const body = { error: { code: error.code, message: error.message } };
      if (isMail) Object.assign(body, { attempts: error.attempts || [], refreshedToken: error.refreshedToken || null });
      return json(body, error.status, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
    }
  };
}

export default { fetch: createHandler() };
