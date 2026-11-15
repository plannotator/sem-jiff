#!/bin/bash
# Score the held-out projects. Prints TOTALS ONLY: no case names, so nobody tunes
# the engine to them. Usage: bench/locked.sh <dir-with-hist-*.json> [engine-dir]
ROOT=$(cd "$(dirname "$0")/.." && pwd)
D=$1; E=${2:-$ROOT}
cd "$E"
for r in nest caddy alacritty poetry netty efcore; do
  node --max-old-space-size=8192 bench/recall.ts $ROOT/test/fixtures/labels/locked-extracts.json $r=$D/hist-$r.json 2>&1 | grep -E "^(real|reported)" | sed "s/^/$r: /" &
done | sort
wait
