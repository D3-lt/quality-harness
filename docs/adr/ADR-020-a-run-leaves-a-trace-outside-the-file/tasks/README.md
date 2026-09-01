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
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Record the output digest in the entry, and prove honest re-runs agree | pending | — | `python3 tests/gate-regressions.py plugin/bin …` |
| T2 | Append each run to a ledger that outlives the temp directory | pending | — | `python3 tests/gate-regressions.py plugin/bin …` |
| T3 | Report only a ledger that disagrees, and nothing otherwise | pending | — | `python3 tests/gate-regressions.py plugin/bin …` |

Status: `pending` | `partial` | `blocked` | `done`.

- `pending` — not started, or started and carrying no evidence yet.
- `partial` — genuinely part-done, with obligations: its landed evidence is checked
  exactly as hard as a `done` task's, so a partial task with a passing Acceptance
  fence still owes a killed mutant.
- `blocked` — waiting on something outside this repository, named in
  `**Blocked-on:**` as an event a later reader can check has happened.
- `done` — finished, with tool-written acceptance and mutation evidence to match.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `output_digest()` and the extended entry grammar | T2, T3 | T1 before both |
| T2 | `run_ledger()` and its append format | T3 | T2 before T3 |

## Notes

- **T1 S2 gates the whole record.** It measures whether repeated runs of this
  repository's own fences produce identical output. If any fence is unstable, T3
  does not ship — that is the ADR's stated falsifier, decided in advance rather
  than argued about when the measurement is inconvenient.
- All three fences name the same harness, and each is chained with a `grep` on
  `tests/mutations.json` for its own label, so a green harness alone cannot carry
  any of the three verdicts.
- T1 is the only task that touches three gates at once. The entry grammar has
  three readers and `tests/gate-regressions.py` already asserts they agree; a
  fourth place for the format to drift is this record's main cost.
