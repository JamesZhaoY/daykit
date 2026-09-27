import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.DAYKIT_TEST_URL || 'http://127.0.0.1:8787';
const request = (path, options = {}) => fetch(new URL(path, base), { signal: AbortSignal.timeout(10000), ...options });

test('Workers serves every independent page with a revalidated HTML response', async () => {
  for (const [path, page] of [['/', 'home'], ['/tools/json/', 'json'], ['/tools/timestamp/', 'timestamp'], ['/tools/encode/', 'encode'], ['/tools/outlook/', 'outlook'], ['/tools/ip/', 'ip'], ['/tools/domain/', 'domain'], ['/tools/diff/', 'diff'], ['/tools/regex/', 'regex'], ['/tools/jwt/', 'jwt'], ['/tools/config/', 'config'], ['/tools/cron/', 'cron'], ['/tools/curl/', 'curl']]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('cache-control'), /max-age=0/);
    assert.match(response.headers.get('cache-control'), /must-revalidate/);
    assert.ok(response.headers.get('etag'));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    if (page === 'outlook') {
      assert.match(response.headers.get('content-security-policy'), /style-src 'self' 'unsafe-inline'/);
      assert.match(response.headers.get('content-security-policy'), /frame-src 'self'/);
      assert.ok(!response.headers.get('content-security-policy').includes(','), 'mail CSP must replace, rather than append to, the default policy');
    } else assert.ok(!response.headers.get('content-security-policy').includes('unsafe-inline'));
    const html = await response.text();
    assert.ok(html.includes(`data-page="${page}"`));
    assert.match(html, /src="\/assets\/app-[\w-]+\.js"/);
    assert.match(html, /href="\/assets\/styles-[\w-]+\.css"/);
  }
});

test('content-hashed JS/CSS loads with correct MIME types, immutable caching and ETags', async () => {
  const html = await (await request('/')).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
  assert.equal(assets.length, 2);
  for (const path of assets) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('cache-control'), /max-age=31536000/);
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.doesNotMatch(response.headers.get('cache-control'), /max-age=0/);
    assert.match(response.headers.get('content-type'), path.endsWith('.js') ? /javascript/ : /text\/css/);
    const etag = response.headers.get('etag');
    assert.ok(etag);
    assert.equal((await request(path, { headers: { 'If-None-Match': etag } })).status, 304);
  }
});

test('canonical redirects preserve queries; invalid routes produce a real 404', async () => {
  for (const path of ['/tools/json', '/tools/json/index.html']) {
    const response = await request(`${path}?source=bookmark`, { redirect: 'manual' });
    assert.ok([301, 302, 307, 308].includes(response.status));
    const location = new URL(response.headers.get('location'), base);
    assert.equal(location.pathname, '/tools/json/');
    assert.equal(location.search, '?source=bookmark');
  }
  for (const path of ['/missing-tool', '/tools/missing/', '/_headers', '/package.json', '/core.mjs']) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    const html = await response.text();
    assert.match(html, /这个页面走丢了/);
    assert.ok(!html.includes('data-page="home"'), 'unknown routes must not return the homepage');
  }
});

test('mail API runs in Workers, requires same-origin POST and rejects invalid input without upstream access', async () => {
  const get = await request('/api/outlook/read');
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('cache-control'), 'no-store');
  assert.equal(get.headers.get('allow'), 'POST');
  const forbidden = await request('/api/outlook/read', { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json', 'X-Daykit-Client': 'mail-reader' }, body: '{}' });
  assert.equal(forbidden.status, 403);
  const invalid = await request('/api/outlook/read', { method: 'POST', headers: { Origin: new URL(base).origin, 'Content-Type': 'application/json', 'X-Daykit-Client': 'mail-reader' }, body: '{}' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INPUT_EMAIL');
  assert.equal(invalid.headers.get('cache-control'), 'no-store');
});

test('network APIs require same-origin POST and reject private addresses and local domains', async () => {
  for (const [kind, input] of [['ip', { ip: '127.0.0.1' }], ['domain', { domain: 'test.localhost' }]]) {
    const path = `/api/network/${kind}`;
    assert.equal((await request(path)).status, 405);
    const forbidden = await request(path, { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json', 'X-Daykit-Client': 'network-tools' }, body: JSON.stringify(input) });
    assert.equal(forbidden.status, 403);
    const invalid = await request(path, { method: 'POST', headers: { Origin: new URL(base).origin, 'Content-Type': 'application/json', 'X-Daykit-Client': 'network-tools' }, body: JSON.stringify(input) });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.headers.get('cache-control'), 'no-store');
    assert.ok((await invalid.json()).error.code.startsWith('PRIVATE_'));
  }
});
