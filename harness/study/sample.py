# Draws the study sample (PROTOCOL.md): writes www/items.json (what the rater sees) and key.json (hidden).
import json, os, random, subprocess, sys, secrets
# Paths are relative to the repository root. S is the scratch folder the sample was drawn in: it holds the
# claim lists eng.txt, jev.txt and tb.txt and the code extractor extract.ts (neither is kept in the repository).
R=os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
S=os.path.join(R, 'harness', 'work', 'study')
labs={}
for l in json.load(open(f'{R}/test/fixtures/labels/history-extracts.json'))['labels']:
    labs['|'.join([l['repo'],l['commit'][:7],l['file'],l['kind'],l['helper']])]=l
rd=lambda f: set(open(f'{S}/{f}').read().split())
eng=rd('eng.txt'); models=rd('jev.txt')|rd('tb.txt')
cand=set()
for line in open(f'{R}/harness/work/clef/features.jsonl'):
    r=json.loads(line); cand.add('|'.join([r['repo'],r['commit'][:7],r['file'],r['kind'],r['helper']]))
usable=lambda k: k in labs and labs[k].get('caller')
A=sorted(k for k in eng if usable(k))
B=sorted(k for k in models-eng if usable(k))
C1=sorted(k for k in cand-eng-models if usable(k) and labs[k]['label'] in ('extract','inline'))
C2=sorted(k for k in cand-eng-models if usable(k) and labs[k]['label']=='no')
print('pool sizes A',len(A),'B',len(B),'C1',len(C1),'C2',len(C2))
rnd=random.Random(20261109)
def extract(keys):
    items=[dict(repo=labs[k]['repo'],commit=labs[k]['commit'],file=labs[k]['file'],kind=labs[k]['kind'],helper=labs[k]['helper'],caller=labs[k]['caller']) for k in keys]
    out=subprocess.run(['node',f'{S}/extract.ts'],input=json.dumps(items),capture_output=True,text=True,cwd=R)
    if out.returncode: sys.exit(out.stderr[-2000:])
    return json.loads(out.stdout)
chosen=[]; replaced=0
for name,pool,n in (('A',A,14),('B',B,14),('C1',C1,4),('C2',C2,4)):
    order=pool[:]; rnd.shuffle(order); got=0; i=0
    while got<n:
        batch=order[i:i+n-got]; i+=len(batch)
        if not batch: sys.exit(f'stratum {name} ran out')
        for k,it in zip(batch,extract(batch)):
            if it.get('helperText') and it.get('callerOld') and it.get('callerNew'):
                chosen.append((name,k,it)); got+=1
            else: replaced+=1
rnd.shuffle(chosen)
key=[]; screens=[]
for name,k,it in chosen:
    iid=secrets.token_hex(4)
    key.append(dict(id=iid,stratum=name,key=k,ai=labs[k]['label'],ai_note=labs[k].get('note','')))
    screens.append(dict(id=iid,repeat=False,**{x:it[x] for x in ('repo','commit','file','kind','helper','caller','lang','helperText','callerOld','callerNew')}))
# Repeats: 4 random items, each shown again at least 10 screens after the first time.
base=len(screens)
reps=rnd.sample(range(base-11),4)
for r in sorted(reps, reverse=True):
    copy=dict(screens[r]); copy['repeat']=True
    screens.insert(rnd.randint(r+11, len(screens)), copy)
for n,s in enumerate(screens,1): s['n']=n
json.dump(screens,open(f'{S}/study/www/items.json','w'))
json.dump(dict(seed=20261109,replaced=replaced,items=key,repeats=[screens[i]['id'] for i in range(len(screens)) if screens[i]['repeat']]),open(f'{S}/study/key.json','w'),indent=1)
print('screens',len(screens),'unique',len(key),'replaced',replaced)
