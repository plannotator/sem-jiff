# Blind label-validity study

Does a human agree with the AI-written labels that every accuracy number rests on? `PROTOCOL.md` is the plan,
fixed before any answer was collected; `RESULTS-fable.md` is the outcome.

| File | What it is |
|---|---|
| `PROTOCOL.md` | The protocol, fixed in advance |
| `sample.py` | Draws the sample (writes `www/items.json` and `key.json`) |
| `www/items.json` | The 40 screens a rater sees (36 items plus 4 repeats) |
| `items-short.json` | The 6 items that needed a human call after the AI second rater |
| `key.json` | The answer key: stratum and AI label per item (hidden from the rater) |
| `responses-fable.json` | The AI second rater's answers |
| `analyze.py` | The analysis, unchanged since the protocol was fixed |
| `serve.py`, `www/index.html` | The rating page (`python3 serve.py`, then open http://127.0.0.1:8765) |
| `PREREGISTERED.sha256` | Checksums of the files fixed before any answer (`shasum -a 256 -c` from this folder) |

## Other projects' code

Each item names a function pulled out of, or folded back into, its caller in another project. Every item keeps the
finding (`kind`, `helper`, `caller`) and a `source` pointer: the repository, the full commit and its parent, the path,
and the line ranges of the helper and of the caller before and after, plus the project's licence as read from its
LICENSE file at that commit.

The quoted code (`helperText`, `callerOld`, `callerNew`) is kept only for projects that are clearly MIT, Apache-2.0,
BSD or ISC both at that commit and today. For the others (GPL, AGPL, a licence that changed, or no licence file) only
the pointer is kept, and the rating page shows the links instead of the code.

## Why the checksums differ from the original record

The checksums were first recorded on 2026-11-09 with absolute paths on the author's machine; the paths are now
relative to this folder. `PROTOCOL.md`, `analyze.py` and `key.json` are byte for byte the files that were fixed, so
their checksums are the original ones. `www/items.json` is not: the published copy drops the quoted code described
above and adds the `source` pointers, so its checksum is that of the published file. The original record for it was
`fd660282e094b5cbed2f5dabc90ceaefad1fa95e1a642fd9453af9e05989b2bd`. The responses were collected with the original
file. The human rater's raw answers are not published; their summary is in `RESULTS-fable.md`.
