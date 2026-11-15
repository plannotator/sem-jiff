// Rebuilds the real before/after texts for one new-language corpus (harness/lang/README.md).
//
// Usage: node harness/lang/build.ts <lang> [--dir <work-dir>] [names...]
// Reads harness/lang/<lang>/{projects.json,manifest.json,texts.sha256}. Fetches each listed commit with its
// parent (depth 2, blobs on demand) into <work-dir>/repos/<name>, writes <work-dir>/data/hist-<name>.json in the
// shape harness/setup.ts writes, and fails if any text differs from the sha256 the answers were written against.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type Project = { name: string; set: string; labels: string; url: string; licence: string; fetch: string[]; files: number };

const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (flag: string) => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const work = path.resolve(opt('--dir') ?? path.join(here, '..', 'work'));
const lang = args.shift();
if (!lang) throw new Error('usage: node harness/lang/build.ts <lang> [--dir <work-dir>] [names...]');
const names = new Set(args);
const dir = path.join(here, lang);
const projects: Project[] = JSON.parse(fs.readFileSync(path.join(dir, 'projects.json'), 'utf8'));
const manifest: Record<string, Record<string, string[]>> = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const pinned = new Map<string, string>();
for (const line of fs.readFileSync(path.join(dir, 'texts.sha256'), 'utf8').split('\n')) {
  const m = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
  if (m) pinned.set(m[2]!, m[1]!);
}

fs.mkdirSync(path.join(work, 'repos'), { recursive: true });
fs.mkdirSync(path.join(work, 'data'), { recursive: true });
let bad = 0;
for (const p of projects.filter((x) => !names.size || names.has(x.name))) {
  const repo = path.join(work, 'repos', p.name);
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const has = (sha: string) => {
    try {
      git('cat-file', '-e', `${sha}^^{commit}`);
      return true;
    } catch {
      return false;
    }
  };
  if (!fs.existsSync(path.join(repo, '.git'))) {
    fs.mkdirSync(repo, { recursive: true });
    git('init', '-q');
    git('remote', 'add', 'origin', p.url);
  }
  const missing = p.fetch.filter((sha) => !has(sha));
  if (missing.length) {
    process.stdout.write(`${p.name}: fetching ${missing.length} commits... `);
    for (const sha of missing) git('fetch', '-q', '--no-tags', '--filter=blob:none', '--depth=2', 'origin', sha);
  }
  const out: Array<{ name: string; commit: string; subject: string; oldContents: string; newContents: string }> = [];
  for (const [short, files] of Object.entries(manifest[p.name] ?? {})) {
    const c = git('rev-parse', short).trim();
    const subject = git('log', '-1', '--format=%s', c).trim();
    const oldPath = new Map<string, string>();
    for (const row of git('diff', '--name-status', '-M', `${c}^`, c).trim().split('\n')) {
      const [, a, b] = row.split('\t');
      if (a) oldPath.set(b ?? a, a);
    }
    for (const name of files) {
      const f = { name, commit: short, subject, oldContents: git('show', `${c}^:${oldPath.get(name) ?? name}`), newContents: git('show', `${c}:${name}`) };
      for (const side of ['old', 'new'] as const) {
        const key = `${p.name}/${short}/${side}/${name}`;
        const sum = createHash('sha256').update(side === 'old' ? f.oldContents : f.newContents).digest('hex');
        if (pinned.get(key) !== sum) {
          bad++;
          console.error(`\n  sha256 mismatch: ${key}`);
        }
      }
      out.push(f);
    }
  }
  fs.writeFileSync(path.join(work, 'data', `hist-${p.name}.json`), JSON.stringify(out));
  console.log(`${p.name}: ${out.length} files (${p.set})${out.length === p.files ? '' : ` — expected ${p.files}`}`);
}
if (bad) {
  console.error(`${bad} texts differ from texts.sha256`);
  process.exit(1);
}
