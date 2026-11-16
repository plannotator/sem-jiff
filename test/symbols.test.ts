// The declaration an operation is about (`symbol`, docs/symbols.md), per language: test/fixtures/symbols/cases.json.
// Each expectation names an operation type (and optionally its first new line) and the symbol it must carry, or
// `symbol: null` where the engine must leave it out (several sibling declarations, a move between two functions,
// two names renamed together). Every symbol the engine gives must be one an expectation names: a wrong name is
// worse than none. Expectations about an operation type the engine does not produce in a case pass vacuously only
// for `symbol: null`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { semanticDiffFile, type OperationSymbol } from '../src/index.ts';
import type { LanguageId } from '../src/languages.ts';
import { switchRulesOff } from '../src/runtime.ts';

type Expect = { type: string; symbol: OperationSymbol | null; newStart?: number };
type Case = { id: string; language: LanguageId; file: string; title: string; old: string; new: string; expect: Expect[] };
const cases = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'symbols', 'cases.json'), 'utf8')) as Case[];

for (const c of cases) {
  test(`${c.id}: ${c.title}`, async () => {
    // Symbols are checked on every claim the rules make, held-back ones included (held-back.test.ts checks what ships).
    switchRulesOff(['HOLD_BACK']);
    let ops;
    try {
      ops = (await semanticDiffFile(c.language, c.old, c.new, c.file)).semanticOperations;
    } finally {
      switchRulesOff([]);
    }
    const show = () => JSON.stringify(ops.map((o) => [o.type, o.lines.new[0]?.start ?? o.lines.old[0]?.start, o.symbol ?? null]));
    const matches = (e: Expect) => ops.filter((o) => o.type === e.type && (e.newStart === undefined || o.lines.new[0]?.start === e.newStart));
    for (const e of c.expect) {
      const found = matches(e);
      if (e.symbol === null) {
        for (const o of found) assert.equal(o.symbol, undefined, `${e.type} must carry no symbol\n  got ${show()}`);
        continue;
      }
      assert.ok(found.length > 0, `expected a ${e.type}\n  got ${show()}`);
      assert.ok(found.some((o) => isDeepStrictEqual(o.symbol, e.symbol)), `expected ${e.type} about ${JSON.stringify(e.symbol)}\n  got ${show()}`);
    }
    // No symbol the case does not name.
    for (const o of ops) {
      if (!o.symbol) continue;
      assert.ok(c.expect.some((e) => e.symbol && e.type === o.type && isDeepStrictEqual(e.symbol, o.symbol)), `unexpected symbol on ${o.type}: ${JSON.stringify(o.symbol)}\n  got ${show()}`);
    }
  });
}
