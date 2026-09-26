# ADR-066 Tasks

Implementation tasks for ADR-066: Git itself refuses an unchecked publish, and the shell classifier stops refusing where it does. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers. This README is a derived index.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| Task | File | Status |
|------|------|--------|
| T1 | [T1-one-verdict-and-a-git-hook-that-applies-it.md](T1-one-verdict-and-a-git-hook-that-applies-it.md) | done |
| T2 | [T2-sessionstart-offers-the-hook-through-the-env-file.md](T2-sessionstart-offers-the-hook-through-the-env-file.md) | done |
| T3 | [T3-rule-p-leaves-a-plain-invocation-to-git.md](T3-rule-p-leaves-a-plain-invocation-to-git.md) | done |
