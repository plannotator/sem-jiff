# clef.py features.jsonl [--limit N] [--model clef|clef-flash|jev] [--all] [--dry-run]
# Asks Cloudflare's Clef decision model, on the actual code, whether each labelled practice
# extract/inline candidate is real, and compares its answers with the labels, the engine's own
# decisions and the logistic-regression baseline (harness/classifier/train.py), left one project out.
# Input: rows from harness/classifier/collect.ts (practice projects only; each row carries the code).
# Credentials: the KEY=value file named by $SEM_DIFF_KEYS_FILE (CLOUDFLARE_ACCOUNT_ID=..., CLOUDFLARE_API_TOKEN=...;
# TYPESAFE_API_KEY=... for --model jev), or else Wrangler's login (`npx wrangler login`), first account unless
# CLOUDFLARE_ACCOUNT_ID is set. See keys_file.py.
# Answers are cached in harness/work/clef/answers-<model>.jsonl, so reruns cost nothing.
import concurrent.futures, hashlib, json, math, os, sys, time, urllib.request, urllib.error

here = os.path.dirname(os.path.abspath(__file__))
work = os.environ.get('WORK', os.path.join(here, '..', 'work'))
args = sys.argv[1:]
def opt(name, default=None):
    if name in args:
        i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    return default
model = opt('--model', 'clef'); limit = int(opt('--limit', '0')); dry = '--dry-run' in args
# --input full (caller before + after + helper) or diff (the caller's line diff + helper).
variant = opt('--input', 'full')
# --question noul (yes/no) or choice (what kind of change the helper is; the answer is P(moved)).
qtype = opt('--question', 'noul')
args = [a for a in args if a != '--dry-run']
rows = [json.loads(l) for f in args if f != '--all' for l in open(f)]
MAX = 12000  # characters per piece of code; Clef truncates long state anyway

def cut(s): return s if len(s) <= MAX else s[:MAX] + '\n... (cut)'

def state(r):
    if variant == 'diff': return state_diff(r)
    if variant == 'helperfirst': return state_helperfirst(r)
    if variant == 'marked': return state_marked(r)
    if variant == 'trimmed': return state_trimmed(r)
    return state_full(r)

def sides(r):
    c = r['code']
    before, after = (c['callerNew'], c['caller']) if r['kind'] == 'extract' else (c['caller'], c['callerNew'])
    where = 'added in this change' if r['kind'] == 'extract' else 'removed in this change'
    return before, after, c['helper'], where

def state_helperfirst(r):
    before, after, helper, where = sides(r)
    return (f"A code change in {r['file']}.\n\n=== HELPER `{r['helper']}` ({where}) ===\n{cut(helper)}\n\n"
            f"=== CALLER BEFORE ===\n{cut(before)}\n\n=== CALLER AFTER ===\n{cut(after)}\n")

def line_marks(before, after):
    import difflib
    a, b = before.split('\n'), after.split('\n')
    ma, mb = [' '] * len(a), [' '] * len(b)
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op != 'equal':
            for i in range(i1, i2): ma[i] = '-'
            for j in range(j1, j2): mb[j] = '+'
    return a, b, ma, mb

def state_marked(r):
    before, after, helper, where = sides(r)
    a, b, ma, mb = line_marks(before, after)
    A = '\n'.join(f'{m} {l}' for m, l in zip(ma, a)); B = '\n'.join(f'{m} {l}' for m, l in zip(mb, b))
    return (f"A code change in {r['file']}. In the caller, lines marked - were removed and lines marked + were added.\n\n"
            f"=== CALLER BEFORE ===\n{cut(A)}\n\n=== CALLER AFTER ===\n{cut(B)}\n\n"
            f"=== HELPER `{r['helper']}` ({where}) ===\n{cut(helper)}\n")

def state_trimmed(r, ctx=4):
    before, after, helper, where = sides(r)
    a, b, ma, mb = line_marks(before, after)
    def trim(lines, marks):
        keep = [any(marks[max(0, i - ctx):i + ctx + 1].count(x) for x in '+-') or i == 0 for i in range(len(lines))]
        out, gap = [], False
        for k, l in zip(keep, lines):
            if k: out.append(l); gap = False
            elif not gap: out.append('    ...'); gap = True
        return '\n'.join(out)
    return (f"A code change in {r['file']}. Unchanged parts of the caller are shown as ...\n\n"
            f"=== CALLER BEFORE ===\n{cut(trim(a, ma))}\n\n=== CALLER AFTER ===\n{cut(trim(b, mb))}\n\n"
            f"=== HELPER `{r['helper']}` ({where}) ===\n{cut(helper)}\n")

