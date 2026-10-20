# ADR-118 Tasks

Implementation tasks for ADR-118: main lands only a sha CI has already passed. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Task | Depends-on |
|------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Everything lands through land/<sha> once the forge's required checks pass | done | none — no spec | `node --test tests/land.test.mjs tests/release.test.mjs` |
| T2 | The ruleset is applied, a scripted unchecked push is refused, and a landing goes through | pending | none — no spec | `node --test tests/land.test.mjs && node scripts/land.mjs --dry-run` |
