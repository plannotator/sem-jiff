// The packed tarball, installed into a throwaway project outside the source tree, as a host app would
// use it: every entry point imports, every grammar loads from the installed package (Node), the wasm
// files can be embedded by a Bun-compiled binary and bundled for a browser, the declarations pass a
// strict consumer with skipLibCheck off, and nothing of the harness, bench or corpus is shipped.
// Slow (packs, installs, compiles): runs only with SEM_DIFF_PACK_TEST=1.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const root = path.join(import.meta.dirname, '..');
const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const skip = process.env.SEM_DIFF_PACK_TEST ? false : 'set SEM_DIFF_PACK_TEST=1 to pack and install the tarball';

// One small file per language: enough to make the engine load that language's grammar.
const SAMPLES: Record<string, [string, string]> = {
  'a.ts': ['export function f(a: number) {\n  return a + 1;\n}\n', 'export function f(a: number) {\n    return a + 1;\n}\n'],
  'a.tsx': ['export const A = () => <div>a</div>;\n', 'export const A = () => (\n  <div>a</div>\n);\n'],
  'a.py': ['def f(a):\n    return a + 1\n', 'def f(b):\n    return b + 1\n'],
  'a.go': ['package a\n\nfunc F(a int) int {\n\treturn a + 1\n}\n', 'package a\n\nfunc F(a int) int {\n\t\treturn a + 1\n}\n'],
  'a.rs': ['fn f(a: i32) -> i32 {\n    a + 1\n}\n', 'fn f(a: i32) -> i32 {\n        a + 1\n}\n'],
  'A.java': ['class A {\n  int f(int a) {\n    return a + 1;\n  }\n}\n', 'class A {\n  int f(int a) {\n      return a + 1;\n  }\n}\n'],
  'A.cs': ['class A {\n  int F(int a) {\n    return a + 1;\n  }\n}\n', 'class A {\n  int F(int a) {\n      return a + 1;\n  }\n}\n'],
  'a.php': ['<?php\nfunction f($a) {\n    return $a + 1;\n}\n', '<?php\nfunction f($a) {\n        return $a + 1;\n}\n'],
  'a.rb': ['def f(a)\n  a + 1\nend\n', 'def f(a)\n    a + 1\nend\n'],
  'A.kt': ['fun f(a: Int): Int {\n    return a + 1\n}\n', 'fun f(a: Int): Int {\n        return a + 1\n}\n'],
  'A.swift': ['func f(a: Int) -> Int {\n    return a + 1\n}\n', 'func f(a: Int) -> Int {\n        return a + 1\n}\n'],
};

