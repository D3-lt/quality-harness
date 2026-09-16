---
# ADR-057. Self-contained and Skill only; see high-risk-without-codex-routes-to-quality-cycle.
max_turns: 8
runs: 1
allowed_tools: [Skill]
# The Moderate row this case exercises lives in quality-policy (ADR-057 T1). Framed as
# the coordinator finishing an implementation, not as a user asking for a review:
# measured 2026-09-16, "which review should this change get?" is classified as class F
# and routed straight to `review`, which is what class F says.
tags: [skill-quality-policy]
---

You are the `/quality-harness:work` coordinator. The goal was a bounded change (class
E): make our pagination helper's page cursors opaque base64 strings instead of raw
offsets. I have implemented it; three list endpoints call that helper, and their
tests were updated in the same change. Nothing touches auth, money, migrations or a
public contract outside this service. `npm test` exits 0 after my last edit.

Start by loading the `quality-harness:work` skill. Before reporting completion, what
quality path does its risk routing require for this change? Name the exact skill,
workflow or agent, and say why in two sentences. Do not run it.
