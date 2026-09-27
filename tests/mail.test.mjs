import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAccount, validateRequest, extractCodes } from '../public/mail-shared.mjs';
import { readMail, readImap } from '../worker/mail.mjs';
import { createHandler } from '../worker/index.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const input = { email: 'reader@example.com', clientId: id, refreshToken: 'fake-test-refresh', count: 2, protocol: 'auto', folder: 'inbox', tenant: 'consumers', includeBody: true, keyword: '' };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const signal = () => AbortSignal.timeout(3000);

test('account parser preserves delimiter-containing passwords/tokens and validation drops password', () => {
  const row = parseAccount(`reader@example.com----pass----word----${id}----token----tail`);
  assert.equal(row.password, 'pass----word');
  assert.equal(row.refreshToken, 'token----tail');
  assert.equal(validateRequest(row).password, undefined);
  assert.equal(parseAccount(`reader@example.com--------${id}----token`).password, '');
  for (const bad of ['', 'broken', `reader@example.com----pass----${id}----one\nsecond`]) assert.throws(() => parseAccount(bad));
  for (const bad of [{ count: 31 }, { count: 1.5 }, { tenant: '../../evil' }, { protocol: 'smtp' }, { folder: 'trash' }, { refreshToken: 'bad token' }, { email: 'bad' }]) assert.throws(() => validateRequest({ ...input, ...bad }));
});

test('code extraction requires relevant context and preserves leading zeros', () => {
  assert.deepEqual(extractCodes('验证码是：004821\nSecurity code: 728196\nDate 20260925\n订单 123456789012'), ['004821', '728196']);
  assert.deepEqual(extractCodes('订单号 123456，电话 13800138000'), []);
  assert.deepEqual(extractCodes('验证码 482916\ncode: 482916'), ['482916']);
});

test('Graph preserves sanitized HTML and plain text, excludes password and returns rotated refresh token', async () => {
  const calls = [];
  const result = await readMail({ ...input, password: 'must-never-send', keyword: '中文' }, {
    signal: signal(),
    fetcher: async (url, options) => {
      calls.push([String(url), options]);
      if (calls.length === 1) return json({ access_token: 'fake-access', refresh_token: 'fake-new-refresh' });
      return json({ value: [{ id: '1', subject: '中文邮件', from: { emailAddress: { name: '测试', address: 'sender@example.com' } }, receivedDateTime: '2026-09-25T00:00:00Z', body: { contentType: 'html', content: '<p>验证码：482916</p><script>alert(1)</script><img src="https://tracking.example/pixel">' } }] });
    },
  });
  assert.equal(result.protocol, 'graph');
  assert.equal(result.refreshedToken, 'fake-new-refresh');
  assert.deepEqual(result.messages[0].codes, ['482916']);
  assert.doesNotMatch(result.messages[0].body, /script|alert|tracking/);
  assert.equal(result.messages[0].html, '<p>验证码：482916</p>');
  const tokenBody = calls[0][1].body;
  assert.equal(tokenBody.get('grant_type'), 'refresh_token');
  assert.equal(tokenBody.get('password'), null);
  assert.match(tokenBody.get('scope'), /graph.microsoft.com\/Mail.Read/);
  assert.match(calls[1][0], /\/me\/mailFolders\/inbox\/messages/);
  assert.equal(calls[1][1].headers.Prefer, 'outlook.body-content-type="html"');
});

test('automatic fallback uses the latest refresh token and IMAP-specific scope', async () => {
  let call = 0;
  const result = await readMail(input, {
    signal: signal(),
    fetcher: async (_url, options) => {
      call++;
      if (call === 1) return json({ access_token: 'graph-access', refresh_token: 'new-after-graph' });
      if (call === 2) return json({ error: { code: 'ErrorAccessDenied' } }, 403);
      assert.equal(options.body.get('refresh_token'), 'new-after-graph');
      assert.match(options.body.get('scope'), /IMAP.AccessAsUser.All/);
      return json({ access_token: 'imap-access', refresh_token: 'new-after-imap' });
    },
    imapReader: async (request, token) => { assert.equal(request.email, input.email); assert.equal(token, 'imap-access'); return { messages: [], warning: '' }; },
  });
  assert.equal(call, 3);
  assert.equal(result.protocol, 'imap');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.refreshedToken, 'new-after-imap');
});

