# ADR-141 Tasks

Implementation tasks for ADR-141: The corpus gate admits what the reader's listing finds.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | One listing predicate gates PreToolUse in both runtimes | pending | none — no spec | `node --test tests/nested-corpus.test.mjs` |
| T2 | SessionStart speaks for a nested corpus | pending | none — no spec | `node --test tests/nested-corpus.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `hasDecisionCorpus` admitting a nested corpus | T2 | T1 before T2 |
