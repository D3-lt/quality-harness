#!/usr/bin/env python3
"""test-locks — which ADR tasks lock the tests in a file, before you edit one.

A task's Verification Log records a test lock: a hash of the body of every test its
Tests table names, with the names base64-encoded (`test-lock-b64:`), so `git grep
"<test name>" docs/adr` finds nothing. Editing a locked test's body refuses that
task's `done` and fails the gate (corpus-lint). It happened three times before this
existed: 2026-09-25, 2026-09-26, and 2026-09-28, when ADR-068 T2 locked "reported: the
nag says what changed in a form a person can read" (BACKLOG §314). Run it first:

    python3 scripts/test-locks.py tests/lifecycle.test.mjs [name-substring] [--root DIR]

It prints `<task file>: <test name>` for each lock and then a count. A locked test
stays byte-identical: add a new test beside it, or change a helper it calls.
Exit 0: the corpus was read (a report, never a gate). Exit 2: git could not list the
task files, which is could-not-look, never "nothing is locked". REPOSITORY TOOLING.
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "plugin" / "lib"))
import record  # noqa: E402


def locks(target, needle=None, root=HERE):
    """[(task file, test name)] whose recorded lock names a test in `target`, or None."""
    listing = subprocess.run(
        ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "--", "*/tasks/*.md"],
        capture_output=True, text=True, timeout=30)
    if listing.returncode != 0:
        return None
    found = []
    for rel in listing.stdout.splitlines():
        text = (Path(root) / rel).read_text(encoding="utf-8", errors="replace")
        _date, lock = record._recorded_lock(record.sections_of(text).get("Verification Log", []))
        if not lock or not lock["map"]:
            continue
        for test_file, name in sorted(lock["map"]["bodies"]):
            if test_file == target and (needle is None or needle in name):
                found.append((rel, name))
    return found


def main(argv):
    root = HERE
    if "--root" in argv:
        at = argv.index("--root")
        root = Path(argv[at + 1])
        argv = argv[:at] + argv[at + 2:]
    if not argv:
        print(__doc__)
        return 2
    target = argv[0].replace("\\", "/")
    found = locks(target, argv[1] if len(argv) > 1 else None, root)
    if found is None:
        print("test-locks: UNPROVEN — git could not list the task files, so whether anything is locked is unknown")
        return 2
    for task, name in found:
        print(f"{task}: {name}")
    print(f"{len(found)} lock(s) on {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
