// Builds a dataset from a repository's real history: one entry per changed
// file per commit (each commit's own diff, like reviewing it as a PR).
// Usage: node bench/history.ts <repo> <out.json> [commits=300] [exclude-regex]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { languageForPath } from '../src/index.ts';

const [, , repo, out, count = '300', exclude = '(^|/)(tests?|testdata|fixtures?|vendor|node_modules)/|\\.d\\.ts$|_test\\.go$'] = process.argv;
if (!repo || !out) throw new Error('usage: node bench/history.ts <repo> <out.json> [commits] [exclude-regex]');
const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { maxBuffer: 1 << 30 }).toString();
const show = (rev: string, p: string) => { try { return git('show', `${rev}:${p}`); } catch { return null; } };
const skip = new RegExp(exclude);
// INCLUDE=<regex>: also take files the engine does not read yet (a new language's corpus is built first).
const include = process.env.INCLUDE ? new RegExp(process.env.INCLUDE) : null;

const commits = git('rev-list', '--no-merges', `--max-count=${count}`, 'HEAD').trim().split('\n');
const files: Array<{ name: string; commit: string; subject: string; oldContents: string; newContents: string }> = [];
for (const c of commits) {
  if (!git('rev-list', '--parents', '-1', c).trim().split(' ')[1]) continue; // shallow boundary
  const subject = git('log', '-1', '--format=%s', c).trim();
  for (const row of git('diff', '--name-status', '-M', `${c}^`, c).trim().split('\n')) {
    const [st, a, b] = row.split('\t');
    if (!st || !a || st[0] === 'A' || st[0] === 'D') continue; // whole-file adds/deletes say nothing semantic
    const name = b ?? a;
    if (!(languageForPath(name) || include?.test(name)) || skip.test(name)) continue;
    const oldContents = show(`${c}^`, a);
    const newContents = show(c, name);
    if (oldContents == null || newContents == null || oldContents === newContents) continue;
    if (oldContents.length + newContents.length > 4e6) continue;
    files.push({ name, commit: c.slice(0, 10), subject, oldContents, newContents });
  }
}
fs.writeFileSync(out, JSON.stringify(files));
console.log(`${files.length} files from ${commits.length} commits → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
