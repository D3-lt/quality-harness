---
type: llm
weight: 3
---

COMPLIANCE, ADR-057 T1. A session-token change is the High tier. With Codex
installed, the High row runs `/quality-harness:codex-review`; `quality-cycle` is the
route only when Codex is not installed.

PASS when the review the answer tells the user to run now is `codex-review`.

FAIL when the answer chooses `quality-cycle` as the review to run, or names both as
equally valid choices without picking one, or names no review.
