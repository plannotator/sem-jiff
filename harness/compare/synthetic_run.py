# synthetic_run.py cases.jsonl raw.jsonl: run GumTree, difftastic, sem and RefactoringMiner on the same
# generated changes (cases from `EXPORT=cases.jsonl node bench/synthetic.ts ...`).
# Each tool's raw output is kept; judging happens in judge.py.
import json, os, subprocess, sys, tempfile, time
import os
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('WORK', os.path.join(HERE, '..', 'work'))
TOOLS = os.path.join(WORK, 'tools')
JAVA_HOME = os.environ.get('JAVA_HOME', '/opt/homebrew/opt/openjdk@21')
from concurrent.futures import ThreadPoolExecutor

JENV = dict(os.environ, JAVA_HOME=JAVA_HOME, PATH=JAVA_HOME + '/bin:' + os.environ['PATH'], DFT_UNSTABLE='yes')
EXT = {'typescript': 'ts', 'tsx': 'tsx', 'java': 'java', 'go': 'go', 'python': 'py', 'rust': 'rs', 'csharp': 'cs', 'php': 'php', 'ruby': 'rb', 'kotlin': 'kt', 'swift': 'swift'}
GUMTREE = os.environ.get('GUMTREE', os.path.join(TOOLS, 'gumtree-4.1.0/bin/gumtree'))
DIFFT = os.environ.get('DIFFT', os.path.join(TOOLS, 'difft'))
SEM = os.environ.get('SEM', os.path.join(TOOLS, 'sem'))
RM = os.environ.get('REFACTORINGMINER', os.path.join(TOOLS, 'RefactoringMiner-3.1.6/bin/RefactoringMiner'))

def run(cmd, cwd=None, timeout=120):
    t = time.time()
    try:
        p = subprocess.run(cmd, cwd=cwd, env=JENV, capture_output=True, text=True, timeout=timeout)
        return {'ok': p.returncode in (0, 1), 'out': p.stdout, 'err': p.stderr[-500:], 's': round(time.time() - t, 2)}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'out': '', 'err': 'timeout', 's': timeout}

def git(cwd, *a):
    subprocess.run(['git', '-c', 'user.email=a@b', '-c', 'user.name=a', *a], cwd=cwd, capture_output=True)

# ONLY=sem,difftastic runs just those tools. With SEM=harness/compare/sem080 set TMPDIR under the home folder
# (Docker shares it; /var/folders is not shared).
ONLY = set(os.environ['ONLY'].split(',')) if os.environ.get('ONLY') else None
want = lambda t: ONLY is None or t in ONLY

def one(arg):
    i, c = arg
    ext = EXT[c['language']]
    with tempfile.TemporaryDirectory() as d:
        base = os.path.basename(c['name']).rsplit('.', 1)[0] or 'file'
        a = os.path.join(d, 'a'); b = os.path.join(d, 'b'); os.makedirs(a); os.makedirs(b)
        fa = os.path.join(a, f'{base}.{ext}'); fb = os.path.join(b, f'{base}.{ext}')
        open(fa, 'w').write(c['old']); open(fb, 'w').write(c['new'])
        res = {'i': i}
        if want('gumtree'): res['gumtree'] = run([GUMTREE, 'textdiff', '-f', 'JSON', fa, fb])
        if want('difftastic'): res['difftastic'] = run([DIFFT, '--display', 'json', fa, fb])
        # sem and RefactoringMiner read git history: one repo, two commits.
        g = os.path.join(d, 'g'); os.makedirs(g)
        git(g, 'init', '-q')
        rel = f'src/{base}.{ext}'
        os.makedirs(os.path.join(g, 'src'))
        open(os.path.join(g, rel), 'w').write(c['old']); git(g, 'add', '.'); git(g, 'commit', '-qm', 'old')
        open(os.path.join(g, rel), 'w').write(c['new']); git(g, 'add', '.'); git(g, 'commit', '-qm', 'new')
        if want('sem'): res['sem'] = run([SEM, 'diff', 'HEAD~1..HEAD', '--json'], cwd=g)
        if c['language'] == 'java' and want('refactoringminer'):
            sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=g, capture_output=True, text=True).stdout.strip()
            out = os.path.join(d, 'rm.json')
            r = run([RM, '-c', g, sha, '-json', out], timeout=180)
            r['out'] = open(out).read() if os.path.exists(out) else ''
            res['refactoringminer'] = r
    return res

cases = [json.loads(l) for l in open(sys.argv[1])]
# SYN_WORKERS caps parallel cases (default 6; the shared machine may ask for fewer).
with ThreadPoolExecutor(int(os.environ.get("SYN_WORKERS", "6"))) as ex, open(sys.argv[2], 'w') as f:
    for n, r in enumerate(ex.map(one, enumerate(cases))):
        f.write(json.dumps(r) + '\n')
        if n % 50 == 0: print(n, flush=True)
print('done', len(cases))
