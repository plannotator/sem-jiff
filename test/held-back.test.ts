// 0.2.1 holds back the classes that failed the held3 blind audit (Swift, Ruby: moved, renamed, extract/inline;
// Kotlin: renamed, extract/inline). As shipped they are never claimed; with the HOLD_BACK rule off (tests,
// SEMANTIC_NO_HOLD_BACK=1 in the harness) the same trap cases still make them, so 0.3 can measure them again.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { semanticDiffFile } from '../src/index.ts';
import { LANGUAGES, type LanguageId } from '../src/parse.ts';
import { switchRulesOff } from '../src/runtime.ts';

const HELD: Record<string, string[]> = {
  swift: ['movedWithEdit', 'moved', 'renamed', 'extractedFunction', 'inlinedFunction'],
  ruby: ['movedWithEdit', 'moved', 'renamed', 'extractedFunction', 'inlinedFunction'],
  kotlin: ['movedWithEdit', 'renamed', 'extractedFunction', 'inlinedFunction'],
};
type Case = { id: string; language: LanguageId; old: string; new: string };
const cases = (lang: string): Case[] => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'traps', `${lang}.json`), 'utf8'));
const types = async (c: Case, lifted: boolean) => {
  if (lifted) switchRulesOff(['HOLD_BACK']);
  try {
    return (await semanticDiffFile(c.language, c.old, c.new, c.id)).semanticOperations.map((o) => o.type as string);
  } finally {
    switchRulesOff([]);
  }
};

test('the held-back classes per language; every other language holds nothing back', () => {
  for (const [id, cfg] of Object.entries(LANGUAGES)) assert.deepEqual([...(cfg.holdBack ?? [])], HELD[id] ?? [], id);
});

for (const lang of Object.keys(HELD)) {
  test(`${lang} as shipped claims none of its held-back classes on its trap cases; lifted, the cases still make them`, async () => {
    const held = new Set(HELD[lang]);
    const seenLifted = new Set<string>();
    for (const c of cases(lang)) {
      const shipped = await types(c, false);
      assert.deepEqual(shipped.filter((t) => held.has(t)), [], c.id);
      for (const t of await types(c, true)) if (held.has(t)) seenLifted.add(t);
    }
    for (const t of held) if (t !== 'movedWithEdit') assert.ok(seenLifted.has(t), `${lang}: no trap case makes ${t} with the hold-back lifted`);
  });

  test(`${lang} as shipped asks no second opinion about a held-back extract or inline`, async () => {
    let asked = 0;
    for (const c of cases(lang)) {
      await semanticDiffFile(c.language, c.old, c.new, c.id, { secondOpinion: async (cs) => ((asked += cs.length), cs.map(() => false)) });
    }
    assert.equal(asked, 0);
  });
}

test('reformatted stays claimed in Swift, Ruby and Kotlin', async () => {
  for (const [lang, a, b] of [
    ['swift', 'struct S {\n    func f() -> Int {\n        1\n    }\n}\n', 'struct S {\n    func f() -> Int {\n            1\n    }\n}\n'],
    ['ruby', 'class P\n  def clean(path)\n    x = 1\n    y = 2\n  end\nend\n', 'class P\n  def clean(path)\n      x = 1\n      y = 2\n  end\nend\n'],
    ['kotlin', 'class S {\n    fun f(): Int {\n        return 1\n    }\n}\n', 'class S {\n    fun f(): Int {\n            return 1\n    }\n}\n'],
  ] as const) assert.deepEqual((await semanticDiffFile(lang, a, b, 'x')).semanticOperations.map((o) => o.type), ['reformatted'], lang);
});
