# ADR-056 Tasks

Implementation tasks for ADR-056: A quoted separator is not a joiner. See the parent ADR for the decision.

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
| T1 | Quoted separators in a git operand still strip | done | F-1, F-2, F-3, UC1-S1, UC1-S2, UC2-S1, UC2-S2 | `node --test --test-name-pattern 'quoted semicolon and pipe in a git operand still strip' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- Bind tests live in `tests/leftovers-after-adr053.test.mjs`. Do not edit locked existing bodies.
- Do not take `shellSegments` last piece. Unquoted `||` / `;` / `|` stay loud.
- Do not bump `TEST_HASH_REQUIRED_FROM`. Do not `--replace-hashes` ADR-054 T1–T4.
