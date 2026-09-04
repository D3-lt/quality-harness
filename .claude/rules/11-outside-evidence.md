---
paths:
  - "docs/research/**"
  - "docs/adr/**"
---

# Why §11: where the outside evidence is

`docs/research/2026-08-28-verification-is-the-bottleneck.md` holds what the labs and the literature
currently say about verification, silent failure, mutation, trajectory evaluation and measurement,
with the figures and the sources — they live there and are not restated in the instruction files.
Read it before arguing that one of the rules is overkill: most have an external citation, several a
measured effect size.

The findings that matter most: false success is the dominant agent failure mode among
self-assessing coding agents; LLM judges cannot detect it — they grade the tone of the report —
while cheap deterministic detectors do far better; and a meaningful share of "solved" patches on the
SWE-bench leaderboard are semantically wrong, passing only because the test suite was too weak. That
last one is why the mutation campaign is worth its runtime.

It also names where this project is behind the field, and the one place its instruct-never-block
rule is in genuine tension with a measured result. Both are things to raise before somebody else
does.
