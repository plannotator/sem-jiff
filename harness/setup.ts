// Downloads the projects the engine is measured on and rebuilds their datasets
// exactly: the same commits and files the labels were made from.
//
// Usage: node harness/setup.ts [--dir <work-dir>] [--set practice|held-mixed|held-ts|held-effect] [names...]
// Writes <work-dir>/data/hist-<name>.json (default work dir: harness/work, git-ignored).
// Each project is fetched at its recorded head with just enough history (no checkout).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

type Project = { name: string; set: string; labels: string; url: string; head: string; depth: number; files: number };

const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (flag: string) => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const work = path.resolve(opt('--dir') ?? path.join(here, 'work'));
const onlySet = opt('--set');
const names = new Set(args);

const projects: Project[] = JSON.parse(fs.readFileSync(path.join(here, 'projects.json'), 'utf8'));
const manifest: Record<string, Record<string, string[]>> = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(here, 'manifest.json.gz'))).toString());
const chosen = projects.filter((p) => (!onlySet || p.set === onlySet) && (!names.size || names.has(p.name)));
// Projects of the new-language corpora are rebuilt by harness/lang/build.ts, not from manifest.json.gz.
for (const p of chosen.filter((x) => !manifest[x.name])) console.log(`${p.name}: built by harness/lang/build.ts`);
chosen.splice(0, chosen.length, ...chosen.filter((x) => manifest[x.name]));
if (!chosen.length) process.exit(0);

fs.mkdirSync(path.join(work, 'repos'), { recursive: true });
fs.mkdirSync(path.join(work, 'data'), { recursive: true });

for (const p of chosen) {
  const repo = path.join(work, 'repos', p.name);
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const has = (sha: string) => {
    try {
      git('cat-file', '-e', `${sha}^{commit}`);
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
  if (!has(p.head)) {
    process.stdout.write(`${p.name}: fetching ${p.depth} commits... `);
    git('fetch', '-q', '--no-tags', `--depth=${p.depth}`, 'origin', p.head);
  }
  const out: Array<{ name: string; commit: string; subject: string; oldContents: string; newContents: string }> = [];
  const show = (rev: string, file: string) => git('show', `${rev}:${file}`);
  for (const [short, files] of Object.entries(manifest[p.name]!)) {
    const c = git('rev-parse', short).trim();
    const subject = git('log', '-1', '--format=%s', c).trim();
    // Renamed files: the dataset names the new path; the old one comes from the diff.
    const oldPath = new Map<string, string>();
    for (const row of git('diff', '--name-status', '-M', `${c}^`, c).trim().split('\n')) {
      const [, a, b] = row.split('\t');
      if (a) oldPath.set(b ?? a, a);
    }
    for (const name of files) {
      out.push({ name, commit: short, subject, oldContents: show(`${c}^`, oldPath.get(name) ?? name), newContents: show(c, name) });
    }
  }
  fs.writeFileSync(path.join(work, 'data', `hist-${p.name}.json`), JSON.stringify(out));
  console.log(`${p.name}: ${out.length} files (${p.set})${out.length === p.files ? '' : ` — expected ${p.files}`}`);
}
