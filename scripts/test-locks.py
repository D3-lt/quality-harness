#!/usr/bin/env python3
"""test-locks — which ADR tasks lock the tests in a file, before you edit one.

A task's Verification Log records a test lock: a hash of the body of every test its
Tests table names, with the names base64-encoded (`test-lock-b64:`), so `git grep
"<test name>" docs/adr` finds nothing. Editing a locked test's body refuses that
task's `done` and fails the gate (corpus-lint). It happened three times before this
existed: 2026-09-25, 2026-09-26, and 2026-09-28, when ADR-068 T2 locked "reported: the
nag says what changed in a form a person can read" (BACKLOG §314). Run it first:

    python3 scripts/test-locks.py tests/lifecycle.test.mjs [name-substring] [--files] [--root DIR]

It prints each locked test once with the tasks that lock it, by record and task id
(`<test name> ← ADR-060 T1, T2; ADR-105 T1`), and then a count; `--files` prints the
old form, one `<task file>: <test name>` line per lock. A locked test stays
byte-identical: add a new test beside it, or change a helper it calls.
Exit 0: the corpus was read (a report, never a gate). Exit 2: git could not list the
task files, which is could-not-look, never "nothing is locked". REPOSITORY TOOLING.
"""
import re
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



def task_label(rel):
    """`ADR-060`, `T1` for a task file under docs/adr, else the path and no id."""
    match = re.search(r"(ADR-\d+)[^/]*/tasks/(T\d+)-", rel)
    return (match.group(1), match.group(2)) if match else (rel, "")


def grouped(found):
    """One line per locked test, naming its tasks by record (the owner, 2026-10-27: 288 lines for one file)."""
    by_test = {}
    for task, name in found:
        by_test.setdefault(name, []).append(task_label(task))
    lines = []
    for name, labels in by_test.items():
        records = {}
        for adr, tid in labels:
            records.setdefault(adr, []).append(tid)
        named = "; ".join(f"{adr} {', '.join(sorted(filter(None, tids), key=lambda t: int(t[1:])))}".rstrip()
                          for adr, tids in records.items())
        lines.append(f"{name} ← {named}")
    return lines

def main(argv):
    root = HERE
    if "--root" in argv:
        at = argv.index("--root")
        root = Path(argv[at + 1])
        argv = argv[:at] + argv[at + 2:]
    files = "--files" in argv
    argv = [arg for arg in argv if arg != "--files"]
    if not argv:
        print(__doc__)
        return 2
    target = argv[0].replace("\\", "/")
    found = locks(target, argv[1] if len(argv) > 1 else None, root)
    if found is None:
        print("test-locks: UNPROVEN — git could not list the task files, so whether anything is locked is unknown")
        return 2
    for line in ([f"{task}: {name}" for task, name in found] if files else grouped(found)):
        print(line)
    print(f"{len(found)} lock(s) on {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
