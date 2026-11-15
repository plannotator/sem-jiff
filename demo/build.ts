// Builds the demo into demo/dist. The page is bundled against a local build of
// @pierre/diffs (packages/diffs/dist), passed as the first argument.
// Usage: node demo/build.ts <path-to-pierre-checkout>/packages/diffs/dist/index.js
//        node demo/data.ts <dataset.json>     (writes demo/dist/cases.json)
//        npx serve demo/dist                  (or any static server)
import fs from 'node:fs';
import * as esbuild from 'esbuild';

const pierre = process.argv[2];
if (!pierre || !fs.existsSync(pierre)) throw new Error('usage: node demo/build.ts <pierre>/packages/diffs/dist/index.js');
const dist = new URL('./dist/', import.meta.url).pathname;
fs.mkdirSync(dist, { recursive: true });
await esbuild.build({
  entryPoints: [new URL('./src/page.js', import.meta.url).pathname],
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  outdir: dist,
  alias: { 'pierre-diffs': pierre },
  loader: { '.json': 'json', '.wasm': 'file' },
  logLevel: 'warning',
});
fs.copyFileSync(new URL('./src/index.html', import.meta.url), new URL('./dist/index.html', import.meta.url));
console.log('built', dist);
