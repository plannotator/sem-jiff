# probes.py : micro tests of how the decision models judge "was this code pulled out into the helper?".
# Hand-made TypeScript examples that change one thing at a time; prints each model's answer per probe.
# Calls: Jev yes/no, Jev multiple choice, Clef yes/no (about 1 cent in total).
import json, os, subprocess, sys, urllib.request

here = os.path.dirname(os.path.abspath(__file__))
work = os.path.join(here, '..', 'work')
sys.argv = ['x']
src = open(os.path.join(here, 'clef.py')).read()
ns = {'__file__': os.path.join(here, 'clef.py')}
exec(src.split("cache_path")[0].replace("rows = [json.loads(l) for f in args if f != '--all' for l in open(f)]", "rows=[]"), ns)
QUESTION, CHOICE = ns['QUESTION'], (ns['CHOICE2'] if os.environ.get('CHOICE2') else ns['CHOICE'])

NOISE = '\n'.join(f'  metrics.record("step{i}", Date.now() - started);' for i in range(40))
def caller(body, noise=False):
    return f"function checkout(cart: Cart, user: User) {{\n  const started = Date.now();\n{body}\n{NOISE if noise else ''}\n  return submitOrder(cart, user);\n}}"
OLD_BLOCK = """  let total = 0;
  for (const item of cart.items) {
    total += item.price * item.quantity;
  }
  if (user.isMember) {
    total = total * 0.9;
  }
  cart.total = Math.round(total * 100) / 100;"""
CALL = "  cart.total = computeTotal(cart, user);"
def helper(body, name='computeTotal'):
    return f"function {name}(cart: Cart, user: User): number {{\n{body}\n}}"
EXACT = """  let total = 0;
  for (const item of cart.items) {
    total += item.price * item.quantity;
  }
  if (user.isMember) {
    total = total * 0.9;
  }
  return Math.round(total * 100) / 100;"""
RENAMED = """  let sum = 0;
  for (const line of cart.items) {
    sum += line.price * line.quantity;
  }
  if (user.isMember) {
    sum = sum * 0.9;
  }
  return Math.round(sum * 100) / 100;"""
REORDERED_REWRITE = """  const gross = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const net = user.isMember ? gross * 0.9 : gross;
  return Math.round(net * 100) / 100;"""
SIMILAR_JOB = """  const rates = taxTable[user.region] ?? defaultRates;
  const shipping = cart.weight > 20 ? rates.heavy : rates.standard;
  return Math.ceil((cart.subtotal + shipping) * (1 + rates.vat));"""
HALF = """  let total = 0;
  for (const item of cart.items) {
    total += item.price * item.quantity;
  }
  const coupon = coupons.lookup(user.id);
  return coupon ? coupon.apply(total) : total;"""

probes = {
    # name: (caller before, caller after, helper code, helper name)
    'exact move': (caller(OLD_BLOCK), caller(CALL), helper(EXACT), 'computeTotal'),
    'renamed variables': (caller(OLD_BLOCK), caller(CALL), helper(RENAMED), 'computeTotal'),
    'same logic rewritten (reduce)': (caller(OLD_BLOCK), caller(CALL), helper(REORDERED_REWRITE), 'computeTotal'),
    'half moved, half new': (caller(OLD_BLOCK), caller(CALL), helper(HALF), 'computeTotal'),
    'new helper, similar job (tax+shipping)': (caller(OLD_BLOCK), caller(OLD_BLOCK + '\n  cart.fees = computeFees(cart, user);'), helper(SIMILAR_JOB, 'computeFees'), 'computeFees'),
    'old code deleted, unrelated new helper': (caller(OLD_BLOCK), caller('  cart.fees = computeFees(cart, user);'), helper(SIMILAR_JOB, 'computeFees'), 'computeFees'),
    'exact move, meaningless name': (caller(OLD_BLOCK), caller(CALL.replace('computeTotal', 'h1')), helper(EXACT, 'h1'), 'h1'),
    'unrelated helper, name "extractedTotal"': (caller(OLD_BLOCK), caller(OLD_BLOCK + '\n  cart.fees = extractedTotal(cart, user);'), helper(SIMILAR_JOB, 'extractedTotal'), 'extractedTotal'),
    'exact move inside a long caller': (caller(OLD_BLOCK, True), caller(CALL, True), helper(EXACT), 'computeTotal'),
    'one-line exact move': (caller('  const free = cart.total > 100 && user.isMember;\n  cart.shipping = free ? 0 : 5;'), caller('  cart.shipping = isFreeShipping(cart, user) ? 0 : 5;'),
                            "function isFreeShipping(cart: Cart, user: User) {\n  return cart.total > 100 && user.isMember;\n}", 'isFreeShipping'),
    'one-line new accessor': (caller('  cart.shipping = 5;'), caller('  cart.shipping = shippingFor(cart);'),
                              "function shippingFor(cart: Cart) {\n  return cart.region.shipping;\n}", 'shippingFor'),
}

