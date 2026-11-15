#!/bin/bash
# Score the TypeScript held-out projects. Prints TOTALS ONLY: no case names, so
# nobody tunes the engine to them. Usage: bench/locked-ts.sh <dir-with-hist-*.json> [engine-dir]
ROOT=$(cd "$(dirname "$0")/.." && pwd)
D=$1; E=${2:-$ROOT}
cd "$E"
for r in core query tldraw mermaid trpc apollo-client; do
  node --max-old-space-size=8192 bench/recall.ts $ROOT/test/fixtures/labels/locked-ts-extracts.json $r=$D/hist-$r.json 2>&1 | grep -E "^(real|reported)" | sed "s/^/$r: /" &
done | sort
wait
