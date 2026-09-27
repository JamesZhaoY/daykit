import { build } from 'esbuild';
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const pages = process.argv.includes('--pages');
const outputDirectory = pages ? 'dist-pages' : 'dist';
const requestedBase = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) ?? process.env.DAYKIT_BASE_PATH ?? '/';
const basePath = requestedBase === '' || requestedBase === '/' ? '/' : `${requestedBase.replace(/\/$/, '')}/`;
if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(basePath) || basePath.split('/').some(part => part === '.' || part === '..')) {
  throw new Error('Base path must be a site path such as /daykit/ or /.');
}
if (!pages && basePath !== '/') throw new Error('Use --pages when building for a site subdirectory.');
await rm(outputDirectory, { recursive: true, force: true });
await cp('public', outputDirectory, {
  recursive: true,
  filter: source => !['.js', '.mjs', '.css'].includes(extname(source)),
});

// Give the browser worker a versioned URL before bundling its UI entry point.
const workerResult = await build({
  entryPoints: ['public/regex-worker.js', 'public/cron-core.mjs'],
  outdir: `${outputDirectory}/assets`,
  entryNames: '[name]-[hash]',
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  metafile: true,
});
const workerOutput = Object.keys(workerResult.metafile.outputs).find(path => path.includes('regex-worker-'));
const workerURL = `${basePath}${relative(outputDirectory, workerOutput).replaceAll('\\', '/')}`;
const cronOutput = Object.keys(workerResult.metafile.outputs).find(path => path.includes('cron-core-'));
const cronWorkerURL = `${basePath}${relative(outputDirectory, cronOutput).replaceAll('\\', '/')}`;

const result = await build({
  entryPoints: ['public/app.js', 'public/styles.css', 'public/network.css', 'public/mail-preview.css', 'public/diff.css', 'public/regex.css', 'public/jwt.css', 'public/config.css', 'public/cron.css', 'public/curl.css'],
  outdir: `${outputDirectory}/assets`,
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  splitting: true,
  bundle: true,
  minify: true,
  format: 'esm',
  define: {
    __REGEX_WORKER_URL__: JSON.stringify(workerURL),
    __CRON_WORKER_URL__: JSON.stringify(cronWorkerURL),
    __BASE_PATH__: JSON.stringify(basePath),
    __STATIC_ONLY__: String(pages),
  },
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  metafile: true,
});

// Rewrite every page to use immutable, content-addressed browser assets.
const replacements = Object.entries(result.metafile.outputs)
  .filter(([, info]) => info.entryPoint)
  .map(([output, info]) => [
    `/${relative('public', info.entryPoint).replaceAll('\\', '/')}`,
    `/${relative(outputDirectory, output).replaceAll('\\', '/')}`,
  ]);
for (const path of await readdir(outputDirectory, { recursive: true })) {
  if (!path.endsWith('.html')) continue;
  let html = await readFile(`${outputDirectory}/${path}`, 'utf8');
  for (const [source, output] of replacements) html = html.replaceAll(`"${source}"`, `"${output}"`);
  if (pages) {
    html = html.replace(/\b(href|src)="\/(?!\/)([^"\n]*)"/g, (_match, attribute, value) => `${attribute}="${basePath}${value}"`);
    html = html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">\n  <meta name="referrer" content="no-referrer">`);
    html = html.replace('<title>', '<title>[静态版] ');
    if (path === 'index.html') html = html.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="日用 Daykit 静态版：JSON、时间戳、编码、Diff、正则、JWT、配置转换、Cron、cURL，9 个浏览器本地工具。">');
  }
  await writeFile(`${outputDirectory}/${path}`, html);
}

if (pages) {
  await rm(`${outputDirectory}/_headers`, { force: true });
  await writeFile(`${outputDirectory}/.nojekyll`, '');
}

for (const output of [...Object.keys(workerResult.metafile.outputs), ...Object.keys(result.metafile.outputs)]) {
  const content = await readFile(output);
  console.log(`${output}: ${(content.length / 1024).toFixed(1)} KiB, gzip ${(gzipSync(content).length / 1024).toFixed(1)} KiB`);
}
console.log(`${pages ? 'GitHub Pages static site' : 'Workers static assets'} ready in ${outputDirectory}/ (base: ${basePath}).`);
