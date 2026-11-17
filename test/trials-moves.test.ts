// Trial rules for moves, each off by default (harness: SEMANTIC_TRY_<NAME>=1):
// - DROP_UNTOUCHED_MOVE: a structure move none of whose non-blank lines is a changed line is dropped.
// - EXT_BY_MEMBERS: the containers of one type (Swift extensions) pair by where their members went, not by header,
//   when deciding which members crossed into another container.
// - DUP_TIEBREAK: equally similar same-named declarations (a duplicated `require` or import) pair first where the
//   line diff keeps one unchanged in place.
// - IMPORT_NO_RENAME: two different imports are never paired as one renamed declaration.
// Cases in test/fixtures/trials/moves.json, each with its claims with every trial off (`off`, what 0.2.1 says) and with
// each listed trial on alone (`on`): traps for what a trial must remove, and for what it must keep (a real move).
// Every result stays valid.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { semanticDiffFile } from '../src/index.ts';
import type { LanguageId } from '../src/languages.ts';
import { switchRulesOff, switchTrialsOn } from '../src/runtime.ts';
import { brokenRules } from './validate.ts';

type Case = { id: string; language: LanguageId; file: string; title: string; old: string; new: string; off: string[]; on: Record<string, string[]> };
const cases = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'trials', 'moves.json'), 'utf8')) as Case[];
const EXPLAINS = new Set(['moved', 'movedWithEdit', 'renamed', 'reformatted', 'reordered', 'extractedFunction', 'inlinedFunction']);
// Trials are measured with the hold-back lifted (SEMANTIC_NO_HOLD_BACK=1 in the harness): Ruby and Swift moves count.
switchRulesOff(['HOLD_BACK']);

async function claims(c: Case, trials: string[]) {
  switchTrialsOn(trials);
  try {
    const r = await semanticDiffFile(c.language, c.old, c.new, c.file);
    assert.deepEqual(brokenRules(c.old, c.new, r), [], `the result stays valid with [${trials.join(',')}]`);
    return r.semanticOperations
      .filter((o) => EXPLAINS.has(o.type))
      .map((o) => `${o.type} ${o.lines.old.map((l) => `${l.start}-${l.end}`).join(',')} -> ${o.lines.new.map((l) => `${l.start}-${l.end}`).join(',')}`);
  } finally {
    switchTrialsOn([]);
  }
}

for (const c of cases) {
  test(`${c.id}: ${c.title}`, async () => {
    assert.deepEqual(await claims(c, []), c.off, 'with every trial off');
    for (const [t, want] of Object.entries(c.on)) assert.deepEqual(await claims(c, [t]), want, `with ${t} on`);
  });
}

test('every trial has a case it changes and a case it must leave as it is', () => {
  for (const t of ['DROP_UNTOUCHED_MOVE', 'EXT_BY_MEMBERS', 'DUP_TIEBREAK', 'IMPORT_NO_RENAME']) {
    const withIt = cases.filter((c) => c.on[t]);
    assert.ok(withIt.some((c) => c.on[t]!.length < c.off.length), `${t} removes a claim somewhere`);
    assert.ok(withIt.some((c) => c.off.length > 0 && c.on[t]!.length === c.off.length), `${t} keeps a real move somewhere`);
  }
});
