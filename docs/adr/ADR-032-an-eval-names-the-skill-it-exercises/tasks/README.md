# ADR-032 Tasks

Implementation tasks for ADR-032: Make an eval name the skill it exercises. See the parent ADR for
the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [a case declares its subject](T1-a-case-declares-its-subject.md) | done | — | `node --test tests/evals.test.mjs …` |

## Contract Coupling

None — one task.

## Notes

- Five of the eight cases declare `skill-unattributed`, and that is the intended answer for them, not
  a backlog. Four are A/B arms measuring an INSTRUCTION rather than a skill, and one tests a
  plugin-wide doctrine. The record's pre-registered failure is what catches the tag being abused.
- The coverage this produced, measured 2026-09-04: 3 skills exercised, 11 uncovered, 5 unattributed
  cases. `work` — the router — is among the uncovered, which is the finding BACKLOG §105 was
  reaching for and mis-counted.
