#!/bin/bash
# Build a fresh held-out set: clone each project (bare, shallow), build its dataset from its last
# 300 commits, run the loose candidate search, and write the labelling list. Prints counts only.
# Usage: harness/heldout/build.sh <dir> name=url ...
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(cd "$1" && pwd); shift
cd "$ROOT"
X='(^|/)(tests?|testdata|fixtures?|vendor|vendors|node_modules|benches|benchmarks?|src/test|[^/]*Tests?|[^/]*\.Tests?|__tests__|__mocks__|e2e|examples?|docs?|dist|generated|[^/]*-tests?|\.changeset)/|\.d\.ts$|_test\.go$|\.(spec|test|stories|bench)\.[jt]sx?$|\.gen\.ts$|(^|/)test_[^/]*\.py$|_test\.py$|conftest\.py$|Tests?\.(java|cs)$|\.Designer\.cs$|\.g\.cs$'
# EXTRA_EXCLUDE adds to the list; INCLUDE and LOOSE_GRAMMAR build a language the engine does not read yet.
X="$X${EXTRA_EXCLUDE:+|$EXTRA_EXCLUDE}"
mkdir -p "$D/repos"
for pair in "$@"; do
  r=${pair%%=*}; url=${pair#*=}
  [ -d "$D/repos/$r" ] || git clone -q --bare --no-tags --single-branch --depth=400 "$url" "$D/repos/$r"
  node --max-old-space-size=8192 bench/history.ts "$D/repos/$r" "$D/hist-$r.json" 300 "$X" > "$D/hist-$r.log" 2>&1 \
    && node --max-old-space-size=8192 --stack-size=8000 harness/heldout/loose.ts "$D/hist-$r.json" "$D/cand-$r.json" > "$D/cand-$r.log" 2>&1 \
    && CAP=${CAP:-70} node --max-old-space-size=8192 --stack-size=8000 harness/heldout/todo.ts "$D" "$r" > "$D/todo-$r.log" 2>&1
  echo "$r: $(tail -1 "$D/hist-$r.log" | cut -c1-80) | $(cat "$D/todo-$r.log")"
done
