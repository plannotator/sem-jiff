#!/bin/bash
# Usage: [ENGINE=dir] harness/unlabelled.sh OUTDIR [ENV=VAL ...]
# Lists, per practice project, the engine's claims that have no label yet (one file each in OUTDIR).
export L="$(cd "$(dirname "$0")/.." && pwd)"
cd ${ENGINE:-$L}
out=$1; shift; mkdir -p $out
node -e 'const p=require(process.env.L+"/harness/projects.json").filter(x=>x.set==="practice"); for (const x of p) console.log(x.name+" "+x.labels)' | \
  xargs -P 6 -L 1 bash -c 'test -f $L/harness/work/data/hist-$0.json && env '"$*"' node --max-old-space-size=8192 --stack-size=8000 bench/recall.ts $L/test/fixtures/labels/$1 $0=$L/harness/work/data/hist-$0.json 2>/dev/null | grep "unlabelled:" > '"$out"'/$0.txt'
