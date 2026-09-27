import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';

const directory = new URL('../dist-pages/', import.meta.url);
const base = '/daykit/';

test('Pages HTML references existing resources under the project base path', async () => {
  const files = await readdir(directory, { recursive: true });
  const htmlFiles = files.filter(file => file.endsWith('.html'));
  assert.equal(htmlFiles.length, 14, 'homepage, 404 and twelve independent tool pages');
  for (const file of htmlFiles) {
    const html = await readFile(new URL(file, directory), 'utf8');
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /connect-src 'none'/);
    for (const [, url] of html.matchAll(/(?:src|href)="(\/[^" ]*)"/g)) {
      assert.ok(url.startsWith(base), `${file}: ${url} does not use the Pages prefix`);
      if (url.endsWith('/')) continue;
      await access(new URL(url.slice(base.length), directory));
    }
  }
  await access(new URL('.nojekyll', directory));
  await assert.rejects(access(new URL('_headers', directory)));
});

test('Pages browser workers use versioned URLs with the base path and source code is not exposed', async () => {
  const assets = await readdir(new URL('assets/', directory));
  const workerFiles = assets.filter(file => /^(regex-worker|cron-core)-.+\.js$/.test(file));
  assert.equal(workerFiles.length, 2);
  const scripts = (await Promise.all(assets.filter(file => file.endsWith('.js')).map(file => readFile(new URL(`assets/${file}`, directory), 'utf8')))).join('\n');
  for (const file of workerFiles) assert.ok(scripts.includes(`${base}assets/${file}`), `missing versioned worker URL for ${file}`);
  for (const file of ['app.js', 'regex-worker.js', 'cron-core.mjs', 'core.mjs', 'package.json', 'worker/index.mjs']) await assert.rejects(access(new URL(file, directory)));
});
