---
max_turns: 8
runs: 1
# Bash stays: this case is about whether the model REACHES for the corpus
# readers, and it should be able to run them. But the corpus is described below
# rather than left to be discovered, so a turn budget is not spent proving the
# sandbox is empty — the failure that made this case's 0.00 uninterpretable for
# two days (docs/BACKLOG.md finding C, §30).
allowed_tools: [Read, Glob, Grep, Skill, Bash]
# ADR-032. The skill this case exercises, declared rather than inferred:
# The case is named for it and the prompt asks for a proposed record.
tags: [skill-adr-write]
---

I want to write an ADR proposing we move our background jobs from Celery to RQ.
Start it.

For context, our `docs/adr/` has 23 records in it. I do not remember what any of
them say about the queue, and I am not going to read all 23.
