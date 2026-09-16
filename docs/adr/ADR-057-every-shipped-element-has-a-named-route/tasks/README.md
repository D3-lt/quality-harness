# ADR-057 Tasks

Implementation tasks for ADR-057: Every shipped element has a named route. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T4 | none |
| 2 | T1 | T4 |
| 3 | T2 | T1 |
| 4 | T3 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | One risk table, with Codex as a condition | pending | none — no spec | `node --test --test-reporter=tap --test-name-pattern … tests/routing.test.mjs` + `node --test tests/skill-metadata.test.mjs tests/skill-contract.test.mjs tests/package.test.mjs` |
| T2 | Class routes name the stage they route to | pending | none — no spec | `node --test --test-reporter=tap --test-name-pattern … tests/routing.test.mjs` + `node --test tests/skill-metadata.test.mjs tests/skill-contract.test.mjs` |
| T3 | Workflows spawn the shipped agents | pending | none — no spec | `node --test --test-reporter=tap --test-name-pattern … tests/workflows.test.mjs` + `node --test tests/workflows.test.mjs tests/reviewer-guard.test.mjs` |
| T4 | Every shipped element is named by a route | pending | none — no spec | `node --test --test-reporter=tap --test-name-pattern … tests/routing.test.mjs` + `node --test tests/routing.test.mjs tests/workflows.test.mjs tests/skill-metadata.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T4 | `tests/routing.test.mjs` (file exists) | T1, T2 | T4 before T1 |
| T1 | `quality-policy` risk table (single copy); `work/SKILL.md` §2 edit | T2 | T1 before T2 — both edit `work/SKILL.md` and `tests/routing.test.mjs` |

## Notes

- **T4 runs first and finishes last.** Its first `adr-verify` is red on today's tree (eight members unnamed). Its Acceptance can pass only after T1, T2 and T3 land; verify it again then. It is `pending` in between, not `done`.
- Every fence checks that each named test actually ran: `node --test-name-pattern` that selects nothing still exits 0 and reports the file as one passing test (measured 2026-09-16, node v24.11.1).
- Do not edit the phrases `tests/skill-metadata.test.mjs` pins in `work/SKILL.md` ("Classification is the decision", "invoke the routed skill in the same turn", "resume the routed chain", "brainstorm").
- A `/quality-harness:<x>` written into skill text must resolve to a skill or workflow (`tests/skill-contract.test.mjs`); write agent names as `quality-harness:qh-…`, without the slash.
- `adr-lint` advises that ADR-057's `Enforced-by:` names a test that does not exist. That is expected until T4 creates `tests/routing.test.mjs`; the header cannot carry the caveat, because `adr-lint` reads it as a list of pointers.
