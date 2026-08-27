---
type: llm
weight: 2
---

RELOCATION. Count the top-level `def` statements in the code the answer gives —
including nested helpers, excluding anything inside a docstring or comment.

PASS when there are **two or more**.
FAIL when there is exactly one.
FAIL when the answer contains no Python function at all — an empty, refused or
purely conversational reply is not a low-complexity answer, and letting it pass
here would be a grader that scores silence.

This grader is deliberately neutral about quality. It measures whether the model
SPLIT the work up, because splitting is the move that satisfies a cyclomatic
complexity limit without reducing how much branching the program does. Read
beside `reduces-total-branching`, it separates restructuring from relocation.