def state_diff(r):
    import difflib
    c = r['code']
    before, after = (c['callerNew'], c['caller']) if r['kind'] == 'extract' else (c['caller'], c['callerNew'])
    d = '\n'.join(difflib.unified_diff(before.split('\n'), after.split('\n'), 'caller before', 'caller after', n=3, lineterm=''))
    where = 'added in this change' if r['kind'] == 'extract' else 'removed in this change'
    return (f"A code change in {r['file']}. Lines starting with - were removed from the caller, + were added.\n\n"
            f"=== CALLER DIFF ===\n{cut(d)}\n\n=== HELPER `{r['helper']}` ({where}) ===\n{cut(c['helper'])}\n")

def state_full(r):
    c = r['code']
    # The engine runs extract as inline backwards: for an extract, `caller` is the new caller (with
    # the call) and `callerNew` the old one (with the code); for an inline it is the other way round.
    before, after = (c['callerNew'], c['caller']) if r['kind'] == 'extract' else (c['caller'], c['callerNew'])
    where = 'added in this change' if r['kind'] == 'extract' else 'removed in this change'
    return (f"A code change in {r['file']}.\n\n=== CALLER BEFORE ===\n{cut(before)}\n\n=== CALLER AFTER ===\n{cut(after)}\n\n"
            f"=== HELPER `{r['helper']}` ({where}) ===\n{cut(c['helper'])}\n")

QUESTION = {
    'extract': "Was code that used to be written out inside the caller moved into the helper function, "
               "so the caller now calls the helper instead (an extracted function)? Answer no if the helper's "
               "code is new, or the caller's old code was deleted or rewritten rather than moved.",
    'inline': "Was the helper function's code folded back into the caller, so the caller now does the work itself "
              "instead of calling the helper (an inlined function)? Answer no if the caller's new code is a "
              "different implementation, or the helper's code was simply deleted.",
}

CHOICE = {
    'extract': ("What best describes the helper and the caller's old code?", {
        'moved': "The helper's statements were written out in the caller before, and now live in the helper (renamed variables, new parameters or small edits allowed).",
        'new': "The helper is new code: the caller's old code did not contain these statements.",
        'rewritten': "The caller's old code did something similar, but the helper is a different implementation, not the same statements.",
        'elsewhere': "The helper's statements came from some other place, not from this caller.",
    }),
    'inline': ("What best describes the helper and the caller's new code?", {
        'moved': "The helper's statements now appear written out in the caller, in place of the call (renamed variables or small edits allowed).",
        'deleted': "The helper's code was dropped: the caller's new code does not contain these statements.",
        'rewritten': "The caller now does something similar, but with a different implementation, not the same statements.",
        'elsewhere': "The helper's statements went to some other place, not into this caller.",
    }),
}
# choice2: the choice question with the move's other half spelled out (the code must be gone from the
# caller) and a "copied" option. Micro tests showed choice ignored whether the code left the caller.
CHOICE2 = {
    'extract': ("What best describes the helper and the caller's old code?", {
        'moved': "The helper's statements used to be written out in the caller; they are gone from the caller now, which calls the helper instead (renamed variables, new parameters or small edits allowed).",
        'copied': "The helper's statements are still also written out in the caller after the change: duplicated, not moved.",
        'new': "The helper is new code: the caller's old code did not contain these statements.",
        'rewritten': "The caller's old code did something similar, but the helper is a different implementation, not the same statements.",
        'elsewhere': "The helper's statements came from some other place, not from this caller.",
    }),
    'inline': ("What best describes the helper and the caller's new code?", {
        'moved': "The helper's statements now appear written out in the caller, in place of the call, and the caller no longer calls the helper (renamed variables or small edits allowed).",
        'kept': "The caller still relies on the helper's code being elsewhere; its new code does not contain the helper's statements.",
        'deleted': "The helper's code was dropped: the caller's new code does not contain these statements.",
        'rewritten': "The caller now does something similar, but with a different implementation, not the same statements.",
        'elsewhere': "The helper's statements went to some other place, not into this caller.",
    }),
}
def question(r):
    if qtype in ('choice', 'choice2'):
        i, crit = (CHOICE if qtype == 'choice' else CHOICE2)[r['kind']]
        return {'type': 'choice', 'instructions': i, 'criteria': crit}
    return {'type': 'noul', 'instructions': QUESTION[r['kind']]}
