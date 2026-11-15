# charts.py [outdir] : the experiment charts, drawn from saved data only (no API calls, no engine runs).
# Needs matplotlib: python3 -m venv harness/work/.venv && harness/work/.venv/bin/pip install matplotlib==3.9.2
# Run:  harness/work/.venv/bin/python harness/analysis/charts.py harness/work/charts
#
#   1-gain-vs-mistakes.png  practice: real cases added vs wrong claims added, per second-opinion setup
#   2-calibration.png       practice: what the model said vs how often it was right
#   3-per-project.png       practice: where Jev's gains come from, project by project
#   4-held-out.png          held-out: found and wrong per setting (from the ledger)
import json, os, sys, collections
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

here = os.path.dirname(os.path.abspath(__file__))
work = os.path.join(here, '..', 'work')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(work, 'charts')
os.makedirs(out, exist_ok=True)

# Reference palette (dataviz skill), light mode: categorical slots in fixed order, text and surface tokens.
SLOT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
INK, INK2, MUTED, GRID, SURFACE = '#0b0b0b', '#52514e', '#8a8984', '#e6e5e1', '#fcfcfb'
RETRO = os.environ.get('THEME') == 'retro'
if RETRO:
    # Dark look: black screen, white text, neutral greys, bright colours for the data only.
    SLOT = ['#4de1ff', '#ff5fd2', '#7dff7a', '#ffd84d', '#ff6b6b']
    INK, INK2, MUTED, GRID, SURFACE = '#ffffff', '#d9d9d9', '#8c8c8c', '#262626', '#050505'
    out = out.rstrip('/') + '-retro'
    os.makedirs(out, exist_ok=True)
plt.rcParams.update({'font.family': 'sans-serif', 'font.size': 10, 'text.color': INK, 'axes.labelcolor': INK2,
                     'xtick.color': INK2, 'ytick.color': INK2, 'axes.edgecolor': GRID, 'figure.facecolor': SURFACE,
                     'axes.facecolor': SURFACE, 'savefig.facecolor': SURFACE, 'axes.spines.top': False, 'axes.spines.right': False})

def style(ax, title, sub=None):
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)
    if RETRO:
        # Very faint grey scanlines across the plot, for texture only.
        y0, y1 = ax.get_ylim()
        for k in range(70): ax.axhspan(y0 + (y1 - y0) * k / 70, y0 + (y1 - y0) * (k + 0.5) / 70, color='#0b0b0b', zorder=0, linewidth=0)
        ax.set_ylim(y0, y1)
    ax.set_title(title, loc='left', fontsize=12, fontweight='bold', color=INK, pad=(10 + 14 * (sub.count(chr(10)) + 1)) if sub else 8)
    if sub: ax.annotate(sub, (0, 1), xycoords='axes fraction', xytext=(0, 6), textcoords='offset points', fontsize=9, color=INK2)

def monotone(xs, ys, n=24):
    """Fritsch-Carlson monotone cubic through (xs, ys), sampled n points per interval."""
    import numpy as np
    x, y = np.asarray(xs, float), np.asarray(ys, float)
    h = np.diff(x); d = np.diff(y) / h
    m = np.zeros_like(y); m[0], m[-1] = d[0], d[-1]
    for k in range(1, len(x) - 1): m[k] = 0 if d[k - 1] * d[k] <= 0 else 3 * (h[k - 1] + h[k]) / ((2 * h[k] + h[k - 1]) / d[k - 1] + (h[k] + 2 * h[k - 1]) / d[k])
    X, Y = [], []
    for k in range(len(h)):
        t = np.linspace(0, 1, n, endpoint=False)
        h00, h10, h01, h11 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2
        X += list(x[k] + t * h[k]); Y += list(h00 * y[k] + h10 * h[k] * m[k] + h01 * y[k + 1] + h11 * h[k] * m[k + 1])
    return X + [x[-1]], Y + [y[-1]]

# ---- practice data: candidates, labels, every saved answer ----
def loader(model, inp, q):
    sys.argv = ['x', '--model', model, '--input', inp, '--question', q]
    src = open(os.path.join(here, '..', 'compare', 'clef.py')).read()
    ns = {'__file__': os.path.join(here, '..', 'compare', 'clef.py')}
    exec(src.split("cache_path")[0].replace("rows = [json.loads(l) for f in args if f != '--all' for l in open(f)]", "rows=[]"), ns)
    path = os.path.join(work, 'clef', f"answers-{model}{'' if inp == 'full' else '-' + inp}{'' if q == 'noul' else '-' + q}.jsonl")
    return ns['key'], {json.loads(l)['key']: json.loads(l)['p'] for l in open(path)}

