# ADR-037 Tasks

Implementation tasks for ADR-037: advice earns its place by being acted on, and an advisory nobody
acts on is removed rather than rationed. See the parent ADR for the decision.

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
| T1 | An advisory's survival across runs is measured, and nowhere to look is not zero | pending | — | `node --test --test-name-pattern 'focused false-green regressions remain closed' tests/gates.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

⚠ **T2 IS NOT WRITTEN YET, AND MUST NOT BE.** ADR-037's Decision says *"no rule ships before it
exists"* — the number T2 acts on. T1 produces that number; authoring T2 before reading it would be
the rationing this record was written to refuse. The row above is deliberately the only one.

## Contract Coupling

T1 produces the advisory-survival note and the `--advice-survival` report. T2 consumes the numbers
they yield and decides, per advisory, between a suggested edit and deletion.
