import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMailHTML, readGraph, readImap } from '../worker/mail.mjs';

test('email sanitizer preserves tables, typography and safe inline spacing', () => {
  const clean = sanitizeMailHTML('<h2 style="color:#344f3e;font-size:24px;font-weight:600">验证码</h2><table cellpadding="12"><tbody><tr><td colspan="2" style="background-color:rgb(240,244,233);padding:12px 8px;text-align:center">004821</td></tr></tbody></table><blockquote>说明 <strong>加粗</strong></blockquote>');
  assert.match(clean, /<h2 style="color:#344f3e;font-size:24px;font-weight:600">验证码<\/h2>/);
  assert.match(clean, /<table cellpadding="12"><tbody><tr><td colspan="2"/);
  assert.match(clean, /background-color:rgb\(240,244,233\);padding:12px 8px;text-align:center/);
  assert.match(clean, /<blockquote>说明 <strong>加粗<\/strong><\/blockquote>/);
});

test('email sanitizer removes scripts, navigation, trackers, forms and URL attributes', () => {
  const clean = sanitizeMailHTML(`<html><head><base href="https://tracking.example"><meta http-equiv="refresh" content="0;url=https://tracking.example"><link rel="stylesheet" href="https://tracking.example/style"></head><body background="https://tracking.example/bg"><script>alert(1)</script><iframe srcdoc="x" src="https://tracking.example/frame"></iframe><object data="https://tracking.example/object"></object><video poster="https://tracking.example/poster"></video><img src="https://tracking.example/pixel" srcset="https://tracking.example/pixel2 2x" onerror="alert(1)"><form action="https://tracking.example/form"><input autofocus onfocus="alert(1)"><button formaction="https://tracking.example/submit">提交</button></form><a href="javascript:alert(1)" target="_top" ping="https://tracking.example/ping">正文链接</a><a href="https://tracking.example/open" download>下载</a><p id="mail-account" name="location" onclick="alert(1)">安全文字</p></body></html>`);
  assert.doesNotMatch(clean, /tracking|alert|href|src|ping|action|target|download|script|iframe|object|video|img|form|input|button|autofocus|onfocus|onclick|http-equiv|\bid=|\bname=/i);
  assert.match(clean, /<a>正文链接<\/a><a>下载<\/a><p>安全文字<\/p>/);
});

test('email styles cannot fetch URLs, import fonts, hide overlays or escape their declarations', () => {
  const clean = sanitizeMailHTML(`<style>@import url(https://tracking.example/sheet);@font-face{font-family:evil;src:url(https://tracking.example/font)}</style><p style="color:#123456;position:fixed;inset:0;z-index:999;background:url(https://tracking.example/a);background-image:image-set(url(https://tracking.example/b));list-style-image:url(https://tracking.example/c);cursor:url(https://tracking.example/d),auto;filter:url(https://tracking.example/e);--secret:url(https://tracking.example/f);font-family:Arial, sans-serif">正文</p><div style="background-color:expression(alert(1));color:var(--secret);border-color:u&#114;l(https://tracking.example/g);width:calc(100% + 4px)">尾部</div>`);
  assert.equal(clean, '<p style="color:#123456;font-family:Arial, sans-serif">正文</p><div>尾部</div>');
  assert.equal(sanitizeMailHTML('<p style="color: red; background-color: u\\72l(https://tracking.example)">文字</p>'), '<p style="color:red">文字</p>');
});

test('foreign-content and malformed-markup payloads remain non-executable', () => {
  for (const dirty of [
    '<svg><textarea><img src=x onerror=alert(1)></textarea></svg><p>安全</p>',
    '<math><xmp><img src=x onerror=alert(1)></xmp></math><p>安全</p>',
    '<svg><foreignObject><style><img src=x onerror=alert(1)></style></foreignObject></svg><p>安全</p>',
    '<a href="jav&#x09;ascript:alert(1)">链接</a><p>安全</p>',
    '<p style="color:red;bad:} &quot; onmouseover=&quot;alert(1)">安全</p>',
  ]) {
    const clean = sanitizeMailHTML(dirty);
    assert.doesNotMatch(clean, /<(?:svg|math|img|script|style|iframe|object)|\s(?:src|href|onerror|onmouseover)=/i);
  }
  assert.equal(sanitizeMailHTML('<p title="&quot; onmouseover=alert(1)">安全</p>'), '<p title="&quot; onmouseover=alert(1)">安全</p>');
});

test('Graph plain-text and summary responses never accidentally become HTML', async () => {
  const input = { folder: 'inbox', count: 1, includeBody: true };
  const read = includeBody => readGraph({ ...input, includeBody }, 'fake-access', { signal: AbortSignal.timeout(3000), fetcher: async () => new Response(JSON.stringify({ value: [{ id: '1', bodyPreview: '摘要', body: { contentType: 'text', content: '<img src=x onerror=alert(1)>' } }] })) });
  assert.deepEqual((await read(true)).messages.map(({ body, html }) => ({ body, html })), [{ body: '<img src=x onerror=alert(1)>', html: '' }]);
  assert.deepEqual((await read(false)).messages.map(({ body, html }) => ({ body, html })), [{ body: '', html: '' }]);
});

test('multipart IMAP messages retain the plain-text alternative and sanitized HTML', async () => {
  const source = Buffer.from('MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=daykit-test\r\n\r\n--daykit-test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n验证码：004821\r\n--daykit-test\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<h2>验证码：004821</h2><img src="https://tracking.example/pixel"><script>alert(1)</script>\r\n--daykit-test--');
  const client = { on() {}, close() {}, async connect() {}, mailbox: { exists: 1 }, async getMailboxLock() { return { release() {} }; }, async fetchAll() { return [{ uid: 1, size: source.length, flags: new Set(), envelope: {} }]; }, async fetchOne() { return { source }; } };
  const result = await readImap({ email: 'test@example.com', folder: 'inbox', count: 1, includeBody: true }, 'fake-access', { signal: AbortSignal.timeout(3000), createImap: () => client });
  assert.equal(result.messages[0].body.trim(), '验证码：004821');
  assert.equal(result.messages[0].html.trim(), '<h2>验证码：004821</h2>');
});

test('large HTML is clipped before sanitizing so no partial executable markup survives', async () => {
  const result = await readGraph({ folder: 'inbox', count: 1, includeBody: true }, 'fake-access', { signal: AbortSignal.timeout(3000), fetcher: async () => new Response(JSON.stringify({ value: [{ id: '1', body: { contentType: 'html', content: `<div>${'字'.repeat(160100)}<script>alert(1)</script></div>` } }] })) });
  assert.ok(result.messages[0].html.length <= 160010);
  assert.match(result.messages[0].note, /截断/);
  assert.doesNotMatch(result.messages[0].html, /script|alert/);
});
