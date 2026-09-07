# ADR-037 Tasks

Implementation tasks for ADR-037: advice earns its place by being acted on, and an advisory nobody
acts on is removed rather than rationed. See the parent ADR for the decision.

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
| T1 | An advisory's survival across runs is measured, and nowhere to look is not zero | done | — | `node --test --test-name-pattern 'focused false-green regressions remain closed' tests/gates.test.mjs` |
| T2 | The proof-map advisory names an edit to the file it is about, or it is deleted | pending | — | `node --test --test-name-pattern 'focused false-green regressions remain closed' tests/gates.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

⚠ **T2 WAS WRITTEN ONLY AFTER T1's NUMBER WAS READ, AND IT NAMES WHICH NUMBER.** T1's population
reading — 78 live advisory findings, of which 34 on 17 records are ONE advisory — is what selects
the proof-map notice as the first candidate rather than the fence-segments one `docs/BACKLOG.md`
§152 was reported about (7 of 78).

⚠ **AND IT NAMES THE NUMBER IT DID NOT USE.** Survival across runs is 1 everywhere, because T1's note
is a day old — the correct day-one answer and no evidence about whether anyone acts. T2 does not rest
on it. Its argument is that the advisory's own sentence instructed the reader about a FUTURE task,
which is unactionable by reading and needs no counting at all. Reading this section as though
survival data existed would be the false claim this record is about.

## Contract Coupling

T1 produces the advisory-survival note and the `--advice-survival` report. T2 consumes the numbers
they yield and decides, per advisory, between a suggested edit and deletion.
