// Precision and recall of extract/inline detection on per-commit history,
// against test/fixtures/labels/history-extracts.json.
// Usage: node bench/recall.ts <labels.json> <repo>=<dataset.json> ...
//   e.g. node bench/recall.ts test/fixtures/labels/history-extracts.json vite=hist-vite.json hugo=hist-hugo.json
// One helper per (repo, commit, file, kind) counts once, however many callers it has.
import fs from 'node:fs';
import { configure, languageForPath, semanticDiffFile } from '../src/index.ts';
import { switchRulesOff } from '../src/runtime.ts';

const [, , labelsPath, ...sets] = process.argv;
if (!labelsPath || !sets.length) throw new Error('usage: node bench/recall.ts labels.json repo=data.json ...');
type Label = { repo: string; commit: string; file: string; kind: 'extract' | 'inline'; helper: string; label: string; note?: string };
const RANK: Record<string, number> = { extract: 3, inline: 3, borderline: 2, no: 1 };
const key = (repo: string, commit: string, file: string, kind: string, helper: string) => `${repo}|${commit.slice(0, 7)}|${file}|${kind}|${helper}`;
const labels = new Map<string, Label>();
for (const l of (JSON.parse(fs.readFileSync(labelsPath, 'utf8')).labels as Label[])) {
  const k = key(l.repo, l.commit, l.file, l.kind, l.helper);
  if ((RANK[l.label] ?? 0) > (RANK[labels.get(k)?.label ?? ''] ?? 0)) labels.set(k, l);
}

const labelledFiles = new Set([...labels.values()].map((l) => `${l.repo}|${l.commit.slice(0, 7)}|${l.file}`));

/** The function name in a declaration's first line. */
const nameIn = (header: string) =>
  // Ruby: `def name`, `def self.name`, `private def name?` (no parentheses needed); Python's `def f(` reads the same.
  (header.match(/^\s*(?:(?:private|protected|public)\s+)?def\s+(?:self\.)?([\w$]+[?!=]?)/) ?? [])[1] ??
  (header.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/) ?? [])[1] ?? // generics may span lines
  (header.match(/^\s*(?:export\s+)?(?:(?:const|let|var)\s+|(?:(?:private|public|protected|readonly|static)\s+)*)([\w$]+)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\(|<|function\b|[\w$]+\s*=>)/) ?? [])[1] ??
  // A value wrapped in a call: `const load = Effect.gen(function* () {`, `readonly f = Effect.fn("f")(`.
  (header.match(/^\s*(?:export\s+)?(?:(?:const|let|var)\s+|(?:(?:private|public|protected|readonly|static)\s+)+)([\w$]+)\s*(?::[^=]*)?=\s*[\w$.]+\s*[(<]/) ?? [])[1] ??
  // Any other top-level constant is named by its variable (`export const f: { ...=> ... } = dual(2, ...)`).
  (header.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)/) ?? [])[1] ??
  (header
    .replace(/^\s*func\s*(\([^)]*\))?\s*/, '') // Go receiver
    .replace(/^\s*pub(\([^)]*\))?\s+/, '') // Rust visibility: `pub(crate) fn f(`
    .match(/([\w$]+)\s*(<[^>]*>|\[[^\]]*\])?\s*\(/) ?? [])[1] ?? '?';