rows = [json.loads(l) for l in open(os.path.join(work, 'clef', 'features.jsonl'))]
rows = [r for r in rows if r['label'] in ('extract', 'inline', 'no', 'borderline')]
SETUPS = [('Clef, yes/no', ('clef', 'full', 'noul')), ('Jev, yes/no', ('jev', 'full', 'noul')), ('Jev, multiple choice', ('jev', 'full', 'choice'))]
EXTRA = [('Clef, multiple choice', ('clef', 'full', 'choice'))]  # chart 1 only
for name, v in SETUPS + EXTRA:
    k, ans = loader(*v)
    for r in rows: r[name] = ans.get(k(r))
logit = {(x['repo'], x['commit'], x['file'], x['kind'], x['helper']): x['p'] for x in map(json.loads, open(os.path.join(work, 'clef', 'logistic-probs.jsonl')))}
LOG = 'Engine evidence, reweighted'
for r in rows: r[LOG] = logit.get((r['repo'], r['commit'], r['file'], r['kind'], r['helper']), 0)
real = lambda r: r['label'] in ('extract', 'inline')

def rejected(v):
    """One decision per candidate helper (as the engine makes it); only those the rules rejected."""
    cand = {}
    for r in rows:
        if r[v] is None: continue
        k = (r['repo'], r['commit'], r['file'], r['kind'], r['helper']); o = cand.get(k)
        if o is None or (r['accepted'] and not o['accepted']) or (r['accepted'] == o['accepted'] and r[v] > o[v]): cand[k] = r
    return [r for r in cand.values() if not r['accepted']]

# 1. Gain vs mistakes: sweep the cut-off; each point is (wrong added, real added).
fig, ax = plt.subplots(figsize=(9, 5.2))
ends = []
for i, (name, _) in enumerate(SETUPS + [(LOG, None)] + EXTRA):
    cs = sorted(rejected(name), key=lambda r: -r[name])
    xs, ys, w, g = [0], [0], 0, 0
    for r in cs:
        if r['label'] == 'no': w += 1
        elif real(r): g += 1
        else: continue
        if w > 25: break
        xs.append(w); ys.append(g)
    # The best count reached at each number of wrong claims, joined by a monotone smooth curve
    # (it never overshoots the data: each point is a real cut-off).
    best = {}
    for x, y in zip(xs, ys): best[x] = max(best.get(x, 0), y)
    px = sorted(best); py = [best[x] for x in px]
    if px[-1] < 25: px.append(25); py.append(py[-1])
    cx, cy = monotone(px, py)
    ax.plot(cx, cy, color=SLOT[i], linewidth=2.2, label=name, solid_capstyle='round')
    ends.append([ys[-1], name])
# Direct labels at the right end, nudged apart so none collide (at least 9 units apart).
ends.sort(reverse=True)
for j in range(1, len(ends)): ends[j][0] = min(ends[j][0], ends[j - 1][0] - 9)
for y, name in ends: ax.annotate(name, (25, y), xytext=(6, 0), textcoords='offset points', va='center', fontsize=9, color=INK)
ax.legend(frameon=False, loc='lower right', fontsize=9)
engine = sum(1 for r in {(r['repo'], r['commit'], r['file'], r['kind'], r['helper']): r for r in rows if r['accepted'] and real(r)}.values())
ax.set_xlim(0, 25); ax.set_ylim(0, None); ax.set_xlabel('wrong claims added'); ax.set_ylabel('real cases added')
style(ax, 'How many real cases each second opinion adds, per mistake', f'Practice set: {len(rejected(SETUPS[0][0]))} candidates the engine rejected; the engine alone finds {engine}. Steeper and higher is better.')
fig.tight_layout(); fig.savefig(os.path.join(out, '1-gain-vs-mistakes.png'), dpi=160); plt.close(fig)

