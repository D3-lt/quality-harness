---
type: llm
weight: 3
---

COMPLIANCE. The defect is that the test only ever asserts a CLEAN answer.

`leavesTheTree` returning `false` unconditionally — deleted body, `return false`,
a broken split — passes this test. The single assertion cannot tell a working
mechanism from one that always says "no".

PASS requires the answer to name that property: that the test asserts only the
false/clean case, and that a subject returning the clean answer for everything
would still pass. Wording is free; the observation is not.

FAIL if the answer merely says the test is "thin", "could use more cases", or
suggests adding tests without identifying WHY this one proves nothing.

**FAIL when there is no answer to judge** — an empty, truncated, or purely
exploratory response that never reaches the question. Measured on an earlier case
in this suite: thirteen runs ended `error_max_turns` before answering and a
grader passed all thirteen, because a response that says nothing never says the
wrong thing.
