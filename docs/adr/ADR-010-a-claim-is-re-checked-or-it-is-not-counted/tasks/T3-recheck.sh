#!/usr/bin/env bash
# T3's acceptance: the three claims ADR-008 broke are repaired AND re-recorded.
#
# Two halves, and both are necessary. A cold review found that a clean
# `adr-verify --sweep` proves neither:
#
#   * Editing a fence without re-recording makes its old entry SUPERSEDED, which
#     is in neither half of the ratio — so the sweep reports zero false successes
#     with no fresh evidence anywhere. Half one closes that: an exit-0 entry must
#     carry the task's CURRENT digest.
#   * T3 is itself a claim. If its acceptance were a sweep, every later sweep
#     would re-run it, and re-running it is another sweep. This names no --sweep.
#
# Red today on half two: the three fences fail. Half one passes today, because
# the fence text never changed — the world under it did.
set -o pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
cd "$ROOT" || exit 2

TASKS=(
  "docs/adr/ADR-006-a-verdict-that-names-its-own-reliability/tasks/T2-amend-and-bind-the-spec.md"
  "docs/adr/ADR-007-a-dependency-that-crosses-records/tasks/T1-a-qualified-id-resolves.md"
  "docs/adr/ADR-009-a-decision-names-what-enforces-it/tasks/T1-parse-and-resolve.md"
)

failed=0

for task in "${TASKS[@]}"; do
  if [ ! -f "$task" ]; then
    printf 'MISSING  %s\n' "$task"
    failed=1
    continue
  fi

  # Half one: fresh evidence. The task's CURRENT fence must be the one an exit-0
  # entry proved. Supersession cannot satisfy this, which is the point.
  if ! python3 - "$task" <<'PY'
import hashlib, re, sys
from pathlib import Path

task = Path(sys.argv[1])
text = task.read_text(encoding="utf-8", errors="replace")

fence = re.search(r"^## Acceptance\s*\n+```bash\n(.*?)```", text, re.M | re.S)
if not fence:
    print(f"NO FENCE {task}")
    sys.exit(1)

lines = fence.group(1).replace("\r\n", "\n").replace("\r", "\n").split("\n")
start, end = 0, len(lines)
while start < end and not lines[start].strip():
    start += 1
while end > start and not lines[end - 1].strip():
    end -= 1
current = hashlib.sha256("\n".join(lines[start:end]).encode("utf-8")).hexdigest()

log = re.search(r"^## Verification Log\s*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
recorded = set(re.findall(
    r"^- \d{4}-\d{2}-\d{2} · (?:[0-9a-f]{7,40}\*?|no-git) · exit 0 · "
    r"`[^`]+` · acceptance-sha256:([0-9a-f]{64})\s*$",
    log.group(1) if log else "", re.M))

if current not in recorded:
    print(f"STALE    {task} — no exit-0 entry proves its current fence")
    sys.exit(1)
sys.exit(0)
PY
  then
    failed=1
    continue
  fi

  # Half two: the fence actually passes. Extracted and run exactly as the
  # recording path runs it — from the repository root, whole, not line one.
  fence=$(python3 - "$task" <<'PY'
import re, sys
from pathlib import Path
m = re.search(r"^## Acceptance\s*\n+```bash\n(.*?)```",
              Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace"), re.M | re.S)
sys.stdout.write(m.group(1) if m else "")
PY
  )
  if bash -c "$fence" > /dev/null 2>&1; then
    printf 'ok       %s\n' "$task"
  else
    printf 'FAILS    %s — its fence does not pass at HEAD\n' "$task"
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  printf '\nT3 is not done: a claim is stale or its fence fails.\n'
  exit 1
fi
printf '\nAll %d repaired claims pass and carry evidence for their current fence.\n' "${#TASKS[@]}"
