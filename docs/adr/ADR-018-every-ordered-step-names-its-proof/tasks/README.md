# ADR-018 Tasks

Implementation task for ADR-018: Every ordered step names its proof. See the parent ADR for the
decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | cross-check every step against explicit proof | done | — | `node tests/gates.test.mjs && python3 tests/gate-regressions.py …` |

Status: `pending` | `partial` | `blocked` | `done`.

- `pending` — not started, or started and carrying no evidence yet.
- `partial` — some work has landed and some has not; landed claims still owe their matching
  acceptance and mutation evidence.
- `blocked` — waiting on an external event named in the task's `Blocked-on` header.
- `done` — finished, with tool-written acceptance and killed-mutation evidence matching the current
  fence.

## Contract Coupling

None — one task.

## Notes

- This task authors itself in `Proof map: v1` form so the first real artifact exercises the new
  contract rather than asking later records to discover its ambiguities.
- Unmarked historical tasks stay non-blocking, but they never produce a clean proof-map claim:
  `adr-lint` names the skipped cross-check once per task.
- Catalogue-integrity checks run in the Acceptance fence, but the two behavioral mutants must be
  killed by the CLI regression, not by a stale catalogue anchor.
