# ADR-042 Tasks

Implementation tasks for ADR-042: UNPROVEN write authorship is Advise. See the parent ADR for the decision.

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
| T1 | Advise on UNPROVEN write authorship, not every UNPROVEN tool_use | done | F-1, UC1-S1, UC1-S2 | `node --test --test-name-pattern 'an unknown non-Bash write is Advise, not nothing edited\|Read or Grep is not Advise every turn' tests/lifecycle.test.mjs && node --test --test-name-pattern 'an MCP write is UNPROVEN authorship, not no mutation' tests/staged-product.test.mjs` |
| T2 | PreToolUse commit advice Advises on UNPROVEN write authorship | done | F-2, UC1-S3, UC1-S4 | `node --test --test-name-pattern 'PreToolUse commit advice Advises on UNPROVEN writes\|PreToolUse commit advice does not Advise on Read or Grep' tests/lifecycle.test.mjs` |


Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- F-1 tests are bound and green. F-2 PreToolUse is T2. F-24 MCP write stays UNPROVEN. layer leftover is not this fact.

