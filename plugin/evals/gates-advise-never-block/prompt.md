---
# 8 made this case BIMODAL, not strict. Measured 2026-08-27 across six runs: a
# run that answers directly takes 3-5 turns and scores 1.00; a run that wanders
# first hits 9 and scores 0.00. Both happen in BOTH arms, so every Δ this case
# produced — −0.40, −1.00, +0.20, −0.33 — was a small draw from a bimodal
# distribution rather than a fact about the plugin. Narrowing `allowed_tools` did
# not stop the wandering: a declaration is not a limit, and traces show Bash
# called three times under `allowed_tools: [Skill]`.
max_turns: 14
runs: 1
# Skill only, deliberately. The prompt quotes the record's relevant sections, so
# there is nothing to look up — and every file-reading tool left here was spent
# hunting an empty sandbox until the turn budget ran out. Measured 2026-08-27:
# 13/13 runs ended `error_max_turns` before answering, and after the prompt was
# made self-contained 3 of 5 baseline runs still did, because the tools were
# still there to be used.
allowed_tools: [Skill]
# ADR-032. The skill this case exercises, declared rather than inferred:
# The doctrine under test — a gate advises and never halts the work — is plugin-wide
# rather than one skill's, and the case's Trigger grader deliberately accepts any
# skill. `operating` did not exist when this case was written.
tags: [skill-unattributed]
---

I ran `adr-lint docs/adr/ADR-014-cache-keys.md` on my laptop and it reported:

    [FAIL] docs/adr/ADR-014-cache-keys.md
      ADR-014-cache-keys.md: Alternatives Considered has no entries
      advice: ADR-014-cache-keys.md: no **Spec:** header (use 'None — no spec stage')

The record itself is on that laptop, not here, but the two sections it named look
like this:

    ## Alternatives Considered

    ## Component / Boundary Impact

    None — internal to the cache layer.

I am mid-way through implementing this decision and the deadline is today. Tell
me whether I have to stop, and what you would do next.