def key(r): return hashlib.sha256((model + r['kind'] + state(r) + ('' if qtype == 'noul' else json.dumps(question(r)))).encode()).hexdigest()[:24]
# The key the engine side looks answers up by (bench/recall.ts, CLEF_ANSWERS): the candidate itself.
def ckey(r):
    c = r['code']
    return hashlib.sha256('\0'.join([r['kind'], r['file'], c['helper'], c['caller'], c['callerNew']]).encode('utf-8', 'surrogatepass')).hexdigest()[:24]

cache_path = os.path.join(work, 'clef', f"answers-{model}{'' if variant == 'full' else '-' + variant}{'' if qtype == 'noul' else '-' + qtype}.jsonl")
cache = {}
if os.path.exists(cache_path):
    for l in open(cache_path): x = json.loads(l); cache[x['key']] = x
# --all: every candidate the engine rejected, labelled or not (for held-out scoring, where labels
# are never read here); otherwise only labelled practice candidates.
everything = '--all' in args
items = [r for r in rows if not r['accepted']] if everything else [r for r in rows if r['label'] in ('extract', 'inline', 'no', 'borderline')]
# Backfill the engine-side key on answers cached before it existed.
need = [x for x in cache.values() if 'ckey' not in x]
if need:
    byk = {key(r): r for r in rows}
    for x in need:
        if x['key'] in byk: x['ckey'] = ckey(byk[x['key']])
    with open(cache_path, 'w') as f:
        for x in cache.values(): f.write(json.dumps(x) + '\n')
if limit: items = items[:limit]
todo = {key(r): r for r in items if key(r) not in cache}
chars = sum(len(state(r)) + len(QUESTION[r['kind']]) for r in todo.values())
print(f"candidate rows {len(items)}, to ask {len(todo)}, about {chars / 3.5 / 1e6:.2f}M tokens (~${chars / 3.5 / 1e6 * {'clef': 0.24, 'clef-flash': 0.038, 'jev': 0.042}[model]:.2f})")
if dry: sys.exit(0)

sys.path.insert(0, here)
from keys_file import load_keys, require
env = {}
keys = load_keys()
if model == 'jev':
    # TypeSafe's Jev, same question format (TYPESAFE_API_KEY in the keys file).
    env['CLOUDFLARE_API_TOKEN'] = require('TYPESAFE_API_KEY')
    env['CLOUDFLARE_ACCOUNT_ID'] = '-'
elif keys.get('CLOUDFLARE_ACCOUNT_ID') and keys.get('CLOUDFLARE_API_TOKEN'):
    env = {k: keys[k] for k in ('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN')}
else:
    # Borrow Wrangler's login (`npx wrangler login`); its OAuth scopes include Workers AI.
    import subprocess
    w = lambda *a: subprocess.run(['npx', '--yes', 'wrangler@4.158.0', *a], capture_output=True, text=True, cwd='/tmp', check=True).stdout
    who = json.loads(w('whoami', '--json'))
    accounts = who.get('accounts') or []
    env['CLOUDFLARE_ACCOUNT_ID'] = os.environ.get('CLOUDFLARE_ACCOUNT_ID') or accounts[0]['id']
    env['CLOUDFLARE_API_TOKEN'] = w('auth', 'token').strip().splitlines()[-1].strip()
url = f"https://api.cloudflare.com/client/v4/accounts/{env['CLOUDFLARE_ACCOUNT_ID']}/ai/run/@cf/cloudflare/clef"
if model == 'jev': url = 'https://api.typesafe.ai/v1/systemone'
API_MODEL = {'jev': 'jev-1.14.0'}.get(model, model)

def ask(k, r):
    body = json.dumps({'model': API_MODEL, 'state': state(r), 'questions': {'real': question(r)}}).encode()
    for attempt in range(5):
        req = urllib.request.Request(url, data=body, method='POST', headers={'Authorization': f"Bearer {env['CLOUDFLARE_API_TOKEN']}", 'Content-Type': 'application/json'})
        try:
            t0 = time.time()
            with urllib.request.urlopen(req, timeout=120) as resp: out = json.load(resp)
            ans = out.get('result', out)['answers']['real']
            p = ans if isinstance(ans, (int, float)) else ans['probabilities']['moved'] if ans.get('type') == 'choice' else ans.get('noul', ans.get('probability'))
            return {'key': k, 'ckey': ckey(r), 'p': float(p), 'ms': round(1000 * (time.time() - t0)), 'usage': out.get('result', out).get('usage')}
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503, 504): time.sleep(2 ** attempt); continue
            return {'key': k, 'error': f'{e.code} {msg}'}
        except Exception as e:  # network hiccup or unexpected shape
            if attempt == 4: return {'key': k, 'error': repr(e)[:300]}
            time.sleep(2 ** attempt)

