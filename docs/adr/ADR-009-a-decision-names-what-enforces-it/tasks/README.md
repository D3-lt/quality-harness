# ADR-009 Tasks

Implementation tasks for ADR-009: A record names the check that fails when its decision is violated.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | parse Enforced-by and advise when it names nothing | done | — | `python3 tests/gate-regressions.py …` |
| T2 | report it where an agent is about to edit the file | done | — | `node --test tests/lifecycle.test.mjs …` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

T1 produces the parsed and resolved value; T2 reports it. A record without the header behaves
identically before and after both.

## Notes

- The fences name the working-tree path (`python3 bin/adr-lint`), never the bare gate name. In this
  repository the bare name resolves to the last RELEASE — it produced a false PASS three times on
  2026-08-28, once nearly into a recorded Verification Log.
- The strongest form of the pointer is a catalogue mutation label, because `mutate.mjs` grades it RED
  or GREEN on every campaign. A test id only proves existence. T1 reports which form it resolved, so
  the record's reader can tell an asserted claim from a measured one.
