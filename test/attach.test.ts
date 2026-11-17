// Trial rules ATTACH_BLANK (a moved block's blank separator lines join the move) and ATTACH_DOC (a declaration's
// line-diff anchor starts at its doc comment), both off by default (harness: SEMANTIC_TRY_<NAME>=1). Cases in
// test/fixtures/trials/attach.json:
// - `clears`: with the trial(s) off the case leaves changed lines no operation explains, and with them on it leaves none;
//   a doc-comment case (`needsDoc`) is not cleared by ATTACH_BLANK alone.
// - `guard`: the trial changes nothing that matters: a comment that is not the moved code's (`notMoved`: separated by
//   a blank line, or the next declaration's doc right below it) stays out of every move, and a blank line inside a
//   string is never taken by a move; with `sameClaims`, every claim and its lines stay exactly as with the trial off.
// For every case, with the trial on: the same operation types as with it off, every result still valid, and
// ATTACH_BLANK only ever adds blank lines to a move.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { semanticDiffFile } from '../src/index.ts';
import type { LanguageId } from '../src/languages.ts';
import { switchRulesOff, switchTrialsOn } from '../src/runtime.ts';
import { brokenRules } from './validate.ts';

type Case = { id: string; fix: string; language: LanguageId; file: string; title: string; old: string; new: string; expect: 'clears' | 'guard'; both?: boolean; needsDoc?: boolean; notMoved?: string; sameClaims?: boolean; stringLine?: [number | null, number | null] };
// Trials are measured with the hold-back lifted (SEMANTIC_NO_HOLD_BACK=1 in the harness): Ruby and Swift moves count.
switchRulesOff(['HOLD_BACK']);

const cases = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'trials', 'attach.json'), 'utf8')) as Case[];
const EXPLAINS = new Set(['moved', 'movedWithEdit', 'renamed', 'reformatted', 'extractedFunction', 'inlinedFunction']);

async function run(c: Case, trials: string[]) {
  switchTrialsOn(trials);
  try {
    const r = await semanticDiffFile(c.language, c.old, c.new, c.file);
    // Changed lines of the engine's own diff that no explaining operation owns.
    const owned = { old: new Set<number>(), new: new Set<number>() };
    for (const op of r.semanticOperations) if (EXPLAINS.has(op.type)) for (const s of ['old', 'new'] as const) for (const l of op.lines[s]) for (let k = l.start; k <= l.end; k++) owned[s].add(k);
    const left: string[] = [];
    let o = 0;
    let n = 0;
    for (const p of r.patch.split('\n')) {
      const h = p.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (h) { o = Number(h[1]); n = Number(h[2]); continue; }
      if (/^(---|\+\+\+|diff |\\)/.test(p)) continue;
      if (p[0] === '-') { if (!owned.old.has(o)) left.push(`-${o}`); o++; }
      else if (p[0] === '+') { if (!owned.new.has(n)) left.push(`+${n}`); n++; }
      else if (p[0] === ' ') { o++; n++; }
    }
    return { r, left, owned };
  } finally {
    switchTrialsOn([]);
  }
}

for (const c of cases) {
  test(`${c.id}: ${c.title}`, async () => {
    const on = c.both ? ['ATTACH_BLANK', 'ATTACH_DOC'] : [c.fix];
    const off = await run(c, []);
    const with_ = await run(c, on);
    assert.deepEqual(brokenRules(c.old, c.new, with_.r), [], 'the result stays valid');
    assert.deepEqual(with_.r.semanticOperations.map((o) => o.type).filter((t) => t !== 'edited' && t !== 'added' && t !== 'deleted').sort(), off.r.semanticOperations.map((o) => o.type).filter((t) => t !== 'edited' && t !== 'added' && t !== 'deleted').sort(), 'the same claims');
    if (!c.both && c.fix === 'ATTACH_BLANK') {
      const lines = { old: c.old.split('\n'), new: c.new.split('\n') };
      for (const side of ['old', 'new'] as const) for (const l of with_.owned[side]) if (!off.owned[side].has(l)) assert.equal(lines[side][l - 1]!.trim(), '', `${side} line ${l} joined a move but is not blank`);
    }
    if (c.expect === 'clears') {
      assert.ok(off.left.length > 0, `the case should leave lines with the trial off: ${off.left.join(' ')}`);
      assert.deepEqual(with_.left, [], `with ${on.join('+')} on, nothing should be left: ${with_.left.join(' ')}`);
      // A case for ATTACH_DOC must need it: ATTACH_BLANK alone does not clear it.
      if (c.needsDoc) assert.ok((await run(c, ['ATTACH_BLANK'])).left.length > 0, 'ATTACH_BLANK alone should not clear a doc-comment case');
    } else {
      if (c.stringLine?.[0]) assert.ok(!with_.owned.old.has(c.stringLine[0]), 'the string\'s blank line is not part of a move');
      if (c.sameClaims) {
        const claims = (x: typeof off) => x.r.semanticOperations.filter((o) => EXPLAINS.has(o.type)).map((o) => [o.type, o.lines.old.map((l) => [l.start, l.end]), o.lines.new.map((l) => [l.start, l.end])]);
        assert.deepEqual(claims(with_), claims(off), 'every claim, with its lines, is as with the trial off');
      }
      if (c.notMoved) {
        const commentOld = c.old.split('\n').findIndex((x) => x.startsWith(c.notMoved!)) + 1;
        assert.ok(commentOld > 0 && !with_.owned.old.has(commentOld), `the comment that is not the moved code's (${c.notMoved}) is not in any claim`);
      }
    }
  });
}
