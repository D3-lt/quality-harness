# ADR-049 Tasks

Implementation tasks for ADR-049: An unreadable file is could-not-run. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Named-path OSError is could-not-run | pending | F-1, UC1-S1, UC1-S2, UC2-S1, UC2-S2 | `node --test --test-name-pattern 'an unreadable named path is could-not-run, not failures-found\|postmortem-verify on chmod 000 is could-not-run\|missing file, directory, and not-recognised stay their current exits' tests/gates.test.mjs` |
| T2 | Dispatcher UNPROVEN at mapped could-not-run, not not satisfied | pending | F-2, UC3-S1, UC3-S2 | `node --test --test-name-pattern 'chmod-000 ADR-\\*\\.md is UNPROVEN through the dispatcher\|postmortem-verify on a path it cannot read' tests/gates.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | mapped could-not-run codes (2/4/1) | T2 | T1 before T2 so mapped 2/4 is what the dispatcher relays |

## Notes

- T1's dirty case is ADR-named `check_adr` (wrap only `main()` still crashes).
- T2's dirty case is chmod-000 ADR-*.md still "not satisfied" at traceback-1. A green nolib / unreadable-postmortem test is not this fact.
