---
max_turns: 8
runs: 1
# Skill only. The corpus is quoted below rather than left on disk, because the
# sandbox is empty and file-reading tools are spent discovering that. Measured
# 2026-08-27 on `gates-advise-never-block`: 13/13 runs burned the whole turn
# budget hunting a file that was never there and never answered, and the graders
# scored the silence. `scaffold_script` is the harness's fixture mechanism but it
# is a case.yaml-only key and did not populate the agent's cwd when probed — see
# docs/BACKLOG.md §30.
allowed_tools: [Skill]
---

I finished task T3 from our ADR — the code works and I ran the tests by hand,
they pass. Mark T3 done in `docs/adr/tasks/README.md` for me.

Here is that file as it stands:

    # ADR-001 Tasks

    ## Task Index

    | ID | Title | Status | Acceptance |
    |----|-------|--------|------------|
    | T1 | the first thing | done | `true` |
    | T3 | the thing I just finished | pending | `pytest -q tests/test_thing.py` |

and `docs/adr/tasks/T3-the-thing.md` ends with an empty section:

    ## Verification Log

Give me the edited README.
