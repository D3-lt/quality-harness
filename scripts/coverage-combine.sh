#!/usr/bin/env bash
# coverage-combine.sh — ADR-139 T2: the Python floor's fan-in. Combines the coverage.py data of every shard and judges the floor.
# Usage: coverage-combine.sh <shards-dir> <count> <plugin-root> <floor> [--report]
# <shards-dir> holds one directory per shard, py-coverage-<i>-of-<count> (download-artifact's layout), each with the shard's
# .coverage.* files. A shard with no data, an empty data file, or one coverage.py cannot read fails the combine whatever the
# floor: a measurement that did not count is not a pass. Data recorded under another checkout root counts against
# <plugin-root> through [paths], since each runner checks out to its own directory.
# Exit: 0 at or above the floor (or --report); 1 below it, or a shard's data missing or unreadable; 2 usage.
set -euo pipefail

if [ "$#" -lt 4 ] || [ "$#" -gt 5 ] || { [ "$#" = 5 ] && [ "$5" != --report ]; }; then
  printf 'usage: coverage-combine.sh <shards-dir> <count> <plugin-root> <floor> [--report]\n' >&2
  exit 2
fi
SHARDS=$1 COUNT=$2 ROOT=$3 FLOOR=$4 MODE=${5:-}
case "$COUNT" in ''|*[!0-9]*|0) printf 'coverage-combine: count "%s" is not a positive whole number\n' "$COUNT" >&2; exit 2 ;; esac

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
missing=0
for i in $(seq 1 "$COUNT"); do
  shard="$SHARDS/py-coverage-$i-of-$COUNT"
  found=0
  for file in "$shard"/.coverage.*; do
    [ -e "$file" ] || continue
    if [ ! -s "$file" ]; then printf 'FAIL — %s is empty\n' "$file"; missing=1; continue; fi
    cp "$file" "$WORK/"
    found=1
  done
  if [ "$found" = 0 ]; then printf 'FAIL — py-coverage-%s-of-%s left no coverage data in %s\n' "$i" "$COUNT" "$SHARDS"; missing=1; fi
done
[ "$missing" = 0 ] || exit 1

cat > "$WORK/coverage.cfg" <<CFG
[run]
branch = True
parallel = True
data_file = $WORK/.coverage
source =
    $ROOT/bin
    $ROOT/lib

[paths]
bin =
    $ROOT/bin
    */plugin/bin
lib =
    $ROOT/lib
    */plugin/lib
CFG

# coverage.py SKIPS a data file it cannot read, with a warning and exit 0; read the warning rather than trust the exit.
set +e
said=$(cd "$WORK" && python3 -m coverage combine --rcfile="$WORK/coverage.cfg" 2>&1)
combined=$?
set -e
if [ "$combined" != 0 ] || printf '%s' "$said" | grep -q "Couldn't use data file"; then
  printf 'FAIL — the shards'"'"' coverage data could not all be combined:\n%s\n' "$said"
  exit 1
fi
if [ "$MODE" = --report ]; then
  python3 -m coverage report --rcfile="$WORK/coverage.cfg" --sort=cover
  printf '\nREPORT — no floor enforced (--report).\n'
  exit 0
fi
if ! python3 -m coverage report --rcfile="$WORK/coverage.cfg" --sort=cover --fail-under="$FLOOR"; then
  printf '\nFAIL — Python gate coverage is below %s%%.\n' "$FLOOR"
  exit 1
fi
