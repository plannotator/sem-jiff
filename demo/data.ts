// Builds demo/dist/cases.json: examples run through our engine, plus the
// scoreboard (accuracy, coverage, speed).
// Usage: node demo/data.ts <dataset.json> [<extract-labels.json>]
//   dataset: [{ name, oldContents, newContents }] (e.g. bench pr-1000.json)
import fs from 'node:fs';
import { applyPatch, parsePatch } from 'diff';
import { languageForPath, semanticDiffFile } from '../src/index.ts';

const [, , dataPath, labelsPath = new URL('../test/fixtures/labels/vscode-pr1000-extracts.json', import.meta.url).pathname] = process.argv;
if (!dataPath) throw new Error('usage: node demo/data.ts <dataset.json> [labels.json]');
const out = new URL('./dist/', import.meta.url);
fs.mkdirSync(out, { recursive: true });

type FileIn = { name: string; oldContents?: string; newContents?: string };
const SEMANTIC = ['moved', 'movedWithEdit', 'reordered', 'renamed', 'reformatted', 'extractedFunction', 'inlinedFunction'];

interface Case {
  id: string;
  group: string;
  title: string;
  name: string;
  oldContents: string;
  newContents: string;
  patch: string;
  operations: unknown[];
  regions: unknown[];
  kinds: string[];
  ms: number;
}

async function run(group: string, title: string, name: string, oldContents: string, newContents: string): Promise<Case | null> {
  const lang = languageForPath(name);
  if (!lang) return null;
  const t = performance.now();
  const r = await semanticDiffFile(lang, oldContents, newContents, name);
  const ms = performance.now() - t;
  const kinds = [...new Set(r.semanticOperations.map((o) => o.type).filter((k) => SEMANTIC.includes(k)))];
  return { id: `${group}:${name}`, group, title, name, oldContents, newContents, patch: r.patch, operations: r.semanticOperations, regions: r.semanticFolds, kinds, ms };
}

const cases: Case[] = [];
const fixture = (p: string) => new URL(`../test/fixtures/${p}`, import.meta.url);

// Pierre's own example.
const go = JSON.parse(fs.readFileSync(fixture('pierre-inlined-function-go.json'), 'utf8'));
cases.push((await run('Examples', "Pierre's own example: inlined function (Go)", 'ops.go', go.oldContents, go.newContents))!);
// Hand-made extract cases.
for (const [dir, title] of [
  ['basic', 'Extracted function'],
  ['edited', 'Extracted function, edited on the way'],
  ['partial', 'Extracted function, plus a new check'],
  ['unrelated', 'Unrelated new function (should report no extract)'],
] as const) {
  const a = fs.readFileSync(fixture(`extract/${dir}/a.ts`), 'utf8');
  const b = fs.readFileSync(fixture(`extract/${dir}/b.ts`), 'utf8');
  cases.push((await run('Examples', title, `${dir}.ts`, a, b))!);
}

// Extract accuracy against hand labels, scored on every real file.
const { labels } = JSON.parse(fs.readFileSync(labelsPath, 'utf8')) as { labels: Array<{ file: string; into: string; label: string }> };
const realExtracts = labels.filter((l) => l.label === 'extract');
const found: string[] = [];

// Real files: everything with a semantic finding, plus overall numbers.
const files = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as FileIn[];
const times: number[] = [];
let checkedLines = 0;
let uncovered = 0;
let badPatches = 0;
let realFiles = 0;
const counts: Record<string, number> = {};
for (const f of files) {
  if (f.oldContents == null || f.newContents == null || f.oldContents === f.newContents || !languageForPath(f.name)) continue;
  const c = await run('Real vscode changes', f.name.split('/').slice(-2).join('/'), f.name, f.oldContents, f.newContents);
  if (!c) continue;
  realFiles++;
  times.push(c.ms);
  for (const op of c.operations as Array<{ type: string; lines: { old: Array<{ start: number; end: number }>; new: Array<{ start: number; end: number }> } }>) counts[op.type] = (counts[op.type] ?? 0) + 1;
  // Coverage and patch checks, as in bench/coverage.ts.
  if (applyPatch(f.oldContents, c.patch) !== f.newContents) badPatches++;
  const owned = { old: new Set<number>(), new: new Set<number>() };
  for (const op of c.operations as Array<{ lines: { old: Array<{ start: number; end: number }>; new: Array<{ start: number; end: number }> } }>)
    for (const side of ['old', 'new'] as const) for (const l of op.lines[side]) for (let n = l.start; n <= l.end; n++) owned[side].add(n);
  for (const h of parsePatch(c.patch)[0]?.hunks ?? []) {
    let o = h.oldStart;
    let n = h.newStart;
    for (const line of h.lines) {
      if (line[0] === '-') { if (line.slice(1).trim()) { checkedLines++; if (!owned.old.has(o)) uncovered++; } o++; }
      else if (line[0] === '+') { if (line.slice(1).trim()) { checkedLines++; if (!owned.new.has(n)) uncovered++; } n++; }
      else if (line[0] === ' ') { o++; n++; }
    }
  }
  for (const o of c.operations as Array<{ type: string; spans: Array<{ role: string; new?: Array<{ start: { line: number } }> }> }>) {
    if (o.type !== 'extractedFunction') continue;
    const header = c.newContents.split('\n')[(o.spans.find((s) => s.role === 'container')?.new?.[0]?.start.line ?? 1) - 1] ?? '';
    found.push(labels.find((l) => l.file === c.name && new RegExp(`\\b${l.into}\\s*[(<]`).test(header))?.label ?? 'unlabelled');
  }
  if (c.kinds.length && c.newContents.split('\n').length < 3000) cases.push(c);
}
const sorted = [...times].sort((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

const scoreboard = {
  dataset: dataPath.split('/').pop(),
  files: realFiles,
  speed: { medianMs: pct(0.5), p95Ms: pct(0.95), maxMs: sorted.at(-1) ?? 0 },
  coverage: { changedLines: checkedLines, uncovered, patchesThatFail: badPatches },
  extracts: {
    labelledReal: realExtracts.length,
    found: found.filter((l) => l === 'extract').length,
    borderline: found.filter((l) => l === 'borderline').length,
    wrong: found.filter((l) => l === 'not-extract').length,
    unlabelled: found.filter((l) => l === 'unlabelled').length,
  },
  operations: counts,
};
fs.writeFileSync(new URL('cases.json', out), JSON.stringify({ scoreboard, cases }));
console.log(JSON.stringify(scoreboard, null, 1));
console.log(`cases: ${cases.length}`);
