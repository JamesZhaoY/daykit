import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { parseCurl, tokenizeCurl, generateCurlCode, MAX_CURL_BYTES } from '../public/curl.js';

test('parses browser cURL, continuation, quoting, duplicate query parameters and JSON bytes', () => {
  const request = parseCurl(`curl 'https://api.example.com/items?tag=dev&tag=tools' \\\n    -X POST \\\n    -H 'Content-Type: application/json' \\\n    --data-raw '{"hello":"中文 😀","price":"$5"}'`);
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.query, [['tag', 'dev'], ['tag', 'tools']]);
  assert.equal(request.body, '{"hello":"中文 😀","price":"$5"}');
  assert.deepEqual(request.headers, [['Content-Type', 'application/json']]);
  assert.equal(request.followRedirects, false);
  assert.deepEqual(tokenizeCurl(`curl 'https://example.com' --data-raw 'it'\"'\"'s'`), ['https://example.com', '--data-raw', "it's"]);
  assert.deepEqual(tokenizeCurl('curl https://example.com \\\r\n -H "X-Path: a\\qb"'), ['https://example.com', '-H', 'X-Path: a\\qb']);
  assert.equal(parseCurl('curl https://example.com --data-raw "\\$literal"').body, '$literal');
});

test('preserves data modes, empty body, -G queries, HEAD and JSON concatenation', () => {
  assert.equal(parseCurl('curl https://example.com -d a=1 -d a=2').body, 'a=1&a=2');
  assert.equal(parseCurl("curl https://example.com --data-raw '@literal'").body, '@literal');
  assert.equal(parseCurl("curl https://example.com -d ''").body, '');
  assert.equal(parseCurl("curl https://example.com -d ''").method, 'POST');
  assert.equal(parseCurl("curl https://example.com --data-binary 'a\nb'").body, 'a\nb');
  const get = parseCurl("curl -GI 'https://example.com/?q=old#part' --data-urlencode 'q=hello 中文!' --data-urlencode '=a/b'");
  assert.equal(get.url, 'https://example.com/?q=old&q=hello%20%E4%B8%AD%E6%96%87%21&a%2Fb#part');
  assert.equal(get.method, 'HEAD');
  assert.equal(get.body, null);
  assert.deepEqual(get.query, [['q', 'old'], ['q', 'hello 中文!'], ['a/b', '']]);
  const json = parseCurl(`curl https://example.com --json '{"a":' --json '1}' -H 'Accept: text/plain'`);
  assert.equal(json.body, '{"a":1}');
  assert.deepEqual(json.headers, [['Accept', 'text/plain'], ['Content-Type', 'application/json']]);
  assert.equal(new Map(parseCurl("curl -G https://example.com --json '1'").headers).get('Content-Type'), 'application/json');
  assert.equal(parseCurl('curl -sSLI --url=https://example.com').followRedirects, true);
  assert.equal(parseCurl('curl -L --no-location https://example.com').followRedirects, false);
  assert.equal(parseCurl('curl -XPUT --url https://example.com -dfoo').method, 'PUT');
});

test('auth, cookies and browser controlled headers are explicit', () => {
  const request = parseCurl("curl https://example.com -u 'alice:pa:ss' -b 'sid=abc; theme=dark' -A 'App/1.0' -e 'https://example.net/' --compressed");
  assert.equal(new Map(request.headers).get('Authorization'), `Basic ${btoa('alice:pa:ss')}`);
  assert.equal(new Map(request.headers).get('Cookie'), 'sid=abc; theme=dark');
  assert(request.warnings.some(message => message.includes('Cookie 无法手动设置')));
  assert(request.warnings.some(message => message.includes('--compressed')));
  const explicit = parseCurl("curl https://example.com -u 'alice:password' -H 'Authorization: Bearer literal'");
  assert.equal(new Map(explicit.headers).get('Authorization'), 'Bearer literal');
  assert.deepEqual(parseCurl("curl https://example.com -H 'X-Empty;'").headers, [['X-Empty', '']]);
});

test('rejects dynamic shell syntax, commands, local files, unsupported and ambiguous semantics', () => {
  for (const input of [
    'curl https://example.com | cat', 'curl https://example.com; echo hi', 'curl https://example.com && echo hi',
    'curl https://example.com\necho hi', 'curl https://example.com > output', 'curl "$URL"',
    'curl $(whoami)', 'curl `whoami`', 'curl https://example.com -d $\'abc\'',
    'curl https://example.com -d @secret.txt', 'curl https://example.com --data-binary @-',
    "curl https://example.com --data-urlencode 'name@secret.txt'", 'curl https://example.com -H @headers',
    'curl https://example.com -F upload=@file', 'curl https://example.com --config config',
    'curl https://example.com --proxy http://proxy', 'curl -k https://example.com',
    'curl https://one.example https://two.example', "curl 'https://example.com/{one,two}'",
    "curl https://example.com -H 'X-Test: a' -H 'x-test: b'", "curl https://example.com -H 'Accept:'",
    'curl https://example.com -b cookies.txt', 'curl https://example.com -u alice',
    'curl https://alice:pass@example.com', 'curl ftp://example.com', "curl https://example.com -H 'X-Test: a\nb'",
    "curl -I https://example.com -d 'a=1'", "curl -G https://example.com -d 'q=a b'", "curl -G https://example.com -d 'q=#part'",
    "curl https://example.com --json '{}' -d a=1", "curl https://example.com -H 'X-Test: 中文'",
    "curl 'https://example.com", 'curl https://example.com --data', 'curl https://example.com \\',
  ]) assert.throws(() => parseCurl(input), undefined, input);
  assert.throws(() => parseCurl('curl https://example.com -d ' + 'x'.repeat(MAX_CURL_BYTES)), /256 KB/);
  assert.equal(parseCurl("curl --globoff 'https://example.com/items?array[]=1'").query[0][0], 'array[]');
  assert.equal(parseCurl("curl 'https://[::1]/'").url, 'https://[::1]/');
  assert.equal(parseCurl("curl https://example.com --data-raw '$(never-run); | <script>'").body, '$(never-run); | <script>');
});

test('generated JavaScript preserves literal data when run against a stub, never during parsing', async () => {
  const request = parseCurl(`curl 'https://example.com/?a=1&a=2&quote=%22' -X PATCH -H 'X-Test: "quote"' --data-raw '中文 😀 \\path\n"quote" </script>'`);
  const code = generateCurlCode(request);
  let captured;
  const context = vm.createContext({ fetch: async (...args) => { captured = args; return { status: 200, text: async () => 'ok' }; }, console: { log() {} } });
  await vm.runInContext(`(async () => { ${code.javascript}\n })()`, context);
  assert.equal(captured[0], request.url);
  assert.equal(captured[1].body, request.body);
  assert.equal(captured[1].method, 'PATCH');
  assert.equal(captured[1].credentials, 'omit');
  assert.equal(captured[1].redirect, 'manual');
  assert.deepEqual(JSON.parse(JSON.stringify(captured[1].headers)), request.headers);
  const blocked = parseCurl("curl https://example.com -X GET -d 'body'");
  assert(blocked.fetchIssue);
  assert(!generateCurlCode(blocked).javascript.includes('await fetch('));
  assert(generateCurlCode(blocked).python.includes('data=body'));
});
