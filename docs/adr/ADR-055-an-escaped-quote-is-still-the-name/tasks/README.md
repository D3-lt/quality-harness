# ADR-055 Tasks

Implementation tasks for ADR-055: An escaped quote is still the name. See the parent ADR for the decision.

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
| T1 | Escaped same-quote BDD names are discovered and extracted | done | F-1, F-2, F-3, F-4, UC1-S1, UC1-S2, UC2-S1, UC2-S2, UC3-S1, UC3-S2 | `node --test --test-name-pattern 'escaped same-quote BDD names are discovered and extracted' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'interpolated BDD names stay undiscoverable' tests/leftovers-after-adr053.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- Bind tests live in `tests/leftovers-after-adr053.test.mjs`. Do not edit locked existing bodies. Do not edit `tests/test-lock.test.mjs` or `tests/swift-expect.test.mjs`.
- Do not bump `TEST_HASH_REQUIRED_FROM`. Hasher-visible unproven is `python3 plugin/bin/adr-verify --relock`.
- Do not `--replace-hashes` ADR-054 T1–T4.
