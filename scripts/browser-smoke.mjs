// Browser smoke test: run the built engine inside a Web Worker in headless Chromium, on one
// small change per language, with the grammars served over HTTP as a real page would.
// Fails on any error in the page or worker, or if a language does not produce the expected label.
// Usage: npm run build && node scripts/browser-smoke.mjs
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(root, 'package.json'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-jiff-browser-'));

// Grammars and web-tree-sitter's runtime, served from /grammars/.
fs.mkdirSync(path.join(dir, 'grammars'));
const grammars = ['tree-sitter-typescript/tree-sitter-typescript.wasm', 'tree-sitter-typescript/tree-sitter-tsx.wasm', 'tree-sitter-go/tree-sitter-go.wasm',
  'tree-sitter-rust/tree-sitter-rust.wasm', 'tree-sitter-python/tree-sitter-python.wasm', 'tree-sitter-java/tree-sitter-java.wasm',
  'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm', 'web-tree-sitter/web-tree-sitter.wasm'];
for (const g of grammars) fs.copyFileSync(require.resolve(g), path.join(dir, 'grammars', path.basename(g)));

// One move per language: two functions swapped. Each must come back as `moved`.
const cases = {
  typescript: ['function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}\n', 'function b() {\n  return 2;\n}\n\nfunction a() {\n  return 1;\n}\n'],
  go: ['package p\n\nfunc A() int {\n\treturn 1\n}\n\nfunc B() int {\n\treturn 2\n}\n', 'package p\n\nfunc B() int {\n\treturn 2\n}\n\nfunc A() int {\n\treturn 1\n}\n'],
  rust: ['fn a() -> i32 {\n    1\n}\n\nfn b() -> i32 {\n    2\n}\n', 'fn b() -> i32 {\n    2\n}\n\nfn a() -> i32 {\n    1\n}\n'],
  python: ['def a():\n    return 1\n\n\ndef b():\n    return 2\n', 'def b():\n    return 2\n\n\ndef a():\n    return 1\n'],
  java: ['class C {\n  int a() {\n    return 1;\n  }\n\n  int b() {\n    return 2;\n  }\n}\n', 'class C {\n  int b() {\n    return 2;\n  }\n\n  int a() {\n    return 1;\n  }\n}\n'],
  csharp: ['class C {\n  int A() {\n    return 1;\n  }\n\n  int B() {\n    return 2;\n  }\n}\n', 'class C {\n  int B() {\n    return 2;\n  }\n\n  int A() {\n    return 1;\n  }\n}\n'],
};
fs.writeFileSync(path.join(dir, 'worker-src.js'), `
import { configure, semanticDiffFile } from ${JSON.stringify(path.join(root, 'dist', 'index.js'))};
configure({
  locateGrammar: (file) => new URL('/grammars/' + file.split('/').pop(), self.location.href),
  locateRuntime: (file) => '/grammars/' + file,
});
self.onmessage = async (e) => {
  const out = {};
  for (const [lang, [a, b]] of Object.entries(e.data)) {
    const t0 = performance.now();
    const r = await semanticDiffFile(lang, a, b, 'x');
    out[lang] = { types: r.semanticOperations.map((o) => o.type), ms: Math.round(performance.now() - t0) };
  }
  self.postMessage(out);
};
`);
await esbuild.build({ entryPoints: [path.join(dir, 'worker-src.js')], bundle: true, format: 'esm', platform: 'browser', outfile: path.join(dir, 'worker.js'), logLevel: 'error' });
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><script type="module">
const w = new Worker('/worker.js', { type: 'module' });
w.onerror = (e) => { window.result = { error: e.message || 'worker error' }; };
w.onmessage = (e) => { window.result = e.data; };
w.postMessage(${JSON.stringify(cases)});
</script>`);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(dir, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const errors = [];
let failed = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('worker', (w) => w.on('console', (m) => { if (m.type() === 'error' || process.env.VERBOSE) errors.push(`worker console: ${m.text()}`); }));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.result, null, { timeout: 60_000 });
  } catch {
    for (const e of errors) console.log('ERROR', e);
    throw new Error('the worker never answered');
  }
  const result = await page.evaluate(() => window.result);
  if (result.error) errors.push(`worker: ${result.error}`);
  for (const lang of Object.keys(cases)) {
    const r = result[lang];
    const ok = r?.types.includes('moved');
    if (!ok) failed = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${lang.padEnd(10)} ${r ? `${r.types.join(',')} (${r.ms} ms)` : 'no result'}`);
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
for (const e of errors) console.log('ERROR', e);
if (failed || errors.length) process.exit(1);
console.log('browser worker ok');
