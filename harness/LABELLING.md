<!-- The instructions given to the independent labelling agents (latest version). -->
# Labelling extract/inline candidates (strict, independent judge)

You hand-label candidates for extracted and inlined functions, to measure what a semantic-diff engine MISSES and what
it reports WRONGLY. Many candidates are noise; that's expected.

Each item: `id, repo, kind (extract|inline), commit, file, helper`; most also have `caller, coverage, helperBody (first
lines), callerLost (first lines removed from / added to the caller)`. Items with `src: "engine"` have no caller or
preview: find the caller yourself from the commit. Judge every item on the code alone.

Repos are the shallow, no-checkout clones `node harness/setup.ts` makes under
`harness/work/repos/<repo>` (read-only, never modify).
Read code with `git -C <repo> show <commit> -- <file>`, `git -C <repo> show <commit>^:<file>`, `git -C <repo> show <commit>:<file>`.
Use the preview first; open the commit when it is not enough, and always for engine-only items.

Definitions:
- extract: `helper` is a NEW function, and code previously written inline in an existing function (the caller) now lives
  in `helper`, with the caller now calling it. Small edits on the way still count (renamed variables, generalised
  parameters, a wrapped return value).
- inline: `helper` is an OLD function that disappears, and its body now appears inside the caller in place of the call.
- borderline: defensible either way (tiny one- or two-line helper with weak resemblance; code mostly rewritten; or the
  helper already existed under another name or elsewhere and was only moved or renamed).
- no: wrong (unrelated new code sharing common tokens; no function lost that code; a plain rename or move).

Judge the HELPER, not the listed caller. If the helper is a real extract (or inline) but its code came from (or went
into) a different function than the listed `caller`, label it extract (or inline) and put the real caller in `caller`,
saying so in the note. Use "no" only when the helper is not an extract or inline from any caller.

Write JSON to the output path you were given: `{"labels":[{"id":1,"repo":"...","kind":"extract","commit":"...",
"file":"...","helper":"...","caller":"...","label":"extract|inline|borderline|no","note":"one short sentence"}]}`,
one entry per input item.

Reply in under 200 words: counts per label; every engine-only item labelled no (id, helper, why).

For Effect projects (the Effect sets add this paragraph): A function is often defined through an Effect constructor and
counts as a function all the same:
- `const loadUser = Effect.gen(function* () { ... })`, run with `yield* loadUser`
- `const find = Effect.fn("find")(function* (id) { ... })` or `Effect.fnUntraced(function* ...)`, run with `yield* find(id)`
- plain arrows returning effects, `Effect.suspend(() => ...)`, and service methods inside `Effect.Service` / `Layer` builders
A helper may also be used by passing it as a value (`Effect.flatMap(loadUser)`, `.pipe(Effect.map(toDto))`); that is a
use of the helper like a call. Judge extract/inline exactly as defined above.
