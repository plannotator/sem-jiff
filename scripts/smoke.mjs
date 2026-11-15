// Install smoke test: pack the package, install it into an empty project, then
// (1) import it in Node and diff a file, and (2) bundle it for the browser with esbuild.
// Catches what the unit tests cannot: a broken `exports`, files missing from the package,
// or Node-only code reaching a browser bundle.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-jiff-smoke-'));
try {
  const tgz = run('npm', ['pack', '--silent', '--pack-destination', dir], root).split('\n').at(-1);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'smoke', private: true, type: 'module' }));
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', path.join(dir, tgz)], dir);

  // 1. Node: import the installed package and find a moved function.
  fs.writeFileSync(path.join(dir, 'node.mjs'), `
import { semanticDiffFile, languageForPath } from '@plannotator/sem-jiff';
const a = 'export function a() {\\n  return 1;\\n}\\n\\nexport function b() {\\n  return 2;\\n}\\n';
const b = 'export function b() {\\n  return 2;\\n}\\n\\nexport function a() {\\n  return 1;\\n}\\n';
const r = await semanticDiffFile(languageForPath('x.ts'), a, b, 'x.ts');
const types = r.semanticOperations.map((o) => o.type);
if (!types.includes('moved')) { console.error('expected a move, got', types); process.exit(1); }
console.log('node ok:', types.join(','));
`);
  console.log(run('node', ['node.mjs'], dir));

  // 2. Browser: the package must bundle for the browser with no Node built-ins pulled in.
  fs.writeFileSync(path.join(dir, 'browser.mjs'), `
import { configure, semanticDiffFile } from '@plannotator/sem-jiff';
configure({ locateGrammar: (file) => new URL('/grammars/' + file.split('/').pop(), location.href) });
globalThis.semdiff = semanticDiffFile;
`);
  const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild');
  run(esbuild, ['browser.mjs', '--bundle', '--platform=browser', '--format=esm', '--outfile=out.js', '--log-level=error'], dir);
  const out = fs.readFileSync(path.join(dir, 'out.js'), 'utf8');
  if (/from\s*["']node:|require\(["']node:/.test(out)) { console.error('browser bundle imports a Node built-in'); process.exit(1); }
  console.log(`browser ok: bundle ${(out.length / 1024).toFixed(0)} KB`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
