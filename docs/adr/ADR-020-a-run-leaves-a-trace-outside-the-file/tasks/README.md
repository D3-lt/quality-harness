# ADR-020 Tasks

Implementation tasks for ADR-020: Bind an acceptance entry to the output the run
produced. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` /
`Covers` headers. This README is a derived index — when it disagrees with a task
file, the task file wins and the README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Record how long the run took, and refuse a duration that could not have produced it | done | — | `python3 tests/gate-regressions.py plugin/bin …` |

Status: `pending` | `partial` | `blocked` | `done`.

- `pending` — not started, or started and carrying no evidence yet.
- `partial` — genuinely part-done, with obligations: its landed evidence is checked
  exactly as hard as a `done` task's, so a partial task with a passing Acceptance
  fence still owes a killed mutant.
- `blocked` — waiting on something outside this repository, named in
  `**Blocked-on:**` as an event a later reader can check has happened.
- `done` — finished, with tool-written acceptance and mutation evidence to match.

## Contract Coupling

None — one task.

## Notes

- **T2 and T3 were deleted rather than executed.** They were the ledger and its
  cross-check, and T1 S2's measurement fired the record's Stop Condition before
  either was written: 25 of this corpus's 40 acceptance fences produce different
  output on every run, so the digest they were built around can never be compared.
  The reasoning is kept in the parent record; the tasks are gone because the tasks
  directory says what will be done, not what was once planned.
- T1's fence is chained with a `grep` on `tests/mutations.json` for its own label,
  so a green harness alone cannot carry the verdict.
- T1 touches three gates at once. The entry grammar has three readers and
  `tests/gate-regressions.py` already asserts they agree; a fourth place for the
  format to drift is this record's main cost.
