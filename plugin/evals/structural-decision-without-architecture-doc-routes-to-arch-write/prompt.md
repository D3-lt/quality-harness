---
# ADR-057. Self-contained and Skill only; see high-risk-without-codex-routes-to-quality-cycle.
max_turns: 8
runs: 1
allowed_tools: [Skill]
# Class D's route this case exercises lives in work (ADR-057 T2).
tags: [skill-work]
---

We have decided to split billing out of the orders module: billing gets its own
module, its own tables and its own API, and orders will call it instead of writing
invoices itself. The decision is made; nobody is asking whether to do it.

The repository has no `docs/architecture.md` and no other architecture document.

Start by loading the `quality-harness:work` skill, then use its routing to answer:
what is the FIRST stage to run for this? Name the exact skill, and say why in two
sentences. Do not run it.
