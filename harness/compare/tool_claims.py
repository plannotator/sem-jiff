# tool_claims.py <out.jsonl> <project>... : run the old sem v0.8.0 (in Docker, see sem080) and difftastic 0.72.0 on
# every file of the given projects' datasets (harness/work/data/hist-<project>.json) and translate what each says
# into sem-jiff's labels, with line ranges, so their claims can be judged like ours (harness/audit/AUDIT.md) and
# matched against the expected answers. The mapping (spec sem-diff-languages.md, section 5):
#   sem:        moved/reordered with no structural change -> moved; renamed -> renamed;
#               modified with structuralChange false -> reformatted; anything else -> edited (no claim).
#   difftastic: no changed tokens although the text changed -> reformatted (the changed lines);
#               changed tokens are 1-2 distinct words -> renamed (the changed lines); anything else -> no claim.
#               It has no notion of moved code, extracted or inlined functions ("can't say").
# Env: SEM080_DIR (sem080-setup.sh), DIFFT (default harness/work/tools/difft), WORK.
import json, os, subprocess, sys, tempfile, re, difflib
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('WORK', os.path.join(HERE, '..', 'work'))
DIFFT = os.environ.get('DIFFT', os.path.join(WORK, 'tools', 'difft'))
NONET = os.path.join(WORK, 'tools', 'nonet.sb')
out_path, projects = sys.argv[1], sys.argv[2:]

def ranges(lines):
    out = []
    for l in sorted(set(lines)):
        if out and l == out[-1][1] + 1: out[-1][1] = l
        else: out.append([l, l])
    return out

def changed_lines(a, b):
    o, n = [], []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a.split('\n'), b.split('\n'), autojunk=False).get_opcodes():
        if tag != 'equal': o += range(i1 + 1, i2 + 1); n += range(j1 + 1, j2 + 1)
    return ranges(o), ranges(n)

def difft_claims(f, d):
    # Ruby's Gemfile and Rakefile have no extension; difftastic picks the grammar from it.
    base = os.path.basename(f['name'])
    ext = base.rsplit('.', 1)[-1] if '.' in base else 'rb'
    a, b = os.path.join(d, f'a.{ext}'), os.path.join(d, f'b.{ext}')
    open(a, 'w').write(f['oldContents']); open(b, 'w').write(f['newContents'])
    cmd = ['sandbox-exec', '-f', NONET, DIFFT, '--display', 'json', a, b] if os.path.exists(NONET) else [DIFFT, '--display', 'json', a, b]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=dict(os.environ, DFT_UNSTABLE='yes'))
        res = json.loads(p.stdout.strip().split('\n')[0])
    except Exception:
        return None
    toks, lo, ln = [], [], []
    if res.get('status') != 'unchanged':
        for chunk in res.get('chunks') or []:
            for side in chunk:
                for s, acc in (('lhs', lo), ('rhs', ln)):
                    if s in side and side[s]['changes']:
                        acc.append(side[s]['line_number'] + 1)
                        toks += [c['content'] for c in side[s]['changes']]
    o, n = changed_lines(f['oldContents'], f['newContents'])
    if not o and not n: return []
    if not toks: return [{'kind': 'reformatted', 'old': o, 'new': n}]
    words = {t for t in toks}
    if len(words) <= 2 and all(re.fullmatch(r'[\w$]+', t) for t in words):
        return [{'kind': 'renamed', 'old': ranges(lo), 'new': ranges(ln)}]
    return []

SEMKIND = {'moved': 'moved', 'reordered': 'moved', 'renamed': 'renamed'}
def sem_claims(res):
    if res.get('error'): return None
    out = []
    for c in res.get('changes', []):
        t = c['changeType']; sc = c.get('structuralChange')
        kind = SEMKIND.get(t) if not (t in ('moved', 'reordered') and sc) else None
        if t == 'modified' and sc is False: kind = 'reformatted'
        if not kind or c.get('oldStartLine') is None or c.get('startLine') is None: continue
        out.append({'kind': kind, 'old': [[c['oldStartLine'], c['oldEndLine']]], 'new': [[c['startLine'], c['endLine']]], 'name': c.get('entityName')})
    return out

home_tmp = os.path.join(WORK, 'tmp'); os.makedirs(home_tmp, exist_ok=True)
with open(out_path, 'w') as w:
    for proj in projects:
        files = json.load(open(os.path.join(WORK, 'data', f'hist-{proj}.json')))
        with tempfile.TemporaryDirectory(dir=home_tmp) as d:
            os.makedirs(os.path.join(d, 'in')); os.makedirs(os.path.join(d, 'out'))
            for i, f in enumerate(files):
                json.dump([{'filePath': f['name'], 'status': 'modified', 'beforeContent': f['oldContents'], 'afterContent': f['newContents']}], open(os.path.join(d, 'in', f'{i:06d}.json'), 'w'))
            subprocess.run([os.path.join(HERE, 'sem080'), '--batch', os.path.join(d, 'in'), os.path.join(d, 'out')], check=True)
            sem_failed = difft_failed = 0
            for i, f in enumerate(files):
                try: s = sem_claims(json.load(open(os.path.join(d, 'out', f'{i:06d}.json'))))
                except Exception: s = None
                df = difft_claims(f, d)
                sem_failed += s is None; difft_failed += df is None
                for tool, cl in (('sem-0.8.0', s), ('difftastic-0.72.0', df)):
                    for c in cl or []:
                        w.write(json.dumps({'tool': tool, 'project': proj, 'commit': f['commit'], 'file': f['name'], **c}) + '\n')
        print(f'{proj}: {len(files)} files; unreadable: sem {sem_failed}, difftastic {difft_failed}', flush=True)
