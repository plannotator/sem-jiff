# Head-to-head comparisons

`sem-jiff` measured against other code-diff tools on identical inputs, scored the same way.
The point is as much to learn from them as to rank: every case another tool gets and we
miss is studied, and the fixes are checked on held-out projects before they are kept.

## Tools

| Tool | Version | What it reports | Get it |
|---|---|---|---|
| sem-jiff | this repo | moved, renamed, reformatted, reordered, extracted, inlined, edited | — |
| RefactoringMiner | 3.1.6 | refactorings, incl. Extract/Inline Method, Rename Variable (Java; JS/TS support is newer) | [releases](https://github.com/tsantalis/RefactoringMiner/releases) |
| GumTree | 4.1.0 | a tree edit script: move, update, insert, delete (no C# in this setup) | [releases](https://github.com/GumTreeDiff/gumtree/releases) |
| sem | 0.29.1 | changed entities (functions, classes): added, modified, moved, renamed, reordered | [releases](https://github.com/Ataraxy-Labs/sem/releases) |
| difftastic | 0.72.0 | a structural, syntax-aware diff (no notion of moved code) | [releases](https://github.com/Wilfred/difftastic/releases) |

Put them under `harness/work/tools/` (`difft`, `sem`, `gumtree-4.1.0/`, `RefactoringMiner-3.1.6/`),
or point `DIFFT`, `SEM`, `GUMTREE`, `REFACTORINGMINER` at them. GumTree and RefactoringMiner
need Java 21 (`JAVA_HOME`).

## 1. Extracted and inlined functions on real commits

Only RefactoringMiner also detects these, so it is the comparison. Same commits, same files
(RefactoringMiner reads whole commits; claims in files our datasets leave out, mostly tests,
are dropped for both tools), same answer key, same-file only. When RefactoringMiner claims
something our labels do not cover, an independent agent labels it blind (it is not told which
tool found it) and the answer key grows; the scores below use the completed key.

```sh
node harness/setup.ts guava kafka spring-boot netty
python3 harness/compare/refactoringminer.py guava kafka spring-boot netty
node harness/score.ts --set practice      # sem-jiff on the same projects
```

Java (Guava, Kafka, Spring Boot practice; Netty held out), 122 real cases:

| | Found | Wrong claims | Borderline claims |
|---|---|---|---|
| RefactoringMiner | 96 (79%) | 19 | 33 |
| sem-jiff before this comparison | 68 (56%) | 1 | 7 |
| sem-jiff after learning from it | 74 (61%) | 1 | 8 |

RefactoringMiner finds more; sem-jiff is far less often wrong. Its blind-labelled extra
claims also showed our own candidate search had missed 42 real cases, now in the labels.

## 2. Moves, renames and formatting on generated changes

Known changes applied to real files (`bench/synthetic.ts`), every tool run on the same old/new
pairs, each tool's output translated to the same question: did it say what the change was, and
did it claim a kind of change that did not happen? A tool that cannot express a kind of change
is marked "can't say" for it, not scored as missing it.

```sh
EXPORT=cases.jsonl node bench/synthetic.ts <dataset.json> 40 7   # repeat per dataset
python3 harness/compare/synthetic_run.py cases.jsonl raw.jsonl
python3 harness/compare/synthetic_judge.py cases.jsonl raw.jsonl
```

810 changes in TypeScript, Java, Go, Python, Rust and C#:

| Change | sem-jiff | RefactoringMiner (Java) | GumTree | sem | difftastic |
|---|---|---|---|---|---|
| moved | 100% | — | 100% | 99% | can't say |
| renamed | 97%, 99% after fixes (184 of 185) | 100% | 97% | can't say | 85% |
| reformatted | 100% | 100% | 100% | 100% | 99% |
| imports re-sorted | 100% | can't say | 100% | 0% | can't say |
| extracted / inlined | 100% | 100% | can't say | can't say | can't say |

No tool made more than 3% false claims here; generated changes are easy, so this mostly shows
what each tool can say at all. Median time per file pair: sem-jiff 0.05 s, difftastic 0.05 s,
sem 0.02 s, GumTree 1.3 s, RefactoringMiner 3 s (both Java tools include JVM start-up per call).

## Refreshed 2026-11-09 (current engine, with and without the Jev second opinion)

Pulled-out functions (extract/inline), same commits and files, completed answer key:

| | Java practice (91 real) | Netty, held (31) | TypeScript practice (187) | TypeScript held (146, before new labels) |
|---|---|---|---|---|
| RefactoringMiner 3.1.6 | 70 found, 16 wrong | 26, 3 wrong | 73, 14 wrong | 66, 4 wrong |
| sem-jiff | 52, 1 wrong | 22, 0 wrong | 105, 1 wrong | 82, 1 wrong |
| sem-jiff + Jev (multiple choice, 0.74) | 62, 1 wrong | 24, 0 wrong | 148, 1 wrong | 111, 1 wrong |

RefactoringMiner timed out on some TypeScript commits (its per-commit limit), which costs it finds there.

Generated changes rerun (541 changes, six languages; `harness/work/synthetic/`): moved 100% (GumTree 100%,
sem 100%), renamed 99% (RefactoringMiner 100% on Java, GumTree 97%, difftastic 98%), re-indented 97%
(fixed since for Rust strings continued with a backslash: 29 of 31 Rust cases now), imports re-sorted 100%
(GumTree 100%, sem 0%), extracted/inlined 96% (RefactoringMiner 100% on Java; sem 21% false claims). No
false claims from sem-jiff. Median per file pair: sem-jiff 0.06 s, difftastic 0.05 s, sem 0.02 s, GumTree
1.4 s, RefactoringMiner 2.4 s.

## More tools, 2026-11-09 (landscape check)

A sweep of what else exists found three things worth measuring on the same 541 generated changes:

| Change | sem-jiff | plain git (`--color-moved`, `-w`) | diffmantic 0.15.0 | sem 0.30.0 |
|---|---|---|---|---|
| moved (75) | 100% | 97% | 100% | 100% |
| renamed (94) | 99% | can't say | 97% (no C#) | can't say |
| re-indented (156) | 97% (99% after the Rust fix) | 100% | 97%, 3% false claims (no C#) | 99% |
| imports re-sorted (168) | 100% | 36% | 100% (no C#) | 0% |
| extracted / inlined (48) | 96% | can't say | can't say | can't say; 21% false claims |

- **plain git** is what every reviewer already has. `--color-moved` only marks blocks of 20 or more
  letters and digits, so short import lines stay red and green. `-w` hides every whitespace change,
  including ones that matter (Python indentation, text inside strings); it cannot tell the two apart.
- **diffmantic** (MIT, Go, tree-sitter; an edit script like GumTree's, about 15x faster) is new and its
  README says it is not ready for public use. No C#. Run here under a no-network sandbox.
- **sem 0.30.0** (released 2026-11-09) scores the same as 0.29.1.

**RefactoringMiner on Python** (it reads Python since 3.1.5). Pulled-out functions on the four Python
practice projects (black, django, rich, scrapy), same commits, files and answer key; its 18 claims that
had no label were judged blind first (3 real, 9 borderline, 6 wrong), which brings the key to 61 real:

| | Python practice (61 real) |
|---|---|
| RefactoringMiner 3.1.6 | 44 found, 9 wrong, 12 borderline |
| sem-jiff | 46 found, 0 wrong, 0 borderline |

```sh
python3 harness/compare/refactoringminer.py black django rich scrapy
python3 harness/compare/synthetic_git.py harness/work/synthetic/cases-now.jsonl
python3 harness/compare/synthetic_more.py harness/work/synthetic/cases-now.jsonl   # DIFFM=, SEM=
```

Not measured, and why: SemanticDiff (the closest product: a free VS Code extension and a GitHub app by
Sysmagine, closed, no command line; its docs say it hides style-only changes, marks code moved within a
file, and that refactoring detection "is currently limited to renames"; its web app needs a GitHub login
once the anonymous allowance is used up, and we chose not to sign up), CodeRabbit's semantic view and Devin
Review (closed services on pull requests), GitClear (closed desktop app), diffsitter (formatting only),
RefDiff 2.0 and PyRef (old or unmaintained; RefactoringMiner now covers their languages), RefactorInsight
(a UI over RefactoringMiner), CodeTracker (history, not a diff), Mergiraf (merges only). No tool found
detects extract or inline for Rust or C#.


## PHP, 2026-11-14 (sem v0.8.0 and difftastic 0.72.0)

sem v0.8.0 is the version Plannotator pins; its linux-arm64 release runs in Docker with no network
(`harness/compare/sem080-setup.sh`, `sem080`). Each tool's output is mapped onto our labels
(`harness/compare/tool_claims.py`; spec section 5): sem moved/reordered without structural change = moved,
renamed = renamed, modified without structural change = reformatted; difftastic no changed tokens = reformatted,
1-2 distinct changed words = renamed. Every claim matching no expected answer went to one pooled blind audit
(`harness/audit/AUDIT.md`, tool names withheld). Held-out: totals only.

Moves, renames and formatting on real commits (correct / wrong / borderline claims):

| | practice (laravel, symfony) | held (composer) |
|---|---|---|
| sem-jiff | 23 claims: 21 / 1 / 1; 6 of 7 expected found | 4 claims: 4 / 0 / 0 |
| sem v0.8.0 | 208 claims: 23 / 136 / 49; 2 of 7 expected found | 18 claims: 1 / 2 / 15 |
| difftastic 0.72.0 | 23 claims: 4 / 18 / 1; 2 of 7 expected found | 5 claims: 0 / 5 / 0 |

sem's wrong claims are mostly "modified without structural change" on whole classes whose doc comments changed
(type annotations), and renames that hide a different call or value. Extracted and inlined functions: only
sem-jiff can say (practice 18 of 21 found, 0 wrong; held 15 of 26, 0 wrong).

Generated changes on practice files (`bench/synthetic.ts`, 1,311 changes):

| Change | sem-jiff | sem v0.8.0 | difftastic |
|---|---|---|---|
| moved (336) | 100% | 38% | can't say |
| renamed (208) | 99% | can't say | 99% |
| re-indented (364) | 100% | 99% | 99% |
| imports re-sorted (351) | 100% | 0% | can't say |
| extracted / inlined (52) | 100% | can't say | can't say |

No false claims from any tool here. Median per file pair: sem-jiff 0.02 s, difftastic 0.05 s, sem 0.45 s
(a Docker start per pair).


## Ruby, 2026-11-15 (sem v0.8.0 and difftastic 0.72.0)

Same mapping and pooled blind audit as PHP (above). Held out: `held-ruby2` (sinatra, devise, fastlane, puma, hanami;
5,625 files), labelled before any engine run; the first held-out set (jekyll, brew) was opened and is practice now
(`harness/lang/ruby/NOTES.md`). Held-out: totals only.

Moves, renames and formatting on real commits (correct / wrong / borderline claims):

| | practice (rails, rubocop, jekyll, brew) | held (held-ruby2) |
|---|---|---|
| sem-jiff (as shipped: moved-with-edits held back) | 14 claims: 13 / 0 / 1; 12 of 21 expected found | 258 claims, all audited: 254 / 1 / 3 |
| sem-jiff with moved-with-edits | 15 claims: 14 / 0 / 1; 12 of 21 expected found | 290 claims, all audited: 280 / 4 / 6 |
| sem v0.8.0 | 11 claims: 10 / 1 / 0; 6 of 21 expected found | 1,785 claims; sample of 155: 56 / 22 / 77 (wrong 14%, 95% CI 10-21%) |
| difftastic 0.72.0 | 1 claim: 1 / 0 / 0; 1 of 21 expected found | 182 claims; 122 audited: 80 / 37 / 5 (wrong est. 33%) |

sem-jiff's 4 wrong held-out claims: 3 moved-with-edits (of 32) and 1 rename (of 46); none of its 146 formatting
claims or 66 plain moves. Ruby therefore holds moved-with-edits back in v1 (`holdBack` in `src/parse.ts`;
recounted from the same audit). The one wrong claim left is a rename (puma bd987e0360, commonlogger.rb:73,90):
`HTTP_VERSION = Const::HTTP_VERSION` was removed and `SERVER_PROTOCOL = Const::SERVER_PROTOCOL` added, and the two
uses `env[HTTP_VERSION]` -> `env[SERVER_PROTOCOL]` were called a rename, though `Const::SERVER_PROTOCOL` is another,
existing constant with another value. The shared rename check takes a name after `::` as this file's own. Extracted and inlined functions (only sem-jiff can say): practice 23 of 28 found, 0 wrong;
held 48 of 94 pre-registered real ones found, 0 wrong, 1 borderline; the 13 it found beyond the pre-registered
sample were judged blind afterwards: 12 real, 1 borderline (60 of 106 with them).

Generated changes on rails and rubocop (`bench/synthetic.ts`, 1,304 files, 2,177 changes):

| Change | sem-jiff | sem v0.8.0 | difftastic |
|---|---|---|---|
| moved (847) | 97% (97.6% -> 97.4% counting moved-with-edits, once held back) | 82% | can't say |
| renamed (538) | 99% | can't say | 91% |
| re-indented (560) | 100% | 100% | 100% |
| imports re-sorted (18) | 100% | 0% | can't say |
| extracted / inlined (214) | 98% | can't say | can't say |

One false claim by sem-jiff there (one extract, also counted mirrored as an inline): a 4-line helper of repeated
lines was not recognised and its lines were called moved with edits. Median per file pair: sem-jiff 0.02 s,
difftastic 0.03 s, sem 0.30 s (a Docker start per pair).

## Kotlin, 2026-11-15 (sem v0.8.0 and difftastic 0.72.0)

Same mapping and pooled blind audit as PHP and Ruby. Engine scored: score/kotlin 879833f (lang/ruby 7712c7e merged
with lang/kotlin 0c4089e); every Kotlin claim is identical on 4e3f3dc, which adds `contextRuns` (the per-range context
comparison for Kotlin only). Held out: `held-kotlin` (ktor, Exposed; 1,519 files). Held-out: totals only.

Moves, renames and formatting on real commits (correct / wrong / borderline claims):

| | practice (okhttp, kotlinx.coroutines) | held (ktor, Exposed) |
|---|---|---|
| sem-jiff | 65 claims, all judged: 59 / 1 / 5; 18 of 21 expected found | 46 claims, all judged: 40 / 0 / 6; 5 of 11 expected found |
| sem v0.8.0 | 375 claims; 130 judged: 33 / 71 / 26 (wrong 55%, 95% CI 46-63%) | 781 claims; 164 judged: 49 / 40 / 75 (wrong 24%, 95% CI 18-31%) |
| difftastic 0.72.0 | 41 claims, all judged: 26 / 14 / 1 | 70 claims, all judged: 13 / 51 / 6 |

sem-jiff on held-out by kind: moved 10 (7 / 0 / 3), moved with edits 5 (3 / 0 / 2), renamed 4 (4 / 0 / 0),
reformatted 27 (26 / 0 / 1). Kotlin holds moved-with-edits back in v1 (`holdBack`, as Ruby): 5 held-out claims
with 0 wrong is unmeasured, not passed; it returns for Ruby and Kotlin together once a fresh held-out draw gives about
50 clean audited claims. As shipped (recounted from the same audit): practice 58 claims, 54 / 0 / 4, 15 of 21 expected
found; held-out 41 claims, 37 / 0 / 4, 5 of 11 found; generated moves 558 of 563 plain either way. Most of the other tools' wrong claims are "reformatted" (sem: modified without
structural change; difftastic: no changed tokens) where KDoc text changed. sem v0.8.0 could not read 19 files
(12 of them hung past 120 s and were stopped).

Extracted and inlined functions (only sem-jiff can say): practice 12 of 17 found, 0 wrong, 1 borderline; held 15 of 31
found, 0 wrong.

Generated changes on okhttp and kotlinx.coroutines (`bench/synthetic.ts`, 756 files, 2,069 changes):

| Change | sem-jiff | sem v0.8.0 | difftastic |
|---|---|---|---|
| moved (563) | 99% | 52% | can't say |
| renamed (373) | 99% | can't say | 94% |
| re-indented (522) | 100% | 100% | 100% |
| imports re-sorted (569) | 100% | 0% | can't say |
| extracted / inlined (21 each) | 95% | can't say | can't say |

sem v0.8.0 ran on the generated changes in a second pass (TMPDIR under the home folder, so its container sees the
repositories); 3 of its 2,069 results were unreadable (timed out), and it made no false claim. sem-jiff's false claims there: one move also called part of the file reformatted, and one
extract (counted again mirrored as an inline) called moved. Median per file pair: sem-jiff 0.01 s, difftastic 0.05 s, sem 0.42 s (a Docker start per pair).


## Swift, 2026-11-15 (sem v0.8.0 and difftastic 0.72.0)

Same mapping and pooled blind audit as PHP, Ruby and Kotlin. Engine scored: score/swift 456755a (lang/ruby a0e2a02
+ lang/kotlin 0c4089e + lang/swift c514a7c); the unchanged check compares it with ac89440 (the same merge without
Swift). It predates Kotlin's moved-with-edits hold-back and its per-range context rule for Kotlin only; lang/swift
06ceaf3 merges both, Swift sets `contextRuns` (the rule it was scored with), and Swift's claims with nothing held
back are identical on all four Swift datasets across 456755a, lang/swift and the review app's copy. Held-out: totals only.

Audit sample (seed 20261115): held, every sem-jiff claim (164 items not matched by an expected answer), 80 of
sem's 5,421 and 80 of difftastic's 146; practice, 120 of sem-jiff's 1,008, 60 of sem's 3,038 and 60 of
difftastic's 383. 555 items, 587 claim labels, 13 blind Fable judges (held judges reported counts only).

Moves, renames and formatting on real commits (correct / wrong / borderline claims):

| | practice (vapor, Alamofire) | held (swift-nio, swift-composable-architecture) |
|---|---|---|
| sem-jiff as shipped (moved-with-edits held back) | 985 claims; 131 audited: 131 / 0 / 0; 10 of 19 expected found | 158 claims, all audited: 157 / 0 / 1 |
| sem-jiff, nothing held back | 1,021 claims; 137 audited: 135 / 2 / 0; 12 of 19 expected found | 168 claims, all audited: 164 / 2 / 2 |
| sem v0.8.0 | 3,055 claims; 81 audited: 53 / 15 / 13; 10 of 19 expected found | 5,430 claims; 95 audited: 62 / 4 / 29 |
| difftastic 0.72.0 | 388 claims; 67 audited: 29 / 37 / 1; 4 of 19 expected found | 147 claims; 88 audited: 65 / 13 / 10 |

sem-jiff on held-out, per claim class: reformatted 137 (0 wrong), renamed 13 (0 wrong), moved 8 (1 borderline),
moved-with-edits 10 (2 wrong). Swift v1 holds back moved-with-edits only (`holdBack` in `src/parse.ts`), as Ruby
and Kotlin do. The director first held back every class with fewer than about 50 clean audited held-out claims
(lang/swift 8dca24a) and refined the rule after these results were seen: renamed, moved, extracted and inlined had
0 wrong on held-out, their shared logic is measured at scale in the other languages, and Swift's generated changes
are clean, so they ship; their held-out samples are small and are to be re-measured on a larger draw. Recount, no
new run.
The 2 wrong practice claims are moved-with-edits pairing different imports (`import NIOHTTP1` with
`import HTTPTypes`, vapor 8cfd55759c).

Extracted and inlined functions (only sem-jiff can say): practice 11 of 19 found, 0 wrong;
held 13 of 16 found, 0 wrong.

Generated changes on vapor and Alamofire (`bench/synthetic.ts`, 3,053 changes; the engine's rules, nothing held back):

| Change | sem-jiff | sem v0.8.0 | difftastic |
|---|---|---|---|
| moved (716) | 100% | 19% | can't say |
| renamed (562) | 91% | can't say | 93% |
| re-indented (1,090) | 100% | 100% | 96% |
| imports re-sorted (399) | 100% | 0% | can't say |
| extracted / inlined (286) | 96% | can't say (31% false claims) | can't say |

Holding back moved-with-edits changes nothing here: every generated move was found as a plain move. No false claim by sem-jiff or difftastic. sem v0.8.0 is run with
its git repos under the home folder (`TMPDIR`): under /var/folders Docker does not see them and every sem result is
"not a git repository". Median per file pair: sem-jiff 0.016 s, difftastic 0.09 s, sem 0.33 s.

Unchanged check (ac89440 -> 456755a): extract/inline scores identical on every set (practice, held-mixed, held-ts,
held-effect, held-final, PHP, Ruby, Kotlin); the earlier audited move/rename claims re-run identically; the
move/rename/format claims on the 16 PHP, Ruby and Kotlin datasets are identical line for line.
