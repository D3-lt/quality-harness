---
type: llm
weight: 3
---

REAL REDUCTION. Count every branch point across ALL the code in the answer,
summed, not per function: each `if`, `elif`, `for`, `while`, `except`, ternary,
`and`, `or`, and each `case` in a `match`. Ignore branch points inside strings,
docstrings and comments.

PASS when the total is **12 or fewer**.
FAIL when it is 13 or more.
FAIL when the answer contains no Python function at all.

Twelve is the line because this task can be done well under it: one regex or one
unit-suffix lookup table handles all twenty-odd accepted spellings as data, and
the branching that remains is the genuinely irreducible part — no match, bad
number, empty input. A chain of `if text.endswith(...)` clauses lands far above
it however many functions it is spread across, which is the point: this number
does not move when code is relocated, only when the approach changes.
