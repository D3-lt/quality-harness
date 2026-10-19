# ADR-114 Tasks

Implementation tasks for ADR-114: the core serves session state as MCP resources. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Task | Depends-on |
|------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | `qh mcp` serves the four resources | pending | none — no spec | `node --test tests/qh-mcp-resources.test.mjs` (each named test passes once, nothing skipped) |
