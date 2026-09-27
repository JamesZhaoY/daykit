import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseCurl, generateCurlCode } from '../public/curl.js';

test('Python code is valid and keeps UTF-8 body, escaping, headers and repeated query values', () => {
  const request = parseCurl(`curl 'https://example.com/?a=1&a=2' -L -H 'X-Test: "quoted"' --data-raw '中文 😀 \\path\n"quote"'`);
  const { python } = generateCurlCode(request);
  const harness = `import sys, types, json\ncaptured = {}\ndef request(**kwargs):\n    captured.update(kwargs)\n    return types.SimpleNamespace(status_code=200, text="ok")\nsys.modules["requests"] = types.SimpleNamespace(request=request)\nexec(${JSON.stringify(python)})\ncaptured["data"] = captured["data"].decode("utf-8")\nprint(json.dumps(captured))`;
  const result = spawnSync('python3', ['-c', harness], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const captured = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(captured.url, request.url);
  assert.equal(captured.data, request.body);
  assert.equal(captured.allow_redirects, true);
  assert.deepEqual(captured.headers, Object.fromEntries(request.headers));
});
