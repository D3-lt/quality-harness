---
# ADR-057. The Codex-installed arm of the High row. Self-contained and Skill only;
# see high-risk-without-codex-routes-to-quality-cycle. Enters through `work`, because
# the routing under test lives in skill bodies, which a session answering from the
# skill listing never reads (measured 2026-09-16: four of four sessions loaded no skill).
max_turns: 8
runs: 1
allowed_tools: [Skill]
tags: [skill-quality-policy]
---

I have just finished a change to how our API validates session tokens: the expiry
check moved from the middleware into the token parser. `npm test` exits 0 after my
last edit, 214 tests passing.

On this machine `command -v codex` prints `/opt/homebrew/bin/codex` — Codex is installed.

Start by loading the `quality-harness:work` skill, then use its routing to answer:
which review should run on this change now? Name the exact skill, workflow or agent,
and say why in two sentences. Do not run it.
