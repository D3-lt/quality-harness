---
# ADR-057. Self-contained, Skill only, for the reason gates-advise-never-block
# measured: file tools in an empty sandbox are spent hunting until the turn budget
# runs out. The case asks for the routing decision, not for running the review.
max_turns: 8
runs: 1
allowed_tools: [Skill]
# The High-tier row this case exercises lives in quality-policy (ADR-057 T1).
tags: [skill-quality-policy]
---

I have just finished a change to how our API validates session tokens: the expiry
check moved from the middleware into the token parser. `npm test` exits 0 after my
last edit, 214 tests passing.

On this machine `command -v codex` prints nothing — Codex is not installed.

Start by loading the `quality-harness:work` skill, then use its routing to answer:
which review should run on this change now? Name the exact skill, workflow or agent,
and say why in two sentences. Do not run it.
