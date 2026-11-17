// "reformatted" means the same words laid out differently, inside strings, docstrings and comments too. A Python
// string whose content holds an escape sequence (`\\_`, `\n`) parses as the escape alone, so the words around it were
// never compared: held4 found docstrings reworded, `.. versionadded::` notes deleted and doctest names changed, all
// called formatting (58 of 150 sampled Python claims wrong). The REFORMAT_WORDS rule compares those words too.
// Traps from the shapes of real wrong held4 items; with the rule off they are claimed as before.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { semanticDiffFile } from '../src/index.ts';
import type { LanguageId } from '../src/parse.ts';
import { switchRulesOff } from '../src/runtime.ts';

const types = async (lang: LanguageId, a: string, b: string, off: string[] = []) => {
  switchRulesOff(off);
  try {
    return (await semanticDiffFile(lang, a, b, 'x')).semanticOperations.map((o) => o.type as string);
  } finally {
    switchRulesOff([]);
  }
};
const py = (doc: string[]) => ['class MiniBatchNMF(_BaseNMF):', '    """Mini-Batch NMF.', '', ...doc, '    """', '', '    def fit(self, X):', '        return self', ''].join('\n');

// scikit-learn _nmf.py: a parameter's documented type and default changed in a docstring with `\\_` escapes.
const NMF_OLD = py(['    .. math:: alpha\\\\_W * l1\\\\_ratio', '', '    verbose : bool, default=False', '        Whether to be verbose.']);
const NMF_NEW = py(['    .. math:: alpha\\\\_W * l1\\\\_ratio', '', '    verbose : int, default=0', '        Whether to be verbose.']);
// scikit-learn multioutput.py: a `.. versionadded::` note deleted while a sentence was rewrapped.
const ADDED_OLD = py(['    order : array-like, default=None \\', '        The order of the chain, set by the user.', '', '    .. versionadded:: 0.19', '', '    cv : int, default=None']);
const ADDED_NEW = py(['    order : array-like, default=None \\', '        The order of the chain,', '        set by the user.', '', '    cv : int, default=None']);
// A doctest whose name changed case (`Y` -> `y`).
const DOCTEST_OLD = py(['    >>> X, Y = load("a\\tb")', '    >>> chain.fit(X, Y)']);
const DOCTEST_NEW = py(['    >>> X, y = load("a\\tb")', '    >>> chain.fit(X, y)']);
// The same docstring rewrapped: the words and their order are unchanged.
const WRAP_OLD = py(['    .. math:: alpha\\\\_W * l1\\\\_ratio', '', '    verbose : bool, default=False', '        Whether to be verbose, printing the progress of every step.']);
const WRAP_NEW = py(['    .. math:: alpha\\\\_W * l1\\\\_ratio', '', '    verbose : bool, default=False', '        Whether to be verbose, printing the progress', '        of every step.']);

for (const [name, a, b] of [
  ['a changed parameter type and default', NMF_OLD, NMF_NEW],
  ['a deleted versionadded note', ADDED_OLD, ADDED_NEW],
  ['a renamed doctest variable', DOCTEST_OLD, DOCTEST_NEW],
] as const) {
  test(`Python docstring with an escape: ${name} is an edit, not formatting`, async () => {
    assert.ok(!(await types('python', a, b)).includes('reformatted'));
    // The trap bites: without the rule the change is called formatting, as in 0.3.
    assert.ok((await types('python', a, b, ['REFORMAT_WORDS'])).includes('reformatted'));
  });
}

test('Python docstring with an escape, only rewrapped: still formatting', async () => {
  assert.deepEqual(await types('python', WRAP_OLD, WRAP_NEW), ['reformatted']);
});

test('a docstring with no escape: a reworded one was never formatting, and still is not', async () => {
  const a = py(['    verbose : bool, default=False']);
  const b = py(['    verbose : int, default=0']);
  assert.ok(!(await types('python', a, b)).includes('reformatted'));
  assert.ok(!(await types('python', a, b, ['REFORMAT_WORDS'])).includes('reformatted'));
});

test('a reworded string with an escape in another language is not formatting either', async () => {
  // Rust: the string's words around `\n` changed while the call was wrapped.
  const a = 'fn f() {\n    g("one\\ntwo", 1);\n}\n';
  const b = 'fn f() {\n    g(\n        "one\\nthree",\n        1,\n    );\n}\n';
  assert.ok(!(await types('rust', a, b)).includes('reformatted'));
  // Only wrapped: formatting.
  const c = 'fn f() {\n    g(\n        "one\\ntwo",\n        1,\n    );\n}\n';
  assert.deepEqual(await types('rust', a, c), ['reformatted']);
});

test('a changed comment is never formatting', async () => {
  const a = 'func f() int {\n\t// returns one\n\treturn g(1, 2)\n}\n';
  const b = 'func f() int {\n\t// returns two\n\treturn g(1,\n\t\t2)\n}\n';
  assert.ok(!(await types('go', a, b)).includes('reformatted'));
});
