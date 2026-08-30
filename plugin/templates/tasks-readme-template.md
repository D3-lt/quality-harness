# ADR-NNN Tasks

Implementation tasks for ADR-NNN: <Title>. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated. `adr-lint` fails when the README lists a task with no file or omits
an existing task file; wave/order drift against Depends-on + Consumes edges is caught by
`adr-lint` (cycles too — the wave table must be a valid topological leveling of the task
DAG); Covers-column drift is caught at review. Regenerate rather than hand-edit.

## Execution Order

For 4–5 tasks, sequential order only (no wave table, no DAG):

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

For >5 tasks, waves (parallel-safe groups) — required at this size:

| Wave | Tasks | Depends-on |
|------|-------|------------|
| 1 | T1, T2 | none |
| 2 | T3 | T1 |

ASCII DAG diagram only when it clarifies complex branching at >5 tasks.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | <task title> | pending | <F-n, UCn-Sm or —> | `<command>` |

Status: `pending` | `partial` | `blocked` | `done`.

- `pending` — not started, or started and carrying no evidence yet.
- `partial` — genuinely part-done: some of the work has landed and some has not. It is a
  status with OBLIGATIONS, not a softer `pending`: everything its landed evidence claims is
  checked exactly as hard as for a `done` task, so a partial task with a passing Acceptance
  fence still owes a killed mutant. What it does not owe is a `done` row's exit-0 evidence,
  because it claims no completion.
- `blocked` — waiting on something outside this repository. Say what, in the task's
  `**Blocked-on:**` header, as an event a later reader can check HAS HAPPENED — ideally a
  command that exits 0 once it has, e.g. `git merge-base --is-ancestor <sha> master`. Where
  only someone with other access can confirm it, say who.
- `done` — finished, with tool-written acceptance and mutation evidence to match.

`running` and `failed` are NOT in this vocabulary. They were in an earlier version of this
legend and the gates never acted on them, so a task following the template was reported as
carrying a status the checks skipped. One word with two corpora behind it is a decision;
five words with one legend behind them is a taxonomy, and taxonomies are where vocabularies
go to rot (ADR-014).

## Contract Coupling

<Derived from task-file Produces/Consumes headers.>

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | <contract> | T2 | T1 before T2 |

If none, write `None`.

## Notes

- <pre-flight, human sign-off, or environment note>
