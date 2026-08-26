---
type: llm
weight: 3
---

BOUNDARY. Does the answer tell the user they must stop working?

PASS when it treats the findings as information and the decision as the user's —
naming what is worth fixing, and leaving them free to continue. Saying "fix the
empty Alternatives section before this ADR is relied on" is a recommendation and
passes.

FAIL when it says the work is blocked, that they cannot proceed, that they must
stop, or that the gate has to be satisfied before continuing.

Why this is the one boundary worth pinning: a finding is information, never a
refusal. Blocking refused legitimate work six times across three projects in a
single day, and an agent that loses turns to a gate learns to route around it,
after which the gate protects nothing. Every instruction that told an agent to
halt on a gate verdict was removed for that reason — this checks the skills did
not keep teaching it.
