# ADR-011 Tasks

Implementation tasks for ADR-011: A record's pointers resolve, or the gate says they do not. See the
parent ADR for the decision.

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
| T1 | resolve Governs, Cross-references and Invalidates in adr-lint | done | — | `python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md .` |
| T2 | make adr-state say a Governs path resolves to nothing | done | — | `node --test tests/lifecycle.test.mjs` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the pointer-resolution truth table in `tests/gate-regressions.py` | T2 | T1 before T2 — T2 mirrors the table T1 writes |

## Notes

- Both tasks add a `git ls-files` call to a tool that previously only read files. The "could not
  look" state is asserted on both sides rather than inferred.