# 2. Calibration: what the model said (binned) vs share actually real (borderline = half).
fig, ax = plt.subplots(figsize=(6.2, 5.6))
ax.plot([0, 1], [0, 1], color=MUTED, linewidth=1, linestyle='--')
ax.annotate('honest', (0.86, 0.9), color=MUTED, fontsize=9, rotation=40)
for i, (name, _) in enumerate(SETUPS):
    pts = []
    for lo in [x / 10 for x in range(10)]:
        band = [r for r in rows if r[name] is not None and lo <= r[name] < lo + 0.1 + (lo == 0.9) * 0.01]
        if len(band) >= 20:
            pts.append((sum(r[name] for r in band) / len(band), sum(1 if real(r) else 0.5 if r['label'] == 'borderline' else 0 for r in band) / len(band)))
    ax.plot([p[0] for p in pts], [p[1] for p in pts], color=SLOT[i], linewidth=2, marker='o', markersize=5, markeredgecolor=SURFACE, markeredgewidth=1.5, label=name)
ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.set_xlabel('what the model said (probability it is real)'); ax.set_ylabel('share actually real')
ax.legend(frameon=False, loc='upper left', fontsize=9)
ax.title.set_y(1.04); style(ax, 'Do the percentages mean what they say?', 'Practice set, bands of 0.1 (20+ candidates each).\nOn the dashed line: honest.')
fig.tight_layout(); fig.savefig(os.path.join(out, '2-calibration.png'), dpi=160); plt.close(fig)

# 3. Per project: real and wrong added by Jev multiple choice at its fixed cut-off (0.74).
name, T = 'Jev, multiple choice', 0.74
per = collections.defaultdict(lambda: [0, 0, 0])
for r in rejected(name):
    if r[name] >= T: per[r['repo']][0 if real(r) else 1 if r['label'] == 'no' else 2] += 1
items = sorted(per.items(), key=lambda kv: (kv[1][0], -kv[1][1]))
fig, ax = plt.subplots(figsize=(7.5, max(4, 0.22 * len(items) + 1.2)))
ys = range(len(items))
ax.barh(ys, [v[0] for _, v in items], color=SLOT[2], height=0.6, label='real cases added')
ax.barh(ys, [-v[1] for _, v in items], color=SLOT[1], height=0.6, label='wrong claims added')
ax.set_yticks(list(ys)); ax.set_yticklabels([k for k, _ in items], fontsize=8)
ax.axvline(0, color=INK2, linewidth=0.8); ax.legend(frameon=False, loc='lower right', fontsize=9)
ax.set_xlabel('candidates (wrong to the left, real to the right)')
tot = [sum(v[i] for v in per.values()) for i in range(3)]
style(ax, 'Where the gains come from', f'Practice set, Jev multiple choice at {T}: +{tot[0]} real, +{tot[1]} wrong, +{tot[2]} arguable across {len(per)} projects.')
fig.tight_layout(); fig.savefig(os.path.join(out, '3-per-project.png'), dpi=160); plt.close(fig)

# 4. Held-out: totals per setting, from the ledger records labelled "held:<setting>".
led = os.path.join(work, 'ledger.jsonl')
recs = [json.loads(l) for l in open(led)] if os.path.exists(led) else []
held = collections.OrderedDict()
for r in recs:
    if (r.get('label') or '').startswith('held:') and r['set'].startswith('held'):
        held.setdefault(r['label'][5:], {})[r['set']] = r['totals']
if held:
    names = list(held)
    T = {n: {k: sum(s[k] for s in held[n].values()) for k in ('real', 'found', 'wrong', 'borderline')} for n in names}
    fig, ax = plt.subplots(figsize=(8, 0.6 * len(names) + 1.6))
    ys = range(len(names))[::-1]
    ax.barh(list(ys), [T[n]['found'] for n in names], color=SLOT[0], height=0.55)
    for y, n in zip(ys, names):
        ax.annotate(f"{T[n]['found']} of {T[n]['real']}   ·   {T[n]['wrong']} wrong, {T[n]['borderline']} arguable", (T[n]['found'], y), xytext=(6, 0), textcoords='offset points', va='center', fontsize=9, color=INK)
    ax.set_yticks(list(ys)); ax.set_yticklabels(names, fontsize=9)
    ax.set_xlim(0, max(T[n]['real'] for n in names) * 1.55); ax.set_xlabel('real cases found (held-out, all three sets)')
    style(ax, 'Held-out: real cases found per setting', 'Cut-offs fixed on practice before scoring; every new claim labelled blind (counts only).')
    fig.tight_layout(); fig.savefig(os.path.join(out, '4-held-out.png'), dpi=160); plt.close(fig)
print('charts in', out)
