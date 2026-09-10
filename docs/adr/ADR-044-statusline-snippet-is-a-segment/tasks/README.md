# ADR-044 Tasks

Implementation tasks for ADR-044: Compose the statusline segment; do not replace statusLine. See the parent ADR for the decision.

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
| T1 | Ship a compose recipe, not a replacement command | done | F-1, UC1-S1, UC1-S2, UC1-S3, UC1-S4 | `node --test --test-name-pattern 'statusline segment:' tests/statusline.test.mjs && node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs` |


Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- Outermost check is the shipped docs/header strings, not a screenshot. Layer on the bar is not this task.
