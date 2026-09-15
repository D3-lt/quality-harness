# ADR-054 Tasks

Implementation tasks for ADR-054: A Go raw string is not an escape. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |
| 4 | T4 | T3 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Go raw backtick is not a C-escape | done | F-1, F-5, UC1-S1, UC1-S2, UC5-S1, UC5-S2 | `node --test --test-name-pattern 'a Go raw string ending in backslash still hashes later tests' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'C-escaping Go backticks leaves later tests UNPROVEN; JS templates still escape' tests/leftovers-after-adr053.test.mjs` |
| T2 | `#expect` keep is Swift-only | done | F-2, UC2-S1, UC2-S2 | `node --test --test-name-pattern 'a PHP #expect comment is not a fail word' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs` |
| T3 | T1 wrappers keep arguments that still invoke git | pending | F-3, UC3-S1, UC3-S2 | `node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs` |
| T4 | Ship leftover stress with spec-oracle pools | pending | F-4, UC4-S1, UC4-S2 | `node --test --test-name-pattern 'unmutated leftover stress is green and leftover pools are generable' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern "a mutant that restores today's holes survives only if the suite is blind" tests/leftovers-after-adr053.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `go=True` raw backticks | T4 | T1 before T4 |
| T2 | Swift-only `#expect` keep | T4 | T2 before T4 |
| T3 | wrapper-arg `PUBLISH_SUFFIX` | T4 | T3 before T4 |

## Notes

- Bind tests live in `tests/leftovers-after-adr053.test.mjs`. Do not edit `tests/swift-expect.test.mjs` or `tests/test-lock.test.mjs`.
- Do not bump `TEST_HASH_REQUIRED_FROM`. Do not commit `tests/adr053-stress.mjs` as the 2026-09-14 draft.
- F-5 recovery remains `python3 plugin/bin/adr-verify --relock`.