test('the packed tarball installs into a fresh project and works from there', { skip, timeout: 600_000 }, () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-jiff-pack-'));
  try {
    run('npm', ['run', 'build'], root);
    const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', work], root))[0];
    const tarball = path.join(work, packed.filename);
    const shipped: string[] = packed.files.map((f: { path: string }) => f.path);
    assert.ok(!shipped.some((f) => /^(harness|bench|test|demo|docs|scripts|vendor)\//.test(f)), `shipped ${shipped.filter((f) => /^(harness|bench|test|demo|docs|scripts|vendor)\//.test(f)).join(', ')}`);
    // Source for hosts that vendor it: the Pi extension copies opinions.ts and candidate.ts; grammars.ts imports nothing.
    const SOURCES = ['src/opinions.ts', 'src/candidate.ts', 'src/grammars.ts'];
    for (const f of SOURCES) assert.ok(shipped.includes(f), `${f} is not shipped`);
    assert.deepEqual(shipped.filter((f) => f.startsWith('src/') && !SOURCES.includes(f)), []);
    assert.ok(!/^\s*import\b/m.test(fs.readFileSync(path.join(root, 'src', 'grammars.ts'), 'utf8')), 'src/grammars.ts must import nothing');
    assert.ok(shipped.includes('dist/copy-wasm-bin.js'), 'the copy-wasm bin is shipped');

    const app = path.join(work, 'app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module' }));
    run('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline', tarball], app);
    const pkg = path.join(app, 'node_modules', '@plannotator', 'sem-jiff');
    // Grammar packages are build-time only: the app installs none of them.
    const installed = fs.readdirSync(path.join(app, 'node_modules'));
    assert.deepEqual(installed.filter((n) => n.startsWith('tree-sitter') || n === '@tree-sitter-grammars'), []);

    // The wasm folder holds every file the exported list names, as SHA256SUMS says.
    const sums = new Map(fs.readFileSync(path.join(pkg, 'wasm', 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/).reverse() as [string, string]));

    // Node: every entry imports; every language diffs with its grammar loaded from the installed package.
    fs.writeFileSync(path.join(app, 'node.mjs'), `
      import { semanticDiffFile, languageForPath, configure, candidateId } from '@plannotator/sem-jiff';
      import { reviewSummary, SKIM_KINDS } from '@plannotator/sem-jiff/summary';
      import { OpinionKeyError, checkKey, clefAnswers, jevAnswers } from '@plannotator/sem-jiff/opinions';
      import { languageForPath as lp } from '@plannotator/sem-jiff/languages';
      import { SEM_DIFF_WASM_FILES, SEM_DIFF_GRAMMARS } from '@plannotator/sem-jiff/grammars';
      import { fileURLToPath } from 'node:url';
      const samples = ${JSON.stringify(SAMPLES)};
      const out = { files: SEM_DIFF_WASM_FILES, grammars: SEM_DIFF_GRAMMARS, resolved: {}, kinds: {} };
      for (const f of SEM_DIFF_WASM_FILES) out.resolved[f] = fileURLToPath(import.meta.resolve('@plannotator/sem-jiff/wasm/' + f));
      for (const [name, [a, b]] of Object.entries(samples)) {
        const lang = languageForPath(name);
        if (lang !== lp(name)) throw new Error('languages entry disagrees for ' + name);
        const r = await semanticDiffFile(lang, a, b, name);
        out.kinds[lang] = r.semanticOperations.map((o) => o.type);
      }
      if (typeof configure !== 'function' || typeof candidateId !== 'function' || typeof reviewSummary !== 'function' || !SKIM_KINDS.length) throw new Error('missing export');
      if (typeof OpinionKeyError !== 'function' || typeof checkKey !== 'function' || typeof clefAnswers !== 'function' || typeof jevAnswers !== 'function') throw new Error('missing opinions export');
      console.log(JSON.stringify(out));
    `);
    const node = JSON.parse(run('node', ['node.mjs'], app));
    assert.deepEqual([...node.files].sort(), [...sums.keys()].sort());
    for (const f of node.files) {
      assert.ok(node.resolved[f].startsWith(fs.realpathSync(pkg)), `${f} resolved outside the installed package: ${node.resolved[f]}`);
      assert.equal(sha(node.resolved[f]), sums.get(f), f);
    }
    assert.equal(Object.keys(node.kinds).length, Object.keys(SAMPLES).length);
    for (const [lang, kinds] of Object.entries(node.kinds) as Array<[string, string[]]>) assert.ok(kinds.length > 0, `${lang}: no operation, so its grammar did not parse`);

    // copyWasm and its bin copy every file out of the installed package, as SHA256SUMS says.
    fs.writeFileSync(path.join(app, 'copy.mjs'), `
      import { copyWasm } from '@plannotator/sem-jiff/copy-wasm';
      console.log(JSON.stringify(await copyWasm(process.argv[2])));
    `);
    const copied: string[] = JSON.parse(run('node', ['copy.mjs', path.join(app, 'copied')], app));
    assert.equal(copied.length, sums.size);
    run(path.join(app, 'node_modules', '.bin', 'sem-jiff-copy-wasm'), [path.join(app, 'copied-bin')], app);
    for (const [f, want] of sums) {
      assert.equal(sha(path.join(app, 'copied', f)), want, `copyWasm: ${f}`);
      assert.equal(sha(path.join(app, 'copied-bin', f)), want, `sem-jiff-copy-wasm: ${f}`);
    }

    // Bun: a compiled binary embeds every wasm file straight from the installed package.
    const imports = node.files.map((f: string, i: number) => `import w${i} from '@plannotator/sem-jiff/wasm/${f}' with { type: 'file' };`).join('\n');
    fs.writeFileSync(path.join(app, 'bun-entry.ts'), `${imports}
      const files = [${node.files.map((_: string, i: number) => `w${i}`).join(', ')}];
      const names = ${JSON.stringify(node.files)};
      const out: Record<string, string> = {};
      for (let i = 0; i < files.length; i++) {
        const bytes = await Bun.file(files[i] as unknown as string).bytes();
        out[names[i]] = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
      }
      console.log(JSON.stringify(out));
    `);
    run('bun', ['build', '--compile', 'bun-entry.ts', '--outfile', 'bun-app'], app);
    const embedded = JSON.parse(run(path.join(app, 'bun-app'), [], work));
    for (const f of node.files) assert.equal(embedded[f], sums.get(f), `bun binary: ${f}`);

    // Browser: a bundle of the page-side entries builds for the browser, and the wasm files it imports
    // from the installed package come out byte for byte.
    fs.writeFileSync(path.join(app, 'page.ts'), `${node.files.map((f: string, i: number) => `import u${i} from '@plannotator/sem-jiff/wasm/${f}';`).join('\n')}
      import { configure, semanticDiffFile } from '@plannotator/sem-jiff';
      import { languageForPath } from '@plannotator/sem-jiff/languages';
      import { reviewSummary } from '@plannotator/sem-jiff/summary';
      export const urls = [${node.files.map((_: string, i: number) => `u${i}`).join(', ')}];
      export { configure, semanticDiffFile, languageForPath, reviewSummary };
    `);
    const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild');
    run(esbuild, ['page.ts', '--bundle', '--platform=browser', '--format=esm', '--outdir=page', '--loader:.wasm=file', '--asset-names=[name]'], app);
    for (const f of node.files) assert.equal(sha(path.join(app, 'page', f)), sums.get(f), `browser bundle: ${f}`);

    // Vite: a page that imports the engine builds without pulling any grammar into its output. Vite rewrites a
    // `new URL(<template>, import.meta.url)` into a glob over the folder it names, so a loose one in the package
    // would bundle every grammar (the review app's build broke on exactly that).
    fs.mkdirSync(path.join(app, 'vite'));
    fs.writeFileSync(path.join(app, 'vite', 'index.html'), '<!doctype html><script type="module" src="./main.ts"></script>\n');
    fs.writeFileSync(path.join(app, 'vite', 'main.ts'), `
      import { configure, semanticDiffFile } from '@plannotator/sem-jiff';
      import { languageForPath } from '@plannotator/sem-jiff/languages';
      import { reviewSummary } from '@plannotator/sem-jiff/summary';
      import { SEM_DIFF_GRAMMARS } from '@plannotator/sem-jiff/grammars';
      configure({ locateGrammar: (file) => new URL('/sem-diff/' + file.split('/').pop(), location.href), locateRuntime: (file) => '/sem-diff/' + file });
      Object.assign(globalThis, { semanticDiffFile, languageForPath, reviewSummary, SEM_DIFF_GRAMMARS });
    `);
    run(path.join(root, 'node_modules', '.bin', 'vite'), ['build', '--logLevel', 'warn', '--emptyOutDir', '--outDir', 'dist', 'vite'], app);
    const built: string[] = fs.readdirSync(path.join(app, 'vite', 'dist'), { recursive: true }).map(String);
    assert.ok(built.length > 0, 'vite built nothing');
    // web-tree-sitter's own module names its runtime with a literal `new URL('web-tree-sitter.wasm', import.meta.url)`,
    // which Vite always emits as an asset (as for any page that imports web-tree-sitter); no grammar may come along.
    const wasm = built.filter((f) => f.endsWith('.wasm'));
    assert.deepEqual(wasm.filter((f) => !/(^|\/)web-tree-sitter-[\w-]+\.wasm$/.test(f)), [], 'vite pulled grammar wasm files into the page build');
    assert.ok(wasm.length <= 1, `vite emitted ${wasm.join(', ')}`);

    // Types: a strict consumer (noUncheckedIndexedAccess, skipLibCheck off), with both module resolutions.
    fs.writeFileSync(path.join(app, 'consumer.ts'), `
      import { semanticDiffFile, languageForPath, configure, type SemanticDiffOperation, type SemanticDiffFold, type SecondOpinionReport, type SecondOpinionLink, type SecondOpinionState } from '@plannotator/sem-jiff';
      import { reviewSummary, SKIM_KINDS, type ReviewSummary } from '@plannotator/sem-jiff/summary';
      import { OpinionKeyError, checkKey, clefAnswers, jevAnswers, type OpinionAnswer } from '@plannotator/sem-jiff/opinions';
      import type { Candidate } from '@plannotator/sem-jiff/candidate';
      import { languageForPath as lp } from '@plannotator/sem-jiff/languages';
      import { SEM_DIFF_GRAMMARS, SEM_DIFF_GRAMMAR_FILES, SEM_DIFF_WASM_FILES, SEM_DIFF_RUNTIME_FILE, type SemDiffWasmFile } from '@plannotator/sem-jiff/grammars';
      import { copyWasm } from '@plannotator/sem-jiff/copy-wasm';
      // The exported names keep their exact types: a host's file-name type stays narrow.
      const swift: 'tree-sitter-swift.wasm' = SEM_DIFF_GRAMMARS.swift;
      const runtime: 'web-tree-sitter.wasm' = SEM_DIFF_WASM_FILES[0];
      const lastGrammar: 'tree-sitter-swift.wasm' = SEM_DIFF_GRAMMAR_FILES[10];
      const anyFile: SemDiffWasmFile = SEM_DIFF_GRAMMAR_FILES[0];
      // @ts-expect-error not a file the package ships
      const notShipped: SemDiffWasmFile = 'tree-sitter-cobol.wasm';
      const copying: (dir: string) => Promise<string[]> = copyWasm;
      export async function use(c: Candidate, a: OpinionAnswer, s: SecondOpinionState, l: SecondOpinionLink): Promise<ReviewSummary | SecondOpinionReport | undefined> {
        configure({ locateGrammar: (file) => new URL(file, 'http://x/'), locateRuntime: (file) => file });
        const lang = languageForPath('a.swift') ?? lp('a.ts');
        if (!lang) return undefined;
        const r = await semanticDiffFile(lang, 'a', 'b', 'a.swift', { secondOpinion: async (cs: Candidate[]) => cs.map(() => a) });
        const ops: SemanticDiffOperation[] = r.semanticOperations;
        const folds: SemanticDiffFold[] = r.semanticFolds;
        void [c, s, l, folds, SKIM_KINDS, OpinionKeyError, checkKey, clefAnswers, jevAnswers, swift, runtime, lastGrammar, anyFile, notShipped, copying, SEM_DIFF_RUNTIME_FILE];
        return r.secondOpinion ?? reviewSummary(ops);
      }
    `);
    const tsc = path.join(root, 'node_modules', '.bin', 'tsc');
    for (const [module, resolution] of [['esnext', 'bundler'], ['nodenext', 'nodenext']]) {
      run(tsc, ['--noEmit', '--strict', '--noUncheckedIndexedAccess', '--skipLibCheck', 'false', '--target', 'es2023', '--module', module!, '--moduleResolution', resolution!, '--lib', 'es2023,dom', 'consumer.ts'], app);
    }
    // The shipped src/grammars.ts compiles on its own, as a host that vendors it would use it.
    run(tsc, ['--noEmit', '--strict', '--target', 'es2023', '--module', 'esnext', '--moduleResolution', 'bundler', '--allowImportingTsExtensions', path.join(pkg, 'src', 'grammars.ts')], app);

    console.log(`packed ${packed.filename}: ${packed.size} B packed, ${packed.unpackedSize} B unpacked, ${shipped.length} files`);
  } finally {
    if (!process.env.SEM_DIFF_PACK_KEEP) fs.rmSync(work, { recursive: true, force: true });
    else console.log(`kept ${work}`);
  }
});
