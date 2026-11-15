// rename-delta.ts <project> <out.jsonl>: what one rule adds to (or takes from) the engine's `renamed`
// claims on a practice project. Runs every file with the rule off and on (RULE, default INNER_RENAMES)
// and writes one audit item per file whose renamed lines differ, in harness/audit/AUDIT.md's item shape.
import fs from 'node:fs';
import path from 'node:path';
import { languageForPath, semanticDiffFile } from '../../src/index.ts';
import { switchRulesOff } from '../../src/runtime.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const [project, out] = process.argv.slice(2);
const RULE = process.env.RULE ?? 'INNER_RENAMES';
const data = JSON.parse(fs.readFileSync(path.join(here, '..', 'work', 'data', `hist-${project}.json`), 'utf8'));
const renamed = (ops: any[]) => {
  const old = new Set<number>(); const neu = new Set<number>();
  for (const o of ops) if (o.type === 'renamed') {
    for (const r of o.lines.old) for (let l = r.start; l <= r.end; l++) old.add(l);
    for (const r of o.lines.new) for (let l = r.start; l <= r.end; l++) neu.add(l);
  }
  return { old, neu };
};
const text = (t: string, ls: number[]) => { const L = t.split('\n'); return ls.slice(0, 40).map((l) => ({ start: l, end: l, text: L[l - 1] ?? '' })); };
let files = 0, linesOff = 0, linesOn = 0, added = 0, lost = 0;
const rows: string[] = [];
for (const f of data) {
  const lang = languageForPath(f.name);
  if (!lang || typeof f.oldContents !== 'string' || typeof f.newContents !== 'string') continue;
  files++;
  let a, b;
  try {
    switchRulesOff([RULE]); a = renamed((await semanticDiffFile(lang, f.oldContents, f.newContents, f.name)).semanticOperations);
    switchRulesOff([]); b = renamed((await semanticDiffFile(lang, f.oldContents, f.newContents, f.name)).semanticOperations);
  } catch { continue; }
  linesOff += a.old.size; linesOn += b.old.size;
  const plusOld = [...b.old].filter((l) => !a.old.has(l)).sort((x, y) => x - y);
  const plusNew = [...b.neu].filter((l) => !a.neu.has(l)).sort((x, y) => x - y);
  const minus = [...a.old].filter((l) => !b.old.has(l));
  added += plusOld.length; lost += minus.length;
  if (plusOld.length || minus.length) rows.push(JSON.stringify({ project, commit: f.commit, file: f.name, kind: 'renamed', old: text(f.oldContents, plusOld), new: text(f.newContents, plusNew), lostLines: minus.length }));
}
fs.writeFileSync(out, rows.join('\n') + (rows.length ? '\n' : ''));
console.log(JSON.stringify({ project, files, linesOff, linesOn, added, lost, filesChanged: rows.length }));
