// Trial rules of sem-jiff 0.3 track B, each off by default (harness: SEMANTIC_TRY_<NAME>=1):
// - FN_PAIRING: function pairing for extract/inline (Swift signatures as a tie-break, rename chains where a new
//   function took the old name);
// - XI_EVIDENCE: extract/inline evidence assigned one to one, literal-aware matching, no claims on broken trees;
// - RENAME_GUARDS: targeted guards for renames where the name now stands for something else.
// - KOTLIN_GRAMMAR: a patched tree-sitter-kotlin (constructor after a line break), tests at the end;
// - RUBY_SHAPES: Ruby extract shapes: a helper pulled out of several callers (their repeated lines are evidence for
//   it), a helper called as a statement (its implicit return is a moved statement, not a value), and a value found
//   where the call took its place in an otherwise unchanged statement.
// Cases in test/fixtures/trials/<trial>.json. Per case, with the trial on: `on.must` claims are made and `on.never`
// claims are not; with it off, `off.must` claims are made (the trap reproduces the false claim it guards against).
// Hold-back is lifted, as in the harness: the trials are about the claims the rules make.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { semanticDiffFile } from '../src/index.ts';
import type { LanguageId } from '../src/languages.ts';
import type { SemDiffOperation as SemanticDiffOperation } from '../src/index.ts';
import { switchRulesOff, switchTrialsOn } from '../src/runtime.ts';
import { brokenRules } from './validate.ts';

type Want = { type: string; name?: string; old?: [number, number]; new?: [number, number]; count?: number; oldEmpty?: boolean };
type Case = { id: string; trial: string; language: LanguageId; file: string; title: string; old: string; new: string; on: { must?: Want[]; never?: Want[] }; off: { must?: Want[]; never?: Want[] } };
const dir = path.join(import.meta.dirname, 'fixtures', 'trials');
const files = ['fn-pairing.json', 'xi-evidence.json', 'rename-guards.json', 'ruby-shapes.json'].filter((f) => fs.existsSync(path.join(dir, f)));
const cases = files.flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Case[]);

const overlaps = (ranges: Array<{ start: number; end: number }>, r?: [number, number]) => !r || ranges.some((l) => l.start <= r[1] && r[0] <= l.end);
const matches = (o: SemanticDiffOperation, w: Want) => o.type === w.type && (!w.name || o.symbol?.name === w.name) && overlaps(o.lines.old, w.old) && overlaps(o.lines.new, w.new) && (!w.oldEmpty || !o.lines.old.length);
const show = (ops: SemanticDiffOperation[]) => ops.filter((o) => !['edited', 'added', 'deleted'].includes(o.type)).map((o) => `${o.type}${o.symbol ? ' ' + o.symbol.name : ''} ${JSON.stringify(o.lines.old.map((l) => [l.start, l.end]))}->${JSON.stringify(o.lines.new.map((l) => [l.start, l.end]))}`).join('; ');

async function run(c: Case, trials: string[]) {
  switchRulesOff(['HOLD_BACK']);
  switchTrialsOn(trials);
  try {
    return await semanticDiffFile(c.language, c.old, c.new, c.file);
  } finally {
    switchTrialsOn([]);
    switchRulesOff([]);
  }
}

function check(ops: SemanticDiffOperation[], spec: { must?: Want[]; never?: Want[] }, label: string) {
  for (const w of spec.must ?? []) {
    const n = ops.filter((o) => matches(o, w)).length;
    if (w.count !== undefined) assert.equal(n, w.count, `${label}: ${w.count} x ${JSON.stringify(w)}, got ${n}: ${show(ops)}`);
    else assert.ok(n > 0, `${label}: expected ${JSON.stringify(w)}: ${show(ops)}`);
  }
  for (const w of spec.never ?? []) assert.ok(!ops.some((o) => matches(o, w)), `${label}: must not claim ${JSON.stringify(w)}: ${show(ops)}`);
}

for (const c of cases) {
  test(`${c.trial} ${c.id}: ${c.title}`, async () => {
    const on = await run(c, [c.trial]);
    assert.deepEqual(brokenRules(c.old, c.new, on), [], 'the result stays valid');
    check(on.semanticOperations, c.on, `${c.trial} on`);
    const off = await run(c, []);
    check(off.semanticOperations, c.off, `${c.trial} off`);
  });
}

test('track B trials are off by default', async () => {
  for (const c of cases) {
    switchRulesOff(['HOLD_BACK']);
    try {
      const plain = await semanticDiffFile(c.language, c.old, c.new, c.file);
      const off = await run(c, []);
      assert.deepEqual(plain.semanticOperations, off.semanticOperations, c.id);
    } finally {
      switchRulesOff([]);
    }
  }
});

// Trial KOTLIN_GRAMMAR (fix 5): tree-sitter-kotlin 1.1.0 ends a class header at a line break before a modified
// constructor, so these classes parse with an ERROR (Kotlin held-out #37; kotlinpoet's ktfmt-style nested `Builder`).
// With the trial on, the patched grammar (vendor/tree-sitter-kotlin/tree-sitter-kotlin-patched.wasm) reads the
// primary constructor; with it off, the release grammar still gives the ERROR (nothing changes by default).
for (const [id, text] of [
  ['annotation-internal-constructor', 'class A\n@Inject internal constructor(val x: Int) {\n}\n'],
  ['nested-internal-constructor', 'class A {\n  class B\n  internal constructor(val x: Int)\n}\n'],
] as const) {
  test(`KOTLIN_GRAMMAR ${id}: parses with the trial on, release grammar unchanged with it off`, async () => {
    const { withTrees } = await import('../src/parse.ts');
    try {
      switchTrialsOn(['KOTLIN_GRAMMAR']);
      await withTrees('kotlin', text, text, (a) => {
        assert.equal(a.rootNode.hasError, false, a.rootNode.toString());
        assert.ok(a.rootNode.descendantsOfType('primary_constructor').length === 1, a.rootNode.toString());
      });
    } finally {
      switchTrialsOn([]);
    }
    await withTrees('kotlin', text, text, (a) => assert.equal(a.rootNode.hasError, true, a.rootNode.toString()));
  });
}

test('KOTLIN_GRAMMAR: the patched grammar is the one in PATCHED-SHA256SUMS', async () => {
  const { createHash } = await import('node:crypto');
  const dir = path.join(import.meta.dirname, '..', 'vendor', 'tree-sitter-kotlin');
  const [want, file] = fs.readFileSync(path.join(dir, 'PATCHED-SHA256SUMS'), 'utf8').trim().split(/\s+/);
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir, file!))).digest('hex'), want);
});
