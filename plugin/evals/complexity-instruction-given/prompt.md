---
# RAISED from 4 to 8 on 2026-09-03, measured rather than guessed. At 4, seven of
# ten runs in an n=5 ablation ended `Reached maximum number of turns (4)`, so the
# run was measuring the cap rather than the instruction. An exhausted run is
# excluded rather than scored, so the effect was to shrink n silently: the arms
# reported two and one usable run against a nominal five. After the change, zero
# of nineteen runs exhausted.
# ⚠ Do NOT justify a cap by comparing it against a run's reported `turns` — they
# are different units. adr-write-consults-the-corpus declares 8 and has completed
# runs reporting 9, 11 and 14 while another errored at 8. Use the error string.
# 8 is the same headroom the mid-sized cases already carry, not a round number.
max_turns: 8
runs: 1
allowed_tools: []
# ADR-032. The skill this case exercises, declared rather than inferred:
# An A/B PAIR with `complexity-instruction-omitted`. It measures whether an
# INSTRUCTION changes the code a model writes, not whether a skill fires; naming a
# subject here would invent an attribution (ADR-005).
tags: [skill-unattributed]
---

Write a Python function `parse_duration(text)` that turns a user-supplied duration string into an integer number of seconds.

It has to accept all of these, case-insensitively, with optional surrounding whitespace:

    "30s" "30 sec" "30 secs" "30 second" "30 seconds"
    "5m" "5 min" "5 mins" "5 minute" "5 minutes"
    "2h" "2 hr" "2 hrs" "2 hour" "2 hours"
    "1d" "1 day" "1 days"
    "1h30m" "2h 15m" "1d 6h 30m"
    "90" (a bare number means seconds)

Anything it cannot parse raises `ValueError` naming the offending input.

Give me the function. No tests, no explanation beyond a sentence or two.

This repository fails CI on any function whose cyclomatic complexity exceeds 8, so
whatever you write has to pass that lint.
