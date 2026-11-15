// src/grammars.ts imports nothing (it ships as source for hosts that vendor it), so its agreement with the
// engine is checked here: the same language ids, both ways (also at compile time), each grammar the file the
// engine's config loads, and the file lists exactly the map's files, once each, the runtime first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEM_DIFF_GRAMMAR_FILES, SEM_DIFF_GRAMMARS, SEM_DIFF_RUNTIME_FILE, SEM_DIFF_WASM_FILES } from '../src/grammars.ts';
import type { LanguageId } from '../src/languages.ts';
import { LANGUAGES } from '../src/parse.ts';

// Compile time: the map's keys are exactly the engine's language ids.
type Keys = keyof typeof SEM_DIFF_GRAMMARS;
const everyLanguage: Record<LanguageId, true> = {} as Record<Keys, true>;
const onlyLanguages: Record<Keys, true> = {} as Record<LanguageId, true>;
void [everyLanguage, onlyLanguages];

test('the grammar map names the file each language config loads', () => {
  assert.deepEqual(Object.keys(SEM_DIFF_GRAMMARS).sort(), Object.keys(LANGUAGES).sort());
  for (const [id, file] of Object.entries(SEM_DIFF_GRAMMARS)) assert.equal(LANGUAGES[id as LanguageId].wasm.split('/').pop(), file, id);
});

test('the file lists are the map, once each, with the runtime first', () => {
  assert.deepEqual([...SEM_DIFF_GRAMMAR_FILES], [...new Set(Object.values(SEM_DIFF_GRAMMARS))]);
  assert.deepEqual([...SEM_DIFF_WASM_FILES], [SEM_DIFF_RUNTIME_FILE, ...SEM_DIFF_GRAMMAR_FILES]);
});
