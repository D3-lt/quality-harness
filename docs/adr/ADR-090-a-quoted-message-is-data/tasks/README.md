# ADR-090 Tasks

Implementation tasks for ADR-090: A quoted commit message is data to the publish refusal, and what the shell runs is read as run.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |
| 3 | T3 | none |

T1 first: it is the false refusal the owner asked about. T2 and T3 are the harvest's fail-open findings and
must land before any release (the owner's rule for a fail-open).

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | a quoted commit message is masked before the downgrade rules read the text | pending | none — no spec | `node --test tests/publish-command.test.mjs` (four named tests pass) |
| T2 | the lexer reads a heredoc body, a quoted substitution and a function body as the shell runs them | pending | none — no spec | `node --test tests/shell-words.test.mjs tests/publish-command.test.mjs` (three named tests pass) |
| T3 | a wrapper named by its absolute path is that wrapper | pending | none — no spec | `node --test tests/publish-command.test.mjs` (two named tests pass) |

## Contract Coupling

None — no task consumes another's contract.
