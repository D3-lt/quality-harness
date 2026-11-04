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

# Every data file is read by coverage.py itself before anything is combined: `coverage combine` skips one it cannot read with a
# warning and exit 0, and its wording varies by cause ("Couldn't use data file", "isn't a coverage data file"), so no list of
# warnings is the check (the Codex review of 753af2cf..86945589). A file that cannot be read fails the fan-in, named.
# One unreadable shape recorded nothing at all: a Python process killed while it was still creating its data file leaves the
# tables and not one row in any of them (land/69ec26ea, run 41872532283: shard 3 and the unsharded job each had one). Combining
# it would crash and refusing it would redden a run over a measurement of nothing, so it is left out and said; one row anywhere,
# or any other unreadable file, still fails.
python3 - "$WORK"/.coverage.* <<'PY'
import os
import sqlite3
import sys
from coverage import CoverageData


def recorded_nothing(path):
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            tables = [row[0] for row in con.execute("select name from sqlite_master where type = 'table'")]
            if "coverage_schema" not in tables or "file" not in tables:
                return False
            return all(con.execute(f'select count(*) from "{table}"').fetchone()[0] == 0 for table in tables)
        finally:
            con.close()
    except Exception:
        return False


bad = []
for path in sys.argv[1:]:
    try:
        # read_only: a writable read INITIALIZES a SQLite file with no coverage schema, turning foreign data into an empty
        # coverage file that passes (the Codex verification of c342ec82). combine itself opens inputs read-only.
        CoverageData(basename=path, read_only=True).read()
    except Exception as error:
        if recorded_nothing(path):
            print(f"advice: {os.path.basename(path)} holds tables and no row in any (a process killed while creating it); it recorded nothing and is left out")
            os.remove(path)
        else:
            bad.append(f"{os.path.basename(path)}: {error}")
for line in bad:
    print(f"FAIL — unreadable coverage data: {line}")
sys.exit(1 if bad else 0)
PY

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

# Every file was read above, so combine has nothing left to skip; its exit is still read.
if ! said=$(cd "$WORK" && python3 -m coverage combine --rcfile="$WORK/coverage.cfg" 2>&1); then
  printf 'FAIL — the shards'"'"' coverage data could not be combined:\n%s\n' "$said"
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
