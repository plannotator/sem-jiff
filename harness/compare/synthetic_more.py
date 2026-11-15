# synthetic_more.py cases.jsonl : two more tools on the same generated changes, judged like GumTree and sem
# in synthetic_judge.py: diffmantic (an edit script: move, update, insert, delete) and a newer `sem`.
# DIFFM and SEM point at the binaries; SANDBOX (optional) is a macOS sandbox profile to run diffmantic under.
import json, os, subprocess, sys, tempfile, time, statistics
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(os.environ.get('WORK', os.path.join(HERE, '..', 'work')), 'tools')
DIFFM = os.environ.get('DIFFM', os.path.join(TOOLS, 'dl-diffmantic/diffm'))
SEM = os.environ.get('SEM', os.path.join(TOOLS, 'dl-sem-0.30/sem'))
SANDBOX = os.environ.get('SANDBOX', os.path.join(TOOLS, 'nonet.sb'))
WRAP = ['sandbox-exec', '-f', SANDBOX] if os.path.exists(SANDBOX) else []
EXT = {'typescript': 'ts', 'tsx': 'tsx', 'java': 'java', 'go': 'go', 'python': 'py', 'rust': 'rs', 'csharp': 'cs'}
DIFFM_LANGS = {'typescript', 'tsx', 'java', 'go', 'python', 'rust'}  # no C#

def run(cmd, cwd=None):
    t = time.time()
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120)
        return p.returncode in (0, 1), p.stdout, time.time() - t
    except subprocess.TimeoutExpired:
        return False, '', 120

def git(cwd, *a):
    subprocess.run(['git', '-c', 'user.email=a@b', '-c', 'user.name=a', *a], cwd=cwd, capture_output=True)

def diffmantic(c, out):
    acts = json.loads(out).get('actions', [])
    kinds = {a['action'] for a in acts}
    moves = 'move' in kinds
    edits = kinds - {'move'}
    k = c['kind']
    if k in ('move', 'imports'): return moves and not edits, bool(edits)
    if k == 'rename':
        pairs = {(a.get('old_value'), a.get('new_value')) for a in acts}
        ok = bool(acts) and kinds == {'update'} and len(pairs) == 1 and all('identifier' in a['node']['type'] or 'name' in a['node']['type'] for a in acts)
        return ok, moves
    if k == 'reindent': return not acts, bool(acts)
    return None, False

def sem(c, out):  # as in synthetic_judge.py
    ch = json.loads(out).get('changes', [])
    types = [x['changeType'] for x in ch]
    structural = [x for x in ch if x.get('structuralChange') and x['changeType'] not in ('moved', 'reordered')]
    k = c['kind']
    if k == 'move': return any(t in ('moved', 'reordered') for t in types) and not structural, any(t == 'renamed' for t in types)
    if k in ('imports', 'reindent'): return not structural, any(t in ('renamed', 'moved') for t in types) if k == 'reindent' else any(t == 'renamed' for t in types)
    return None, any(t in ('renamed', 'moved') for t in types) if k != 'rename' else any(t == 'moved' for t in types)

def one(c):
    ext = EXT[c['language']]
    res = {}
    with tempfile.TemporaryDirectory() as d:
        fa = os.path.join(d, f'a.{ext}'); fb = os.path.join(d, f'b.{ext}')
        open(fa, 'w').write(c['old']); open(fb, 'w').write(c['new'])
        if c['language'] in DIFFM_LANGS: res['diffmantic'] = run([*WRAP, DIFFM, fa, fb, '-f', 'json'])
        g = os.path.join(d, 'g'); os.makedirs(os.path.join(g, 'src'))
        rel = os.path.join(g, 'src', f'file.{ext}')
        git(g, 'init', '-q')
        open(rel, 'w').write(c['old']); git(g, 'add', '.'); git(g, 'commit', '-qm', 'old')
        open(rel, 'w').write(c['new']); git(g, 'add', '.'); git(g, 'commit', '-qm', 'new')
        res['sem'] = run([SEM, 'diff', 'HEAD~1..HEAD', '--json'], cwd=g)
    return c, res

JUDGE = {'diffmantic': diffmantic, 'sem': sem}
CANT = {('diffmantic', 'extract'), ('diffmantic', 'inline'), ('sem', 'rename'), ('sem', 'extract'), ('sem', 'inline')}
tally = defaultdict(lambda: {'n': 0, 'rec': 0, 'false': 0, 'fail': 0}); secs = defaultdict(list)
cases = [json.loads(l) for l in open(sys.argv[1])]
with ThreadPoolExecutor(6) as ex:
    for c, res in ex.map(one, cases):
        for tool, (ok_run, out, s) in res.items():
            t = tally[(tool, c['kind'])]; t['n'] += 1; secs[tool].append(s)
            if not ok_run or not out.strip(): t['fail'] += 1; continue
            try: ok, false = JUDGE[tool](c, out)
            except Exception: t['fail'] += 1; continue
            t['rec'] += bool(ok); t['false'] += bool(false)
for tool in JUDGE:
    print(f'\n{tool}')
    for k in ['move', 'rename', 'reindent', 'imports', 'extract', 'inline']:
        t = tally[(tool, k)]; n = t['n'] - t['fail']
        if n <= 0: print(f'  {k}: no readable output ({t["fail"]} failed)'); continue
        said = "can't say" if (tool, k) in CANT else f'{t["rec"]}/{n} recognised ({100*t["rec"]/n:.0f}%)'
        print(f'  {k}: {said}, false claims {t["false"]}/{n} ({100*t["false"]/n:.0f}%)' + (f', {t["fail"]} unreadable' if t['fail'] else ''))
    print('  median seconds per file pair:', round(statistics.median(secs[tool]), 3))
