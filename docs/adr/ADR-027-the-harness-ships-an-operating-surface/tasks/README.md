# ADR-027 Tasks

Implementation tasks for ADR-027: Ship an operating surface, and make the countable half a command.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [the countable half is a command](T1-the-countable-half-is-a-command.md) | pending | — | `node --test tests/qh-doctor.test.mjs …` |
| T2 | [the judgment half is one skill](T2-the-judgment-half-is-one-skill.md) | pending | — | `node --test tests/qh-doctor.test.mjs tests/skill-contract.test.mjs …` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `node "$QH/scripts/qh-doctor.mjs"` | T2 | T1 before T2 — T2's skill names the command and its exit codes |

## Notes

- T2's Stop Condition is real, not a formality: if the countable half turns out to absorb everything,
  the skill is not needed and shipping an empty one would be the defect this record is about.
