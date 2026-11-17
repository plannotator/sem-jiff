// Our engine's moved / renamed / reformatted / reordered claims on a corpus, in the line format
// harness/compare/tool_claims.py writes for sem and difftastic, so all three are judged the same way.
// Usage: node harness/lang/claims.ts <out.jsonl> <project>...   (reads harness/work/data/hist-<project>.json)
// SEMANTIC_NO_<RULE>=1 switches a rule off, as in bench/recall.ts (SEMANTIC_NO_HOLD_BACK=1: nothing held back).
import fs from 'node:fs';
import path from 'node:path';
import { languageForPath, semanticDiffFile } from '../../src/index.ts';
import { switchRulesOff, switchTrialsOn } from '../../src/runtime.ts';

switchRulesOff(Object.keys(process.env).filter((k) => k.startsWith('SEMANTIC_NO_') && process.env[k]).map((k) => k.slice('SEMANTIC_NO_'.length)));
// SEMANTIC_TRY_<RULE>=1 switches a trial rule on (off by default), as in bench/recall.ts.
switchTrialsOn(Object.keys(process.env).filter((k) => k.startsWith('SEMANTIC_TRY_') && process.env[k]).map((k) => k.slice('SEMANTIC_TRY_'.length)));

const here = path.dirname(new URL(import.meta.url).pathname);
const work = process.env.WORK ?? path.join(here, '..', 'work');
const [out, ...projects] = process.argv.slice(2);
if (!out || !projects.length) throw new Error('usage: node harness/lang/claims.ts <out.jsonl> <project>...');
const KINDS = new Set(['moved', 'movedWithEdit', 'renamed', 'reformatted', 'reordered']);
fs.writeFileSync(out, '');
for (const project of projects) {
  const files = JSON.parse(fs.readFileSync(path.join(work, 'data', `hist-${project}.json`), 'utf8'));
  let n = 0;
  let ms = 0;
  for (const f of files) {
    const lang = languageForPath(f.name);
    if (!lang) continue;
    const t0 = performance.now();
    const r = await semanticDiffFile(lang, f.oldContents, f.newContents, f.name);
    ms += performance.now() - t0;
    for (const o of r.semanticOperations) {
      if (!KINDS.has(o.type)) continue;
      n++;
      fs.appendFileSync(out, JSON.stringify({ tool: 'sem-diff', project, commit: f.commit, file: f.name, kind: o.type, old: o.lines.old.map((l) => [l.start, l.end]), new: o.lines.new.map((l) => [l.start, l.end]) }) + '\n');
    }
  }
  console.log(`${project}: ${files.length} files, ${n} claims, ${(ms / files.length).toFixed(1)} ms per file`);
}
