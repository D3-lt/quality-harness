# ADR-113 Tasks

Implementation tasks for ADR-113: the Go core takes the hooks' rules, and the gaps between paths are enumerated. See the
parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Task | Depends-on |
|------|------|------------|
| 1 | T2, T4, T5, T6 | none |
| 2 | T1, T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The Go core says everything ADR-111 added | pending | none — no spec | `QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs` (each named test passes once, nothing skipped) |
| T2 | A broken config and an mrw write are seen by both refusals | pending | none — no spec | `node --test tests/refusals-hold.test.mjs` (each named test passes once, nothing skipped) |
| T3 | The side doors are enumerated by a gate | pending | none — no spec | `node --test tests/side-door-sweep.test.mjs` (each named test passes once, nothing skipped) |
| T4 | A sign-off is bound to what was signed | pending | none — no spec | `node --test tests/sign-off-binding.test.mjs` (each named test passes once, nothing skipped) |
| T5 | Every test file is accounted for | pending | none — no spec | `node --test tests/suite-accounting.test.mjs` (each named test passes once, nothing skipped) |
| T6 | Session state as MCP resources is proposed | pending | none — no spec | human-observed: ADR-114 exists, Proposed, and lints |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T2 | the config-problem origin; mrw's MCP write as a write | T1, T3 | T2 before T1 and T3 |