test('throttling does not trigger a second protocol and upstream secrets do not leak', async () => {
  let calls = 0;
  await assert.rejects(readMail(input, { signal: signal(), fetcher: async () => { calls++; return json({ error: 'slow_down', error_description: 'do-not-leak-this-value' }, 429, { 'Retry-After': '17' }); } }), error => error.code === 'THROTTLED' && error.retryAfter === 17 && !error.message.includes('do-not-leak'));
  assert.equal(calls, 1);
  await assert.rejects(readMail({ ...input, protocol: 'graph' }, { signal: signal(), fetcher: async () => json({ error: 'invalid_grant', error_description: 'do-not-leak-token AADSTS700082' }, 400) }), error => error.code.includes('700082') && !error.message.includes('do-not-leak'));
});

test('a rotated token is recoverable even when reading messages fails', async () => {
  let calls = 0;
  await assert.rejects(readMail({ ...input, protocol: 'graph' }, { signal: signal(), fetcher: async () => ++calls === 1 ? json({ access_token: 'a', refresh_token: 'replacement' }) : json({ error: { code: 'ErrorAccessDenied' } }, 403) }), error => error.refreshedToken === 'replacement');
});

test('OAuth redirects are rejected without forwarding credentials or falling back', async () => {
  let calls = 0;
  await assert.rejects(readMail(input, { signal: signal(), fetcher: async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://unrelated.example/' } });
  } }), error => error.code === 'UPSTREAM_REDIRECT');
  assert.equal(calls, 1);
});

test('IMAP selects read-only, fetches by UID, parses HTML MIME, and always closes', async () => {
  let closed = false;
  let released = false;
  const source = Buffer.from('Subject: Test\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>验证码：004821</p>');
  const client = {
    on() {}, close() { closed = true; }, async connect() {}, mailbox: { exists: 10 },
    async getMailboxLock(folder, options) { assert.equal(folder, 'INBOX'); assert.equal(options.readOnly, true); return { release() { released = true; } }; },
    async fetchAll(range) { assert.equal(range, '9:10'); return [{ uid: 17, size: source.length, flags: new Set(), envelope: { subject: 'Test', from: [{ address: 'sender@example.com' }] } }]; },
    async fetchOne(uid, _query, options) { assert.equal(uid, 17); assert.equal(options.uid, true); return { source }; },
  };
  const result = await readImap(input, 'access', { signal: signal(), createImap: options => { assert.equal(options.secure, true); assert.equal(options.logger, false); assert.equal(options.auth.accessToken, 'access'); return client; } });
  assert.deepEqual(result.messages[0].codes, ['004821']);
  assert.equal(result.messages[0].html.trim(), '<p>验证码：004821</p>');
  assert.equal(result.messages[0].isRead, false);
  assert.equal(closed, true);
  assert.equal(released, true);
});

test('Worker API restricts origin, validates JSON, prevents caching and does not expose errors', async () => {
  let called = 0;
  const handler = createHandler(async data => { called++; validateRequest(data); return { messages: [], protocol: 'graph' }; });
  const make = (body, extra = {}) => new Request('https://daykit.example/api/outlook/read', { method: 'POST', headers: { Origin: 'https://daykit.example', 'Content-Type': 'application/json', 'X-Daykit-Client': 'mail-reader', ...extra }, body: JSON.stringify(body) });
  assert.equal((await handler(make(input, { Origin: 'https://other.example' }))).status, 403);
  assert.equal(called, 0);
  const valid = await handler(make(input));
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('cache-control'), 'no-store');
  assert.equal(valid.headers.get('access-control-allow-origin'), null);
  assert.equal((await handler(make({ ...input, count: 100 }))).status, 400);
  const invalidJSON = new Request('https://daykit.example/api/outlook/read', { method: 'POST', headers: { Origin: 'https://daykit.example', 'Content-Type': 'application/json', 'X-Daykit-Client': 'mail-reader' }, body: '{bad' });
  assert.equal((await handler(invalidJSON)).status, 400);
  const oversized = await handler(make({ ...input, unknown: 'x'.repeat(70000) }));
  assert.equal(oversized.status, 413);
  assert.equal((await handler(new Request('https://daykit.example/api/outlook/read'))).status, 405);
  const failure = await createHandler(async () => { throw new Error('secret-value'); })(make(input));
  assert.ok(!(await failure.text()).includes('secret-value'));
});
