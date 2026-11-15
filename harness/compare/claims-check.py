# claims-check.py [--model jev|clef] : can a decision model catch wrong moved / renamed / reformatted labels?
# Asks it about every audited claim (harness/work/audit/claims.json, labels in
# test/fixtures/labels/audit-moves.json; practice projects only) and prints, per kind, how a veto at each
# cut-off would trade wrong labels removed against correct ones lost. Answers cached like clef.py.
import concurrent.futures, hashlib, json, os, subprocess, sys, time, urllib.request, urllib.error

here = os.path.dirname(os.path.abspath(__file__))
work = os.path.join(here, '..', 'work')
model = sys.argv[sys.argv.index('--model') + 1] if '--model' in sys.argv else 'jev'
# --claims other.json [--labels labels.json]: another sample (labels optional: unlabelled claims are only asked).
arg = lambda f, d: sys.argv[sys.argv.index(f) + 1] if f in sys.argv else d
claims = {c['id']: c for c in json.load(open(arg('--claims', os.path.join(work, 'audit', 'claims.json'))))}
lab_path = arg('--labels', os.path.join(here, '..', '..', 'test/fixtures/labels/audit-moves.json') if '--claims' not in sys.argv else None)
labels = {l['id']: l['label'] for l in json.load(open(lab_path))['labels']} if lab_path else {}

QUESTION = {
    'moved': "Are the OLD lines and the NEW lines the same code, with nothing changed except indentation or position?",
    'movedWithEdit': "Are the NEW lines mostly the same code as the OLD lines (moved, possibly with a small edit), rather than different code that merely looks similar?",
    'renamed': "Is the only difference between the OLD lines and the NEW lines one name replaced by another, consistently, with no other change to values, calls, arguments or operators?",
    'reformatted': "Do the OLD lines and the NEW lines do exactly the same thing, differing only in layout (whitespace, line breaks, trailing commas, optional parentheses or semicolons)?",
}
def state(c):
    show = lambda spans: '\n...\n'.join(s['text'] for s in spans)[:8000]
    return f"A code change in {c['file']}.\n\n=== OLD LINES ===\n{show(c['old'])}\n\n=== NEW LINES ===\n{show(c['new'])}\n"
key = lambda c: hashlib.sha256((model + c['kind'] + state(c)).encode()).hexdigest()[:24]

if model == 'jev':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from keys_file import require
    tok = require('TYPESAFE_API_KEY')  # from the file named by $SEM_DIFF_KEYS_FILE
    url, api_model = 'https://api.typesafe.ai/v1/systemone', 'jev-1.14.0'
else:
    w = lambda *a: subprocess.run(['npx', '--yes', 'wrangler@4.158.0', *a], capture_output=True, text=True, cwd='/tmp', check=True).stdout
    acct = json.loads(w('whoami', '--json'))['accounts'][0]['id']; tok = w('auth', 'token').strip().splitlines()[-1].strip()
    url, api_model = f'https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/@cf/cloudflare/clef', 'clef'

cache_path = os.path.join(work, 'clef', f'claims-{model}.jsonl')
cache = {}
if os.path.exists(cache_path):
    for l in open(cache_path): x = json.loads(l); cache[x['key']] = x
items = [c for i, c in claims.items() if c['kind'] in QUESTION and (i in labels or not labels)]

def ask(c):
    body = json.dumps({'model': api_model, 'state': state(c), 'questions': {'ok': {'type': 'noul', 'instructions': QUESTION[c['kind']]}}}).encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, method='POST', headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=120) as resp: out = json.load(resp)
            return {'key': key(c), 'p': float(out.get('result', out)['answers']['ok']['noul'])}
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504): time.sleep(2 ** attempt); continue
            return {'key': key(c), 'error': f'{e.code} {e.read().decode()[:200]}'}
        except Exception as e:
            if attempt == 4: return {'key': key(c), 'error': repr(e)[:200]}
            time.sleep(2 ** attempt)

todo = [c for c in items if key(c) not in cache]
with concurrent.futures.ThreadPoolExecutor(8) as pool, open(cache_path, 'a') as out:
    for x in pool.map(ask, todo):
        if 'error' in x: print('error:', x['error']); continue
        cache[x['key']] = x; out.write(json.dumps(x) + '\n')

if arg('--scores', None):
    json.dump({c['id']: cache[key(c)]['p'] for c in items if key(c) in cache}, open(arg('--scores', None), 'w'))
if not labels: sys.exit(0)
def auc(pos, neg): return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg)) if pos and neg else float('nan')
for kind in QUESTION:
    xs = [(labels[c['id']], cache[key(c)]['p']) for c in items if c['kind'] == kind and key(c) in cache]
    ok = [p for l, p in xs if l == 'correct']; bad = [p for l, p in xs if l == 'wrong']; bord = [p for l, p in xs if l == 'borderline']
    print(f"\n{kind}: {len(ok)} correct, {len(bord)} borderline, {len(bad)} wrong; ranking correct above wrong (AUC) {auc(ok, bad):.2f}, above borderline {auc(ok, bord):.2f}")
    for t in [0.1, 0.2, 0.3, 0.5]:
        print(f"  veto below {t:.1f}: removes {sum(p < t for p in bad)}/{len(bad)} wrong, {sum(p < t for p in bord)}/{len(bord)} borderline, {sum(p < t for p in ok)}/{len(ok)} correct")
