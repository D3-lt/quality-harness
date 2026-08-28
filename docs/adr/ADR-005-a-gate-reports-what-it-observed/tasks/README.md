# ADR-005 Tasks

Implementation task for ADR-005: A gate reports what it observed. See the parent ADR for the
decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | could-not-run is its own verdict, code and word | done | — | `node --test tests/gate-rules.test.mjs …` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

None — one task.

## Notes

- The red test reproduces the reported line verbatim — `RED F-1: test failing — no stack detected
  and no Cmd override`, exit 3 — so the fixture fails for the reported reason and not a nearby one.
- The fixture root carries no project marker of any kind, which is the condition itself. It needed
  no construction: `tests/fixtures/ok` has never had one, and the existing `--implemented` test
  passes only because every row it writes carries a `Cmd` override.
