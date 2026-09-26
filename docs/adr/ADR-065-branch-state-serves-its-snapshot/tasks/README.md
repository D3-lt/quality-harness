# ADR-065 Tasks

Implementation tasks for ADR-065: The branch-state reader serves its snapshot and refreshes behind the prompt. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers. This README is a derived index.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| Task | File | Status |
|------|------|--------|
| T1 | [T1-a-snapshot-is-keyed-by-branch-head-and-upstream.md](T1-a-snapshot-is-keyed-by-branch-head-and-upstream.md) | pending |
| T2 | [T2-a-due-brief-is-served-and-refreshed-behind-the-prompt.md](T2-a-due-brief-is-served-and-refreshed-behind-the-prompt.md) | pending |
