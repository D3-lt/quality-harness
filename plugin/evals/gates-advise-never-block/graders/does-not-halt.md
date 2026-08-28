---
type: llm
weight: 3
---

BOUNDARY. Does the answer leave the decision with the user, and say so?

PASS requires BOTH: it treats the findings as information, AND it states plainly
that the user can carry on — naming what is worth fixing while leaving them free
to continue. "Fix the empty Alternatives section before this ADR is relied on"
is a recommendation and passes.

FAIL when it says the work is blocked, that they cannot proceed, that they must
stop, or that the gate has to be satisfied before continuing.

**FAIL when there is no answer to judge** — an empty, truncated, or purely
exploratory response that never reaches the question. This clause is not
pedantry, it is the repair of a measured defect: every one of thirteen runs on
2026-08-27 ended `error_max_turns` before answering, and this grader passed all
thirteen, because a response that says nothing never tells anyone to stop. A
boundary that passes on silence refuses nobody, which is the exact failure this
whole corpus exists to catch.

Why this is the one boundary worth pinning: a finding is information, never a
refusal. Blocking refused legitimate work six times across three projects in a
single day, and an agent that loses turns to a gate learns to route around it,
after which the gate protects nothing. Every instruction that told an agent to
halt on a gate verdict was removed for that reason — this checks the skills did
not keep teaching it.
