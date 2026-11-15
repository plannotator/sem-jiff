// Fills the package's `wasm/` folder (shipped in the tarball): web-tree-sitter's runtime and every
// grammar, under the names in src/grammars.ts, from the build-time grammar packages. The vendored
// grammars (Kotlin, Swift) must match their SHA256SUMS. Writes wasm/SHA256SUMS. Run by `npm run build`.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { LANGUAGES } from '../src/parse.ts';
import { SEM_DIFF_GRAMMARS, SEM_DIFF_RUNTIME_FILE, SEM_DIFF_WASM_FILES } from '../src/grammars.ts';

const root = path.join(import.meta.dirname, '..');
const out = path.join(root, 'wasm');
const require = createRequire(import.meta.url);
const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const sources = new Map<string, string>([[SEM_DIFF_RUNTIME_FILE, require.resolve('web-tree-sitter/web-tree-sitter.wasm')]]);
for (const [id, name] of Object.entries(SEM_DIFF_GRAMMARS)) sources.set(name, require.resolve(LANGUAGES[id as keyof typeof LANGUAGES].wasm));
for (const vendored of ['tree-sitter-kotlin', 'tree-sitter-swift']) {
  const dir = path.join(root, 'vendor', vendored);
  for (const line of fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
    const [want, file] = line.split(/\s+/);
    const got = sha(path.join(dir, file!));
    if (got !== want) throw new Error(`vendor/${vendored}/${file}: sha256 ${got}, expected ${want}`);
    if (sha(sources.get(file!)!) !== want) throw new Error(`${file}: the installed copy is not the vendored one`);
  }
}
const sums: string[] = [];
for (const name of SEM_DIFF_WASM_FILES) {
  const from = sources.get(name);
  if (!from) throw new Error(`no source for ${name}`);
  fs.copyFileSync(from, path.join(out, name));
  sums.push(`${sha(path.join(out, name))}  ${name}`);
}
fs.writeFileSync(path.join(out, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`sem-jiff: ${SEM_DIFF_WASM_FILES.length} wasm files in wasm/`);