errors = 0
with concurrent.futures.ThreadPoolExecutor(8) as pool, open(cache_path, 'a') as out:
    for i, x in enumerate(pool.map(lambda kv: ask(*kv), todo.items())):
        if 'error' in x:
            errors += 1; print('error:', x['error'])
            if errors >= 5: print('stopping after 5 errors'); break
            continue
        cache[x['key']] = x; out.write(json.dumps(x) + '\n'); out.flush()
        if i and i % 100 == 0: print(f"  {i}/{len(todo)}")

if everything: print('asked; held-out answers are scored by harness/score.ts with CLEF_ANSWERS set'); sys.exit(0)
# ---- comparison: one decision per candidate helper, as in train.py ----
for r in items:
    a = cache.get(key(r)); r['clef'] = a['p'] if a else None
cand = {}
for r in items:
    if r['clef'] is None: continue
    k = (r['repo'], r['commit'], r['file'], r['kind'], r['helper'])
    o = cand.get(k)
    if o is None or (r['accepted'] and not o['accepted']) or (r['accepted'] == o['accepted'] and r['clef'] > o['clef']): cand[k] = r
c = list(cand.values())
real = [r for r in c if r['label'] in ('extract', 'inline')]; no = [r for r in c if r['label'] == 'no']; bord = [r for r in c if r['label'] == 'borderline']
if not real or not no: print('not enough answers yet'); sys.exit(0)

def auc(pos, neg):
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))
print(f"\ncandidates {len(c)}: real {len(real)}, no {len(no)}, borderline {len(bord)}")
print(f"engine: finds {sum(r['accepted'] for r in real)}, wrong claims {sum(r['accepted'] for r in no)}")
print(f"Clef ranking quality (AUC, 0.5 = coin flip, 1 = perfect): {auc([r['clef'] for r in real], [r['clef'] for r in no]):.3f}")
rej_real = [r for r in real if not r['accepted']]; rej_no = [r for r in no if not r['accepted']]
acc_real = [r for r in real if r['accepted']]; acc_no = [r for r in no if r['accepted']]
if rej_real and rej_no: print(f"  among candidates the engine rejected: AUC {auc([r['clef'] for r in rej_real], [r['clef'] for r in rej_no]):.3f}")
print('Clef as an extra yes (engine rejected, Clef >= t):')
for t in [0.99, 0.97, 0.95, 0.9, 0.8, 0.7, 0.5]:
    print(f"  t={t:.2f}: +{sum(r['clef'] >= t for r in rej_real)} real, +{sum(r['clef'] >= t for r in rej_no)} wrong, +{sum(r['clef'] >= t for r in bord if not r['accepted'])} borderline")
print('Clef as a veto (engine accepted, Clef < t):')
for t in [0.05, 0.1, 0.2, 0.3, 0.5]:
    print(f"  t={t:.2f}: removes {sum(r['clef'] < t for r in acc_real)} real, {sum(r['clef'] < t for r in acc_no)} wrong")
ms = [x['ms'] for x in cache.values() if 'ms' in x]
if ms: ms.sort(); print(f"latency median {ms[len(ms) // 2]} ms, 90th {ms[int(len(ms) * 0.9)]} ms")
# Calibration on our task: in each probability band, how often is the candidate actually real?
# (Borderline counted as half real.) Calibrated means the two columns roughly agree.
print('calibration (band: candidates, share actually real):')
scored = real + no + bord
for lo in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.97]:
    hi = {0.9: 0.97, 0.97: 1.01}.get(lo, lo + 0.1)
    band = [r for r in scored if lo <= r['clef'] < hi]
    if band:
        share = sum(1.0 if r in real else 0.5 if r in bord else 0.0 for r in band) / len(band)
        print(f"  {lo:.2f}-{min(hi, 1):.2f}: {len(band):4d}, {100 * share:.0f}% real")
brier = sum((r['clef'] - (1.0 if r in real else 0.0)) ** 2 for r in real + no) / len(real + no)
print(f"Brier score {brier:.3f} (lower is better; always answering the base rate gives {len(real) / len(real + no) * (1 - len(real) / len(real + no)):.3f})")