if '--batch2' in sys.argv[1:] or os.environ.get('BATCH2'):
    SAME_PURPOSE = """  const prices = cart.items.map((i) => pricing.lookup(i.sku) * i.quantity);
  const discount = loyalty.discountFor(user);
  return applyDiscount(sum(prices), discount);"""
    probes = {
        'copy, not move (old code still in caller)': (caller(OLD_BLOCK), caller(OLD_BLOCK + '\n  audit(computeTotal(cart, user));'), helper(EXACT), 'computeTotal'),
        'move + caller unchanged otherwise, no call': (caller(OLD_BLOCK), caller(''), helper(EXACT), 'computeTotal'),
        'same purpose, new implementation (old deleted)': (caller(OLD_BLOCK), caller(CALL), helper(SAME_PURPOSE), 'computeTotal'),
        'exact move + one line changed (0.9 -> 0.85)': (caller(OLD_BLOCK), caller(CALL), helper(EXACT.replace('0.9', '0.85')), 'computeTotal'),
        'exact move + new validation added': (caller(OLD_BLOCK), caller(CALL), helper('  if (!cart.items.length) throw new Error("empty");\n' + EXACT), 'computeTotal'),
        'exact move, sections in other order': None,
    }
    probes = {k: v for k, v in probes.items() if v}
    truth_override = {'copy, not move (old code still in caller)': 'no', 'move + caller unchanged otherwise, no call': 'grey',
                      'same purpose, new implementation (old deleted)': 'grey', 'exact move + one line changed (0.9 -> 0.85)': 'yes', 'exact move + new validation added': 'yes'}
else:
    truth_override = {}

def row(before, after, h, name):
    return {'kind': 'extract', 'file': 'src/checkout.ts', 'helper': name, 'code': {'helper': h, 'caller': after, 'callerNew': before}}

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keys_file import require
jev_key = require('TYPESAFE_API_KEY')  # from the file named by $SEM_DIFF_KEYS_FILE
w = lambda *a: subprocess.run(['npx', '--yes', 'wrangler@4.158.0', *a], capture_output=True, text=True, cwd='/tmp', check=True).stdout
acct = json.loads(w('whoami', '--json'))['accounts'][0]['id']; cf_tok = w('auth', 'token').strip().splitlines()[-1].strip()

def call(url, tok, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST', headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r: out = json.load(r)
    return out.get('result', out)['answers']['q']

def ask(r):
    st = ns['state_full'](r)
    noul = {'type': 'noul', 'instructions': QUESTION['extract']}
    i, crit = CHOICE['extract']
    ch = {'type': 'choice', 'instructions': i, 'criteria': crit}
    j1 = call('https://api.typesafe.ai/v1/systemone', jev_key, {'model': 'jev-1.14.0', 'state': st, 'questions': {'q': noul}})['noul']
    j2 = call('https://api.typesafe.ai/v1/systemone', jev_key, {'model': 'jev-1.14.0', 'state': st, 'questions': {'q': ch}})
    c1 = call(f'https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/@cf/cloudflare/clef', cf_tok, {'model': 'clef', 'state': st, 'questions': {'q': noul}})['noul']
    return j1, j2, c1

print(f"{'probe':42} {'truth':6} {'Jev y/n':>8} {'Jev choice P(moved)':>20} {'(top pick)':>12} {'Clef y/n':>9}")
truth = {'exact move': 'yes', 'renamed variables': 'yes', 'same logic rewritten (reduce)': 'grey', 'half moved, half new': 'grey',
         'exact move, meaningless name': 'yes', 'exact move inside a long caller': 'yes', 'one-line exact move': 'yes'}
for name, p in probes.items():
    j1, j2, c1 = ask(row(*p))
    print(f"{name:42} {truth_override.get(name, truth.get(name, 'no')):6} {j1:8.2f} {j2['probabilities']['moved']:20.2f} {j2['choice']:>12} {c1:9.2f}")
