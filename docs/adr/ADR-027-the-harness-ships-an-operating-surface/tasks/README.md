# ADR-027 Tasks

Implementation tasks for ADR-027: Ship an operating surface, and make the countable half a command.
See the parent ADR for the decision. Three readers, three artifacts: a machine asks T1, an agent
loads T2, a person opens T3. T2 and T3 are independent of each other and both wait only on T1.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [the countable half is a command](T1-the-countable-half-is-a-command.md) | done | — | `node --test tests/qh-doctor.test.mjs …` |
| T2 | [the judgment half is one skill](T2-the-judgment-half-is-one-skill.md) | done | — | `node --test tests/qh-doctor.test.mjs tests/skill-contract.test.mjs …` |
| T3 | [the door a reader opens first](T3-the-door-a-reader-opens-first.md) | done | — | `node --test tests/qh-doctor.test.mjs tests/package.test.mjs …` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `node "$QH/scripts/qh-doctor.mjs"` | T2, T3 | T1 before both — each names the command and its exit codes |

## Notes

- T2's Stop Condition is real, not a formality: if the countable half turns out to absorb everything,
  the skill is not needed and shipping an empty one would be the defect this record is about.
