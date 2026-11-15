// Builds the labelling list for a held-out project: a fixed-seed random sample of the loose
// candidates (same-file only, CAP per project) plus every extract/inline claim the engine makes.
// The sample never depends on anything seen. Writes <dir>/todo-<repo>.json, prints counts only.
// Usage: CAP=70 node harness/heldout/todo.ts <dir> <repo>   (reads <dir>/cand-<repo>.json, <dir>/hist-<repo>.json)
import fs from 'node:fs';
import { languageForPath, semanticDiffFile } from '../../src/index.ts';

const CAP = Number(process.env.CAP ?? 70);
const rand = (() => { let x = 12345; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); })();
const [dir, repo] = process.argv.slice(2) as [string, string];
if (!dir || !repo) throw new Error('usage: node harness/heldout/todo.ts <dir> <repo>');
// Same naming as bench/recall.ts, so label keys match what the scorer reads.
const nameIn = (h: string) =>
  (h.match(/^\s*(?:(?:private|protected|public)\s+)?def\s+(?:self\.)?([\w$]+[?!=]?)/) ?? [])[1] ??
  (h.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/) ?? [])[1] ??
  (h.match(/^\s*(?:export\s+)?(?:(?:const|let|var)\s+|(?:(?:private|public|protected|readonly|static)\s+)*)([\w$]+)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\(|<|function\b|[\w$]+\s*=>)/) ?? [])[1] ??
  (h.match(/^\s*(?:export\s+)?(?:(?:const|let|var)\s+|(?:(?:private|public|protected|readonly|static)\s+)+)([\w$]+)\s*(?::[^=]*)?=\s*[\w$.]+\s*[(<]/) ?? [])[1] ??
  (h.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)/) ?? [])[1] ??
  (h.replace(/^\s*func\s*(\([^)]*\))?\s*/, '').replace(/^\s*pub(\([^)]*\))?\s+/, '').match(/([\w$]+)\s*(<[^>]*>|\[[^\]]*\])?\s*\(/) ?? [])[1] ?? '?';

// EXTRA=1 with CLEF_ANSWERS (and optionally CLEF_BAND, CLEF_ANSWERS2, CLEF_T, CLEF_T2, read exactly as
// bench/recall.ts reads them): list only the claims the engine makes WITH the second opinion that the
// first list lacks, numbered after it, into todo2-<repo>.json.
const extra = !!process.env.EXTRA;
let currentFile = '';
if (process.env.CLEF_ANSWERS) {
  const { createHash } = await import('node:crypto');
  const { configure } = await import('../../src/index.ts');
  const read = (file: string) => {
    const m = new Map<string, number>();
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) if (l.trim()) { const x = JSON.parse(l); if (x.ckey) m.set(x.ckey, x.p); }
    return m;
  };
  const answers = read(process.env.CLEF_ANSWERS);
  const t = Number(process.env.CLEF_T ?? 0.9);
  const band = process.env.CLEF_BAND ? Number(process.env.CLEF_BAND) : null;
  const answers2 = process.env.CLEF_ANSWERS2 ? read(process.env.CLEF_ANSWERS2) : new Map<string, number>();
  const t2 = Number(process.env.CLEF_T2 ?? 0.8);
  configure({ secondOpinionCopyCheck: !process.env.CLEF_NO_COPY_CHECK, secondOpinion: (c) => {
    const k = createHash('sha256').update([c.kind, currentFile, c.code.helper, c.code.caller, c.code.callerNew].join('\0')).digest('hex').slice(0, 24);
    const p = answers.get(k) ?? 0;
    return p >= t || (band !== null && p >= band && (answers2.get(k) ?? 0) >= t2);
  } });
}
const out: any[] = [];
let id = 1;
const seen = new Set<string>();
if (extra) {
  for (const t of JSON.parse(fs.readFileSync(`${dir}/todo-${repo}.json`, 'utf8'))) { seen.add(`${t.commit}|${t.file}|${t.kind}|${t.helper}`); id = Math.max(id, t.id + 1); }
}
const all = extra ? [] : JSON.parse(fs.readFileSync(`${dir}/cand-${repo}.json`, 'utf8')).filter((c: any) => !c.crossFile);
const uniq: any[] = [...new Map(all.map((c: any) => [`${c.commit}|${c.file}|${c.kind}|${c.helper}`, c])).values()];
for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j]!, uniq[i]!]; }
for (const c of uniq.slice(0, CAP)) {
  seen.add(`${c.commit}|${c.file}|${c.kind}|${c.helper}`);
  const { reported, ...rest } = c;
  out.push({ id: id++, repo, ...rest, src: 'loose' });
}
// NO_ENGINE=1: only the engine-independent sample, so the labels can be fixed before the engine runs on the set.
for (const f of process.env.NO_ENGINE ? [] : JSON.parse(fs.readFileSync(`${dir}/hist-${repo}.json`, 'utf8'))) {
  const lang = languageForPath(f.name);
  if (!lang) continue;
  currentFile = f.name;
  let ops: any[] = [];
  try { ops = (await semanticDiffFile(lang, f.oldContents, f.newContents, f.name)).semanticOperations; } catch {}
  const O = f.oldContents.split('\n'), N = f.newContents.split('\n');
  for (const o of ops) {
    if (o.type !== 'extractedFunction' && o.type !== 'inlinedFunction') continue;
    const kind = o.type === 'extractedFunction' ? 'extract' : 'inline';
    const c: any = o.spans.find((s: any) => s.role === 'container');
    const helper = nameIn(kind === 'extract' ? N[c.new[0].start.line - 1]! : O[c.old[0].start.line - 1]!);
    const k = `${f.commit}|${f.name}|${kind}|${helper}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: id++, repo, kind, commit: f.commit, helper, file: f.name, src: 'engine', note: 'reported by the engine; caller unknown, find it from the commit' });
  }
}
fs.writeFileSync(`${dir}/${extra ? 'todo2' : 'todo'}-${repo}.json`, JSON.stringify(out, null, 1));
console.log(repo, out.length, 'items;', out.filter((x) => x.src === 'engine').length, 'engine-only');
