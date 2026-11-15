#!/bin/bash
# Score the Effect held-out projects. Prints TOTALS ONLY: no case names, so
# nobody tunes the engine to them. Usage: bench/locked-effect.sh <dir-with-hist-*.json> [engine-dir]
ROOT=$(cd "$(dirname "$0")/.." && pwd)
D=$1; E=${2:-$ROOT}
cd "$E"
for r in aksara foldkit-dials ghost peektrace dotflowy foldkit-alchemy-starter; do
  node --max-old-space-size=8192 --stack-size=8000 bench/recall.ts $ROOT/test/fixtures/labels/locked-effect-extracts.json $r=$D/hist-$r.json 2>&1 | grep -E "^(real|reported)" | sed "s/^/$r: /" &
done | sort
wait
