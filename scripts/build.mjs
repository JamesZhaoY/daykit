import { build } from 'esbuild';
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', {
  recursive: true,
  filter: source => !['.js', '.mjs', '.css'].includes(extname(source)),
});

// Give the browser worker a versioned URL before bundling its UI entry point.
const workerResult = await build({
  entryPoints: ['public/regex-worker.js', 'public/cron-core.mjs'],
  outdir: 'dist/assets',
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
const workerURL = `/${relative('dist', workerOutput).replaceAll('\\', '/')}`;
const cronOutput = Object.keys(workerResult.metafile.outputs).find(path => path.includes('cron-core-'));
const cronWorkerURL = `/${relative('dist', cronOutput).replaceAll('\\', '/')}`;

const result = await build({
  entryPoints: ['public/app.js', 'public/styles.css', 'public/network.css', 'public/mail-preview.css', 'public/diff.css', 'public/regex.css', 'public/jwt.css', 'public/config.css', 'public/cron.css', 'public/curl.css'],
  outdir: 'dist/assets',
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  splitting: true,
  bundle: true,
  minify: true,
  format: 'esm',
  define: { __REGEX_WORKER_URL__: JSON.stringify(workerURL), __CRON_WORKER_URL__: JSON.stringify(cronWorkerURL) },
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
    `/${relative('dist', output).replaceAll('\\', '/')}`,
  ]);
for (const path of await readdir('dist', { recursive: true })) {
  if (!path.endsWith('.html')) continue;
  let html = await readFile(`dist/${path}`, 'utf8');
  for (const [source, output] of replacements) html = html.replaceAll(`"${source}"`, `"${output}"`);
  await writeFile(`dist/${path}`, html);
}

for (const output of [...Object.keys(workerResult.metafile.outputs), ...Object.keys(result.metafile.outputs)]) {
  const content = await readFile(output);
  console.log(`${output}: ${(content.length / 1024).toFixed(1)} KiB, gzip ${(gzipSync(content).length / 1024).toFixed(1)} KiB`);
}
console.log('Workers static assets are ready in dist/.');
