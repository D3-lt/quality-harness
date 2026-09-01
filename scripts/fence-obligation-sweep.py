#!/usr/bin/env python3
"""Count the gap between what an Acceptance fence rests on and what a mutant binds.

The Mutation Log obligation is EXISTENTIAL: `adr-lint` requires at least one
`mutant killed` row bound to the current fence digest before a task may be
`done`. Vacuity, however, is PER-MECHANISM — one killed mutant says nothing
about the other assertions the same fence chains together. This sweep counts
the first-order shape of that gap across the corpus.

WHAT THIS MEASURES, AND WHAT IT DOES NOT. It counts shell segments that look
like assertions and digest-bound `mutant killed` rows. Both are observable in
the file. It does NOT determine that a mechanism is unbound: a fence's segments
are not its mechanisms, several segments can rest on one mechanism, and one
segment can rest on several. That determination is exactly what ADR-022 says
cannot be derived from the file, which is why the record asks an author to
declare it. Read a number here as "worth looking at", never as a defect count.

Usage:  python3 scripts/fence-obligation-sweep.py [--json]
"""
import json
import re
import subprocess
import sys

FENCE = re.compile(r"^## Acceptance\s*\n+```(?:bash)?\n(.*?)\n```", re.S | re.M)
KILL = re.compile(r"^- .*·\s*mutant killed\s*·.*?acceptance-sha256:([0-9a-f]{64})", re.M)
VLOG = re.compile(r"^- .*·\s*exit 0\s*·.*?acceptance-sha256:([0-9a-f]{64})", re.M)

# Shell that sets the run up rather than asserting anything about it. `tee` is
# here because it is a pipe destination in this corpus's fences, never a check.
SETUP = re.compile(
    r"^(set\b|cd\b|export\b|mkdir\b|rm\b|trap\b|cat\s*>|tee\b|PATH=|[A-Z_]+=|#|\)|\}|fi\b|done\b)")


def tracked_task_files():
    out = subprocess.run(["git", "ls-files", "docs/adr/*/tasks/*.md"],
                         capture_output=True, text=True, check=True).stdout
    return [p for p in out.split() if not p.endswith("README.md")]


def assertion_segments(fence):
    """Segments of a fence that are not obviously setup.

    Split on `&&`, `||` and newlines — the three ways this corpus chains a
    fence. Deliberately crude: see the module docstring.
    """
    segments = [s.strip() for s in re.split(r"&&|\|\||\n", fence) if s.strip()]
    return [s for s in segments if not SETUP.match(s)]


def survey(paths):
    rows = []
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        match = FENCE.search(text)
        if not match:
            continue
        current = (VLOG.findall(text) or [None])[-1]
        kills = KILL.findall(text)
        rows.append({
            "task": path,
            "assertions": len(assertion_segments(match.group(1))),
            "killed_mutants": len(kills),
            "bound_to_current_fence": sum(1 for k in kills if current and k == current),
        })
    return rows


def main():
    rows = survey(tracked_task_files())
    if "--json" in sys.argv:
        print(json.dumps(rows, indent=2))
        return 0
    multi_one = [r for r in rows if r["assertions"] > 1 and r["bound_to_current_fence"] == 1]
    multi_none = [r for r in rows if r["assertions"] > 1 and r["bound_to_current_fence"] == 0]
    single = [r for r in rows if r["assertions"] <= 1]
    print(f"{'task':<64} {'asserts':>7} {'bound':>6}")
    for r in rows:
        print(f"{r['task'][9:73]:<64} {r['assertions']:>7} {r['bound_to_current_fence']:>6}")
    print()
    print(f"task files carrying an Acceptance fence           : {len(rows)}")
    print(f"  >1 assertion, exactly 1 digest-bound killed mutant: {len(multi_one)}")
    print(f"  >1 assertion, no digest-bound killed mutant       : {len(multi_none)}")
    print(f"  1 assertion                                       : {len(single)}")
    print()
    print("A count here is a place to look, not a defect. See the module docstring.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
