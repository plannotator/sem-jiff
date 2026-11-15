# Corpora and expected answers for new languages (PHP, Ruby, Kotlin, Swift, Java, C#)

Written before any engine code for these languages exists, and before the engine is run on any of these cases.
In the original history each language was one commit, so the answers came first. `PREREGISTERED.sha256` records the sha256 of every answer file at that
commit, the way `harness/study/PREREGISTERED.sha256` does.

Nobody else's code is committed: the real cases name a repository, commit and file, and `build.ts` downloads them.
`<lang>/texts.sha256` pins the exact before/after text each answer was written against; `build.ts` refuses a text
that does not match.

## Files per language

| File | What it holds |
|---|---|
| `harness/lang/<lang>/projects.json` | Projects, same fields as `harness/projects.json` (`name`, `set`, `labels`, `url`, `files`, `commits`), plus `licence`. Sets are `practice-<lang>` and `held-<lang>`; whole projects are held out, never single cases. |
| `harness/lang/<lang>/manifest.json` | `{project: {commit10: [file, ...]}}`, the same shape as `harness/manifest.json.gz`. |
| `harness/lang/<lang>/texts.sha256` | `<sha256>  <project>/<commit10>/<old\|new>/<path>`, one line per side of every file. |
| `test/fixtures/labels/lang-<lang>-extracts.json` | Real extracted/inlined functions, in the `history-extracts.json` format (`repo, kind, commit, file, helper, caller, label, note, src`). `label` is `extract`, `inline`, `borderline` or `no`; `src` is `curated`. `bench/recall.ts` and `harness/score.ts` read it unchanged. |
| `test/fixtures/labels/lang-<lang>-expected.json` | Real moves, renames, reformatting and the "never plain moved" cases, in the `audit-moves.json` format (`id, project, commit, file, kind, old, new, label, note`). See below. |
| `test/fixtures/traps/<lang>.json` | Constructed trap cases, in the `test/fixtures/stress/stress-cases.json` format plus `never` (and, for the Java/C# naming cases, `names`). See below. |

## Expected answers on real commits (`lang-<lang>-expected.json`)

Each item is a claim the engine could make, labelled before it is made, with the audit labels of `harness/audit/AUDIT.md`:

- `kind`: `moved`, `movedWithEdit`, `renamed`, `reformatted` or `reordered`. Extracts and inlines live in the extracts file.
- `old`, `new`: 1-based inclusive line ranges in the before and after text: the declaration or lines the change covers
  (comments and annotations directly above a declaration count as part of it).
- `label`:
  - `correct`: the engine should make this claim; missing it is a miss.
  - `wrong`: the engine must NOT make this claim; making it is a false claim. Used for the decided "context changed"
    rule (a move across a Ruby `private` line, into a constrained Swift extension or another `#if` branch, between a
    Kotlin class and its companion, reordered data-class parameters) and for a rename that hides another edit.
  - `borderline`: defensible either way (say why in `note`); a claim here is neither found nor wrong.
- `expect` (optional): what the engine should say instead, for `wrong` items (usually `edited`).
- `name` (optional): the declaration the claim is about, for the Sem tab's naming.

Matching: line conventions (blank lines, attached comments) vary, so a claim matches an item when its kind is the same
and its old and new ranges overlap the item's. Claims on files in the manifest that match no item are unlabelled and
go to the strict audit as usual.

## Constructed trap cases (`test/fixtures/traps/<lang>.json`)

Small before/after pairs, one per trap in section 2 of the spec. Each case:

```json
{ "id": "rb-private-move", "area": "trap", "language": "ruby", "title": "...", "expected": "plain words",
  "status": "ok", "old": "...", "new": "...",
  "ops": [{ "type": "moved", "old": [[2, 4]], "new": [[9, 11]] }],
  "never": [{ "type": "moved" }],
  "names": [{ "type": "moved", "name": "total", "not": ["Order"] }] }
```

- `ops`: the semantic operations (types in `moved, movedWithEdit, renamed, reformatted, reordered, extractedFunction,
  inlinedFunction`) the engine should produce, matched by type and overlapping ranges. An empty list means "plain
  edits only".
- `never`: claims that are false here. A `never` entry with no ranges forbids that type anywhere in the file; with
  ranges, only where it overlaps them. For the "never plain moved" cases, a plain `moved` is a false claim.
- `names` (Java/C# naming cases): the name the Sem tab should show for that operation, and names it must not show.
  `added` and `deleted` may appear in `never` there (an extra "added" for a blank line and brace).
- `status`: `ok` (strict expectation) or `borderline` (defensible either way; the note says why; scored as neither
  pass nor fail, but a `never` entry still counts).

## Rebuilding the real texts

```sh
node harness/lang/build.ts ruby            # fetch each listed commit (depth 2, blobs on demand), write
                                           # harness/work/data/hist-<project>.json, check every sha256
node harness/lang/build.ts ruby --dir /tmp/w
```

The datasets have the shape `harness/setup.ts` writes, so once the projects are added to `harness/projects.json`,
`node harness/score.ts --set practice-ruby` scores the extracts like any other set (held sets print totals only).

## Running the trap cases

`node --test test/traps.test.ts` runs every `test/fixtures/traps/<lang>.json` (languages the engine does not read
yet are skipped). An `ops` entry may carry `"optional": true`: the claim may be made but need not be. Every claim the
engine makes (moved, movedWithEdit, renamed, reformatted, reordered, extracted, inlined) must overlap an `ops` entry
of its type, so `ops: []` means plain edits only. A case may name its `file` (e.g. `view.phtml`); it is information
only, the `language` field picks the grammar.
