# ADR-045 Tasks

Implementation tasks for ADR-045: One record grammar, loaded, not copied. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |


## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The record grammar is one module | pending | F-1, F-2, UC1-S1, UC1-S2, UC2-S1, UC2-S2, UC2-S3 | `node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs && node --test --test-name-pattern 'the record grammar is one module\|record.py: a fenced ## is not a heading\|a gate copied without plugin/lib says so and exits 2' tests/gates.test.mjs` |
| T2 | The two git listings are named for their rule | pending | F-3, UC3-S1, UC3-S2 | `node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs` |


Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- T1 and T2 are independent; the rename touches no grammar.
