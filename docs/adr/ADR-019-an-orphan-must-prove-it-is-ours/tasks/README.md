# ADR-019 Tasks

Implementation tasks for ADR-019: Make an orphan prove it is ours, and never act on it. See the
parent ADR for the decision.

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
| T1 | Identify a home file by what proves it is ours, never by what is missing | done | — | `node --test tests/standalone-link.test.mjs` |
| T2 | Scan the directories a past installer may have written, and cost the walk | done | — | `node --test tests/standalone-link.test.mjs` |
| T3 | Say what was found, and make sure nothing acts on it | pending | — | `node --test tests/lifecycle.test.mjs tests/standalone-link.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

- `pending` — not started, or started and carrying no evidence yet.
- `partial` — genuinely part-done, with obligations: its landed evidence is checked exactly as hard
  as a `done` task's, so a partial task with a passing Acceptance fence still owes a killed mutant.
- `blocked` — waiting on something outside this repository, named in `**Blocked-on:**` as an event
  a later reader can check has happened.
- `done` — finished, with tool-written acceptance and mutation evidence to match.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `formerlyShipped()` | T2 | T1 before T2 |
| T1 | `classifyHomeFile()` | T2, T3 | T1 before both |
| T2 | `orphans()` | T3 | T2 before T3 |

## Notes

- The Acceptance fences of T1 and T2 name the same suite. That is deliberate and not a
  copy-paste: each is chained with a `grep` on `tests/mutations.json` for its own mutation label, so
  a green suite alone cannot carry either verdict, and the two fences cannot both pass on the same
  work.
- T3's `--apply` tests assert the FILE afterwards, not that a delete function went uncalled. A spy
  proves the code's current shape; reading the bytes proves the property the record rests on.
