# ADR-047 Tasks

Implementation tasks for ADR-047: An unrecognised command is UNPROVEN. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |
| 4 | T4 | T1, T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Four-way classify; unrecognised is not neither | done | F-1, UC1-S1, UC1-S2 | `node --test --test-name-pattern 'recognised POSIX rm is mutation and selftest is validation\|an unrecognised PowerShell or cmd write is not neither' tests/classify.test.mjs` |
| T2 | Family is the executable, not a denylist substring | done | F-3, UC3-S1, UC3-S2 | `node --test --test-name-pattern 'POSIX rm as the executable stays mutation\|pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation' tests/classify.test.mjs` |
| T3 | Unrecognised Bash advances lastUnprovenWrite | done | F-2, UC2-S1, UC2-S2 | `node --test --test-name-pattern 'unrecognised Bash is Advise the same way an MCP write is\|echo is not Advise, and a classify-only green is not this fact' tests/lifecycle.test.mjs` |
| T4 | The reviewer denies unrecognised | done | F-4, UC4-S1, UC4-S2 | `node --test --test-name-pattern 'a reviewer is denied Remove-Item and pwsh -Command rm\|echo and selftest are not denied as unrecognised' tests/reviewer-guard.test.mjs tests/lifecycle.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `classifyCommand` four-way result | T2, T3, T4 | T1 before the rest |
| T2 | family-first classify | T4 | T2 before T4 so `pwsh -Command rm` is unrecognised and still denied |

## Notes

- F-1 family check must already run before the mutation boolean or T1 is the F-3 defect.
- T3 is the Session map; a classify-only green is not F-2.
- T4 is CLI (`reviewer-guard.mjs`) and plugin-level PreToolUse hook.