// CLEF_ANSWERS=answers.jsonl CLEF_T=0.9: accept a candidate the rules reject when Clef's looked-up
// answer is at least CLEF_T (harness/compare/clef.py asks; answers keyed by `ckey` below).
// SEMANTIC_NO_<RULE>=1 switches one engine rule off for this run, to measure what it adds.
switchRulesOff(Object.keys(process.env).filter((k) => k.startsWith('SEMANTIC_NO_') && process.env[k]).map((k) => k.slice('SEMANTIC_NO_'.length)));
let currentFile = '';
if (process.env.CLEF_ANSWERS) {
  const { createHash } = await import('node:crypto');
  const read = (file: string) => {
    const m = new Map<string, number>();
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) if (l.trim()) { const x = JSON.parse(l); if (x.ckey) m.set(x.ckey, x.p); }
    return m;
  };
  const answers = read(process.env.CLEF_ANSWERS);
  const t = Number(process.env.CLEF_T ?? 0.9);
  // Tie-breaker: CLEF_BAND=0.6 CLEF_ANSWERS2=answers-clef.jsonl CLEF_T2=0.8 also accepts an answer
  // in [CLEF_BAND, CLEF_T) when the second model's answer is at least CLEF_T2.
  const band = process.env.CLEF_BAND ? Number(process.env.CLEF_BAND) : null;
  const answers2 = process.env.CLEF_ANSWERS2 ? read(process.env.CLEF_ANSWERS2) : new Map<string, number>();
  const t2 = Number(process.env.CLEF_T2 ?? 0.8);
  configure({ secondOpinionCopyCheck: !process.env.CLEF_NO_COPY_CHECK, secondOpinion: (c) => {
    const k = createHash('sha256').update([c.kind, currentFile, c.code.helper, c.code.caller, c.code.callerNew].join('\0')).digest('hex').slice(0, 24);
    const p = answers.get(k) ?? 0;
    return p >= t || (band !== null && p >= band && (answers2.get(k) ?? 0) >= t2);
  } });
}
const reported = new Set<string>();
const inDataset = new Set<string>();
for (const set of sets) {
  const [repo, path] = set.split('=') as [string, string];
  for (const f of JSON.parse(fs.readFileSync(path, 'utf8'))) {
    inDataset.add(`${repo}|${f.commit.slice(0, 7)}|${f.name}`);
    const lang = languageForPath(f.name);
    if (!lang || f.oldContents === f.newContents) continue;
    // QUICK=1: only files that have labels (fast iteration; a full run also catches new unlabelled reports).
    if (process.env.QUICK && !labelledFiles.has(`${repo}|${f.commit.slice(0, 7)}|${f.name}`)) continue;
    currentFile = f.name;
    const r = await semanticDiffFile(lang, f.oldContents, f.newContents, f.name);
    const O = f.oldContents.split('\n');
    const N = f.newContents.split('\n');
    for (const o of r.semanticOperations) {
      if (o.type !== 'extractedFunction' && o.type !== 'inlinedFunction') continue;
      const c = o.spans.find((s) => s.role === 'container') as { old?: Array<{ start: { line: number }; end: { line: number } }>; new?: Array<{ start: { line: number }; end: { line: number } }> };
      // The header runs from the declaration's start (annotations, attributes, decorators
      // included) to its opening brace: read the name after those.
      const hr = o.type === 'extractedFunction' ? c.new![0]! : c.old![0]!;
      const L = o.type === 'extractedFunction' ? N : O;
      const header = L.slice(hr.start.line - 1, (hr as { end?: { line: number } }).end?.line ?? hr.start.line)
        .filter((l) => !/^\s*(@|#\[|\[[A-Z])/.test(l))
        .join(' ');
      reported.add(key(repo, f.commit, f.name, o.type === 'extractedFunction' ? 'extract' : 'inline', nameIn(header)));
    }
  }
}

// Only the repositories given on the command line count.
const repos = new Set(sets.map((x) => x.split('=')[0]!));
// And only labels on files the dataset holds: a label from another tool's run can name a
// file the dataset leaves out (tests, say), which no engine run on this dataset could find.
for (const [k, l] of labels) if (!repos.has(l.repo) || !inDataset.has(`${l.repo}|${l.commit.slice(0, 7)}|${l.file}`)) labels.delete(k);
const real = [...labels.values()].filter((l) => l.label === 'extract' || l.label === 'inline');
const found = real.filter((l) => reported.has(key(l.repo, l.commit, l.file, l.kind, l.helper)));
const wrong = [...labels.values()].filter((l) => l.label === 'no' && reported.has(key(l.repo, l.commit, l.file, l.kind, l.helper)));
const borderline = [...labels.values()].filter((l) => l.label === 'borderline' && reported.has(key(l.repo, l.commit, l.file, l.kind, l.helper)));
const unlabelled = [...reported].filter((k) => !labels.has(k));
console.log(`real ${real.length}: found ${found.length} (recall ${((100 * found.length) / real.length).toFixed(0)}%)`);
console.log(`reported ${reported.size}: ${found.length} real, ${borderline.length} borderline, ${wrong.length} wrong, ${unlabelled.length} unlabelled`);
for (const l of wrong) console.log('  wrong:', l.kind, l.helper, l.file, l.note ?? '');
for (const k of unlabelled) console.log('  unlabelled:', k);
// DUMP_REPORTED=file: append every claim's key (for sampling claims to check by hand).
if (process.env.DUMP_REPORTED) fs.appendFileSync(process.env.DUMP_REPORTED, [...reported].map((k) => k + '\n').join(''));
if (process.env.MISSED) for (const l of real.filter((x) => !found.includes(x))) console.log('  missed:', l.kind, l.helper, l.file);
