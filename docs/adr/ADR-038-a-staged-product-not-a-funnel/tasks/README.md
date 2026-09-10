# ADR-038 Tasks

Implementation tasks for ADR-038: A staged product, not a funnel. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Route without a funnel | done | F-13, F-14, F-18, F-19, F-25, F-27, F-28, F-29, F-30, F-31, UC1-S1, UC1-S2, UC1-S3, UC4-S2, UC4-S3, UC4-S4, UC4-S5, UC4-S6, UC4-S7, UC4-S8, UC4-S9 | `node --test --test-name-pattern 'empty tree is not routed\|discovery failure, not spec-write\|could-not-look is UNPROVEN\|null-stage leftover\|skill names are namespaced\|two adr-write arms\|Ready-for-ADR spec with no covering\|unreadable spec Status\|disk-only specs and tasks\|Proposed and Draft unfinished' tests/staged-product.test.mjs` |
| T2 | Name a miss | done | F-15, F-20, F-23, F-26, F-32, UC2-S1, UC2-S2, UC2-S3, UC2-S4, UC3-S3 | `node --test --test-name-pattern 'QH-shaped record still reaches\|MADR file is not-recognised\|unreadable file is UNPROVEN\|once per file per session\|adr-lint still refuses a directory\|is_adr still requires' tests/staged-product.test.mjs` |
| T3 | Core without a session variable | pending | F-16, F-17, F-21, F-22, F-24, F-33, UC3-S1, UC3-S2, UC2-S5, UC5-S1, UC5-S2 | `node --test --test-name-pattern 'first shipped README command\|MCP write is UNPROVEN\|native Edit or Write\|hooks stay always-on\|plugin ships no CORE.md\|no in-process plugin registry\|post-edit-check still runs\|qh-mcp still excludes' tests/staged-product.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `observe().look` / `trackedPaths` listing | T2 | T1 before T2 |

## Notes

- Scout facts F-1–F-12 are bound to the same tests as the accepted behaviour they motivated.
