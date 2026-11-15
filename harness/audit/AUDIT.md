# Auditing moved / renamed / reformatted / reordered labels (strict, independent judge)

A semantic diff tool labelled parts of real code changes. Each item is one label: the lines it
covers in the old file and in the new file. Judge whether the label is TRUE of those lines.
A wrong label is dangerous: reviewers skip code labelled as unchanged in meaning, so a real edit
hidden under "reformatted" or "renamed" is the worst error. Judge on the code alone.

Each item: `id, project, commit, file, kind, old[{start,end,text}], new[{start,end,text}]`.
Repos are read-only clones at `harness/work/repos/<project>` (never modify them). Use
`git -C <repo> show <commit>^:<file>` and `git -C <repo> show <commit>:<file>` when the excerpt
is not enough (excerpts are cut at 40 lines).

What each kind claims:
- **moved**: the old lines and the new lines are the same code, now in a different place,
  with nothing changed except indentation.
- **movedWithEdit**: the same code moved, and also edited on the way. TRUE if most of it is the
  same code; the edit itself is shown to the reviewer separately.
- **renamed**: the only change on these lines is one name replaced by another, consistently.
  Any other change on a covered line (a different value, call, argument, operator) makes it WRONG.
- **reformatted**: the old and new lines are the same code laid out differently (whitespace,
  line breaks, trailing commas, optional parentheses or semicolons that change nothing).
  Any change in behaviour or meaning makes it WRONG.
- **reordered**: the same lines (e.g. imports, members) in a different order, unchanged.

Labels:
- `correct`: the claim is true of these lines.
- `wrong`: it is false, i.e. something a reviewer would need to see is hidden or misdescribed. Say what.
- `borderline`: defensible either way (say why).

Write JSON to the output path you were given: `{"labels":[{"id":1,"label":"correct|wrong|borderline","note":"one short sentence"}]}`,
one entry per input item.
