---
# ADR-057. Self-contained and Skill only; see high-risk-without-codex-routes-to-quality-cycle.
max_turns: 8
runs: 1
allowed_tools: [Skill]
# Section 0's operating step this case exercises lives in work (ADR-057 T2).
tags: [skill-work]
---

Right after `claude plugin update`, `adr-lint` started reporting FAIL on three ADRs
that passed yesterday. Nobody edited those records.

I am about to start a change. Start by loading the `quality-harness:work` skill, then
use it to answer: before anything else, which skill should I load about this? Name
the exact skill and say why in two sentences. Do not run it.
