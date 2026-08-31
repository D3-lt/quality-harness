# ADR-017 Tasks

Implementation task for ADR-017: A permanent fact names its citation. See the parent ADR for the
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
| T1 | lint typed permanent bases | pending | — | `python3 tests/gate-regressions.py … && grep …` |

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

- The acceptance runs the Python regression harness directly and requires the new permanent-basis
  sentinel. Before the named CLI regression exists, the harness can pass but the fence remains red.
- The regression creates a temporary git corpus and invokes the working-tree `adr-lint`; helper-only
  assertions cannot satisfy the task.
- ADR-017 was accepted by the owner on 2026-08-31; execution may proceed.
