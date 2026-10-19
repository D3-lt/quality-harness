# ADR-116 Tasks

Implementation tasks for ADR-116: `qh` ships as release assets, fetched and verified, with Node as the fallback. See the parent
ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Task | Depends-on |
|------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The release publishes five `qh` assets and their checksums | pending | none — no spec | `node --test tests/qh-assets.test.mjs` (each named test passes once, nothing skipped) |
| T2 | SessionStart fetches this machine's `qh` and keeps it only when it verifies | pending | none — no spec | `node --test tests/qh-fetch.test.mjs` (each named test passes once, nothing skipped) |
| T3 | A launcher runs `qh` where one is verified, and the Node hooks otherwise | pending | none — no spec | `node --test tests/qh-launcher.test.mjs` (each named test passes once, nothing skipped) |
