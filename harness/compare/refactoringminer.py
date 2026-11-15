# refactoringminer.py [names...]: run RefactoringMiner on every commit of the given projects' datasets and
# score its Extract/Inline Method findings against our labels, exactly as harness/score.ts scores sem-jiff:
# same commits, same files (claims in files the dataset leaves out, such as tests, are dropped), same
# answer key, same-file only (cross-file moves are counted apart). Held-out sets print totals only.
# Run `node harness/setup.ts <names...>` first. Tool path: REFACTORINGMINER (default work/tools/...).
import glob, gzip, json, os, re, subprocess, sys, time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
WORK = os.environ.get('WORK', os.path.join(HERE, '..', 'work'))
JAVA_HOME = os.environ.get('JAVA_HOME', '/opt/homebrew/opt/openjdk@21')
RM = os.environ.get('REFACTORINGMINER', os.path.join(WORK, 'tools', 'RefactoringMiner-3.1.6', 'bin', 'RefactoringMiner'))
TIMEOUT = int(os.environ.get('RM_TIMEOUT', '120'))
ENV = dict(os.environ, JAVA_HOME=JAVA_HOME, PATH=JAVA_HOME + '/bin:' + os.environ['PATH'])

projects = {p['name']: p for p in json.load(open(os.path.join(ROOT, 'harness', 'projects.json')))}
manifest = json.load(gzip.open(os.path.join(ROOT, 'harness', 'manifest.json.gz'), 'rt'))
names = sys.argv[1:] or [n for n, p in projects.items()]

def run(name):
    repo = os.path.join(WORK, 'repos', name)
    out_dir = os.path.join(WORK, 'refactoringminer', name)
    os.makedirs(out_dir, exist_ok=True)
    def one(short):
        out = os.path.join(out_dir, short + '.json')
        if os.path.exists(out): return 'cached'
        full = subprocess.run(['git', '-C', repo, 'rev-parse', short], capture_output=True, text=True).stdout.strip()
        try:
            subprocess.run([RM, '-c', repo, full, '-json', out], env=ENV, timeout=TIMEOUT, capture_output=True)
            return 'ok' if os.path.exists(out) else 'error'
        except subprocess.TimeoutExpired:
            subprocess.run(['pkill', '-f', full])
            return 'timeout'
    with ThreadPoolExecutor(int(os.environ.get('RM_THREADS', '4'))) as ex:
        return Counter(ex.map(one, list(manifest[name])))

def name_of(code_element):
    m = re.match(r'\s*(?:[\w<>\[\],? ]+\s)?([\w$]+)\s*\(', code_element or '')
    return m.group(1) if m else None

def claims_of(name, files):
    claims, cross = set(), 0
    for f in glob.glob(os.path.join(WORK, 'refactoringminer', name, '*.json')):
        short = os.path.basename(f)[:-5]
        if short.startswith('_'): continue
        try: d = json.load(open(f))
        except Exception: continue
        for cm in (d.get('commits', []) if isinstance(d, dict) else []):
            for r in cm['refactorings']:
                if r['type'] in ('Extract Method', 'Extract And Move Method'):
                    kind, side, role, callers = 'extract', r['rightSideLocations'], 'extracted method declaration', r['leftSideLocations']
                elif r['type'] in ('Inline Method', 'Move And Inline Method'):
                    kind, side, role, callers = 'inline', r['leftSideLocations'], 'inlined method declaration', r['rightSideLocations']
                else:
                    continue
                decl = next((x for x in side if x['description'] == role), None)
                if not decl: continue
                if decl['filePath'] not in {x['filePath'] for x in callers}: cross += 1; continue
                if (short[:7], decl['filePath']) in files:
                    claims.add((short[:7], decl['filePath'], kind, name_of(decl['codeElement'])))
    return claims, cross

for name in names:
    p = projects[name]
    status = run(name)
    files = {(c[:7], f) for c, fs in manifest[name].items() for f in fs}
    labels = {}
    for l in json.load(open(os.path.join(ROOT, 'test', 'fixtures', 'labels', p['labels'])))['labels']:
        k = (l['commit'][:7], l['file'], l['kind'], l['helper'])
        if l['repo'] == name and (k[0], k[1]) in files: labels[k] = l['label']
    claims, cross = claims_of(name, files)
    real = {k for k, v in labels.items() if v in ('extract', 'inline')}
    found = real & claims
    print(f"{name} ({p['set']}): commits {dict(status)}, real {len(real)}, found {len(found)} ({100 * len(found) / max(len(real), 1):.0f}%), "
          f"wrong {sum(labels.get(k) == 'no' for k in claims)}, borderline {sum(labels.get(k) == 'borderline' for k in claims)}, "
          f"unlabelled {len(claims - set(labels))}, cross-file claims {cross}")
    if not p['set'].startswith('held') and '--show' in os.environ.get('RM_FLAGS', ''):
        for k in sorted(real - claims): print('  missed', k)
        for k in sorted(claims - set(labels)): print('  unlabelled', k)
