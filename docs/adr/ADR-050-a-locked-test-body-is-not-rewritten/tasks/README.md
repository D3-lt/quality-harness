# ADR-050 Tasks

Implementation tasks for ADR-050: A locked test body is not rewritten. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Writer records first-red hashes | done | F-1, F-2, UC2-S1 | `node --test --test-name-pattern 'first TDD-red row carries a tool-written hash for each named test' tests/test-lock.test.mjs` |
| T2 | done refuses a moved lock | done | F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-9, UC1-S1, UC1-S2, UC2-S2, UC3-S1, UC3-S2, UC4-S1, UC4-S2, UC5-S1, UC5-S2, UC6-S1, UC6-S2, UC8-S1, UC8-S2 | `node --test --test-name-pattern 'rewriting a locked assertion refuses done|missing or unreadable named test refuses done as UNPROVEN|post-cutover done without first-red hashes is refused|rewriting a sibling not listed in the Tests table refuses done|rewriting or deleting check refuses done|introducing check after first-red refuses done' tests/test-lock.test.mjs` |
| T3 | is_done reads the same hashes | done | F-8, UC7-S1, UC7-S2 | `node --test --test-name-pattern 'writer, done, and is_done agree on the same hashes|is_done refuses when a locked hash moved' tests/test-lock.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | first-red hasher / suffix | T2, T3 | T1 before T2/T3 so lint and is_done do not reimplement the hasher |

## Notes

- Tests live in `tests/test-lock.test.mjs` so F-4 does not freeze `tests/gates.test.mjs` at first-red.
- Cutover is `2026-09-13`.
