# ADR-016 Tasks

Implementation tasks for ADR-016: A mutant earns its verdict. See the parent ADR for the decision.

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
| T1 | a clean fence earns the right to mutate | pending | — | `node --test … tests/evidence-chain.test.mjs` |
| T2 | generated outputs join the restore transaction | pending | — | `node --test … tests/evidence-chain.test.mjs tests/package.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

- `pending` — not started, or started and carrying no evidence yet.
- `partial` — some work has landed and some has not; landed claims still owe their matching
  acceptance and mutation evidence.
- `blocked` — waiting on an external event named in the task's `Blocked-on` header.
- `done` — finished, with tool-written acceptance and killed-mutation evidence matching the current
  fence.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | clean-before-mutate baseline and `UNPROVEN` no-write outcome | T2 | the generated-source fixture must first qualify its clean fence |

## Notes

- Both tasks enter through the real `adr-verify` CLI. A helper-only test cannot prove parser,
  journal, subprocess, restore, and log-writing wiring.
- Catalogue-integrity checks run outside the mutation Acceptance fences. A broken JSON anchor is
  not allowed to earn a behavioral kill.
- ADR-016 was accepted by the owner on 2026-08-31; execution may proceed in dependency order.
