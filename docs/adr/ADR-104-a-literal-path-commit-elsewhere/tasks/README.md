# ADR-104 Tasks

Implementation tasks for ADR-104: a commit whose literal `-C` path names another repository is not this checkout's publish. See
the parent ADR for the decision.

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
| T1 | a literal-path commit into another repository is advised | done | none — no spec | `node --test tests/foreign-commit.test.mjs` (named tests pass, nothing skipped) |
| T2 | one commit with a user identity is one commit | done | none — no spec | `node --test tests/commit-identity.test.mjs` (named test passes, nothing skipped) |

## Contract Coupling

None
