# ADR-007 Tasks

Implementation tasks for ADR-007: Let a task depend on another record's task. See the parent ADR for
the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | a qualified id parses, resolves, and never binds locally | pending | — | `python3 tests/gate-regressions.py …` |
| T2 | an edge that cannot be evaluated is not ready | pending | — | `node --test tests/adr-next.test.mjs …` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

T1 produces the qualified-id parser and its corpus resolution; T2 consumes it to decide readiness.
T1 must land first, or T2's blocked state would be computed from ids nothing can resolve.

## Notes

- Reported from another team's corpus against 2.21.0. Both claims were re-verified against this
  repository's source before the record was drafted; the 44% figure is theirs and is attributed
  rather than restated as ours.
- A third defect was found while verifying, and it is the one that decides T1's shape: `TID_RE`
  matches `T4` inside `ADR-003-T4`, so a foreign id binds to a same-numbered LOCAL task rather than
  being dropped. A wrong edge is worse than a missing one, because the DAG then looks answered.
- The fences name the working-tree path, never the bare gate name — in this repository the bare name
  resolves to the last RELEASE, which would record evidence about a build the commit did not change.
