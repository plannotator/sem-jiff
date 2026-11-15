# synthetic_git.py cases.jsonl : what plain git can say about the same generated changes, with the
# options a reviewer already has: `--color-moved` (moved blocks) and `-w` (ignore whitespace).
# - moved / imports re-sorted: recognised when every changed line is coloured as moved.
# - re-indented: recognised when `git diff -w` shows no change.
# - renamed, extracted, inlined: git has no way to say these.
import json, os, re, subprocess, sys, tempfile, time, statistics
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

EXT = {'typescript': 'ts', 'tsx': 'tsx', 'java': 'java', 'go': 'go', 'python': 'py', 'rust': 'rs', 'csharp': 'cs'}
# Fixed colours so the output can be read back: plain old/new = red/green, moved = blue/yellow (both zebra halves).
COLOURS = ['-c', 'color.diff.old=red', '-c', 'color.diff.new=green', '-c', 'color.diff.oldMoved=blue', '-c', 'color.diff.newMoved=yellow',
           '-c', 'color.diff.oldMovedAlternative=blue', '-c', 'color.diff.newMovedAlternative=yellow']
MOVED_WS = os.environ.get('MOVED_WS')  # e.g. allow-indentation-change

def changed_lines(out):
    """(moved, plain) counts of non-blank changed lines in a coloured diff."""
    moved = plain = 0
    for line in out.split('\n'):
        m = re.match(r'\x1b\[(\d+)m([+-])(.*)', line)
        if not m or line.startswith('\x1b[1m'): continue
        text = re.sub(r'\x1b\[[0-9;]*m', '', m.group(3))
        if not text.strip(): continue  # git never marks blank lines as moved
        if m.group(1) in ('34', '33'): moved += 1
        elif m.group(1) in ('31', '32'): plain += 1
    return moved, plain

def one(c):
    ext = EXT[c['language']]
    with tempfile.TemporaryDirectory() as d:
        fa = os.path.join(d, f'a.{ext}'); fb = os.path.join(d, f'b.{ext}')
        open(fa, 'w').write(c['old']); open(fb, 'w').write(c['new'])
        t = time.time()
        k = c['kind']
        if k == 'reindent':
            out = subprocess.run(['git', 'diff', '--no-index', '-w', '--numstat', fa, fb], capture_output=True, text=True).stdout
            ok = not out.strip()
        elif k in ('move', 'imports'):
            ws = [f'--color-moved-ws={MOVED_WS}'] if MOVED_WS else []
            out = subprocess.run(['git', *COLOURS, 'diff', '--no-index', '--color=always', '--color-moved=zebra', *ws, fa, fb], capture_output=True, text=True).stdout
            moved, plain = changed_lines(out)
            ok = moved > 0 and plain == 0
        else:
            ok = None
        return k, c['language'], ok, time.time() - t

cases = [json.loads(l) for l in open(sys.argv[1])]
tally = defaultdict(lambda: [0, 0]); secs = []
with ThreadPoolExecutor(6) as ex:
    for k, lang, ok, s in ex.map(one, cases):
        secs.append(s)
        if ok is None: continue
        tally[k][0] += 1; tally[k][1] += bool(ok)
        tally[(k, lang)][0] += 1; tally[(k, lang)][1] += bool(ok)
for k in ['move', 'imports', 'reindent']:
    n, ok = tally[k]
    per = ', '.join(f'{l} {tally[(k, l)][1]}/{tally[(k, l)][0]}' for l in sorted(EXT) if tally[(k, l)][0])
    print(f'{k}: {ok}/{n} ({100*ok/n:.0f}%)  [{per}]')
print("rename, extract, inline: can't say")
print('median seconds per file pair:', round(statistics.median(secs), 3))
