// Constructed trap cases per language (test/fixtures/traps/<language>.json, format in harness/lang/README.md),
// written before the language's engine code. A case with status "ok" passes when every expected operation is
// made (an `optional` one may be), every claim the engine makes overlaps an expected operation of its type, and
// no `never` entry is matched. A "borderline" case checks `never` only. Languages the engine does not read yet
// are skipped. `names` (what the Sem tab shows) belongs to the review app and is not checked here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { LANGUAGES, type LanguageId } from '../src/parse.ts';
import { semanticDiffFile } from '../src/index.ts';

type Ranges = Array<[number, number]>;
type Entry = { type: string; old?: Ranges; new?: Ranges; optional?: boolean };
type Case = { id: string; language: string; title: string; expected: string; status: 'ok' | 'borderline'; old: string; new: string; ops: Entry[]; never?: Entry[] };

const CLAIMS = new Set(['moved', 'movedWithEdit', 'renamed', 'reformatted', 'reordered', 'extractedFunction', 'inlinedFunction']);
const dir = path.join(import.meta.dirname, 'fixtures', 'traps');

// Known gaps: cases the engine does not meet yet where every claim it makes is still true (a missed label, or
// the other side of a swap named as the move). They run as `todo`: reported, not failing. A case where the
// engine makes a false claim is never listed here; it fails until it is fixed or held back.
const KNOWN_GAPS: Record<string, string> = {
  'java-imports-sorted': 'the engine has no `reordered` claim: sorted imports are reported as moves of the imports that changed place',
  'java-move-hides-edit': "min() is claimed moved-with-edits, which the case's own text allows, but its expected operations list only the plain move of count()",
  'cs-name-nested-move': 'of two swapped members the engine names the unchanged neighbours as moved, not Describe (the longest-run choice)',
  'cs-name-property-move': 'of two swapped members the engine names the unchanged neighbours as moved, not the property FullName',
  'cs-overload-move': 'the overloads are paired correctly, but Format(double) is named as the one that moved up instead of Format(string) down',
  'cs-doc-attr-move': 'Reset is named as the one that moved down instead of Fetch (with its docs and attributes) up',
  'cs-region-out': 'the neighbour is named as moved instead of Peek, and the #region lines show as added and deleted around it',
  'cs-move-with-edit': 'the unchanged Post is named as moved and the edited Balance stays an edit, so no moved-with-edits claim is made',
};

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  for (const c of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Case[]) {
    const supported = c.language in LANGUAGES;
    // A language that holds claims back (LanguageConfig.holdBack) is checked twice: with its rules alone, the
    // claims held back included, against every expected operation; and as shipped, where a held-back claim
    // need not be made but every claim made must still be expected and no claim in `never` may appear.
    const held = supported ? LANGUAGES[c.language as LanguageId].holdBack : undefined;
    for (const shipped of held?.size ? [false, true] : [true]) test(`${c.id}: ${c.title}${held?.size ? (shipped ? ' (as shipped)' : ' (rules, nothing held back)') : ''}`, { skip: supported ? false : `no ${c.language} engine yet`, todo: KNOWN_GAPS[c.id] }, async () => {
      const cfg = LANGUAGES[c.language as LanguageId];
      if (!shipped) cfg.holdBack = undefined;
      let r;
      try {
        r = await semanticDiffFile(c.language as LanguageId, c.old, c.new, c.id);
      } finally {
        cfg.holdBack = held;
      }
      const ops = r.semanticOperations;
      const overlaps = (o: (typeof ops)[number], e: Entry) =>
        e.type === o.type && (['old', 'new'] as const).every((s) => !e[s] || o.lines[s].some((l) => e[s]!.some(([a, b]) => l.start <= b && a <= l.end)));
      const show = () => JSON.stringify(ops.map((o) => [o.type, o.lines.old.map((l) => [l.start, l.end]), o.lines.new.map((l) => [l.start, l.end])]));
      // As shipped, an expected claim that is held back leaves its lines as plain edits: in such a case `never` is checked for claims only.
      const heldHere = shipped && c.ops.some((x) => held?.has(x.type));
      for (const e of (c.never ?? []).filter((x) => !heldHere || CLAIMS.has(x.type))) assert.ok(!ops.some((o) => overlaps(o, e)), `never ${JSON.stringify(e)}: ${c.expected}\n  got ${show()}`);
      if (c.status !== 'ok') return;
      for (const e of c.ops.filter((x) => !x.optional && !(shipped && held?.has(x.type)))) assert.ok(ops.some((o) => overlaps(o, e)), `expected ${JSON.stringify(e)}: ${c.expected}\n  got ${show()}`);
      for (const o of ops) if (CLAIMS.has(o.type)) assert.ok(c.ops.some((e) => overlaps(o, e)), `unexpected ${o.type}: ${c.expected}\n  got ${show()}`);
    });
  }
}
