# ADR-043 Tasks

Implementation tasks for ADR-043: Name Core and Corpus from the STAGES catalog. See the parent ADR for the decision.

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
| T1 | Name `--json` layer from the STAGES table | done | F-1, UC1-S1, UC1-S2, UC1-S3, UC1-S4 | `node --test --test-name-pattern 'layer from STAGES:' tests/staged-product.test.mjs && node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs` |


Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- F-1 is `--json` only. Statusline layer token is a leftover, not this task. QH does not set the bar.
