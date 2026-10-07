# ADR-092 Tasks

Implementation tasks for ADR-092: One definition of a record, in Python, with lifecycle as its only mirror.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Tasks | Depends-on |
|------|-------|------------|
| 1 | T5 | none |
| 2 | T1 | T5 |
| 3 | T2, T3 | T1; T3 also T5 |
| 4 | T4, T6, T7 | T4 and T6 on T3; T7 on T2 |

Within a wave no two tasks edit one source or test file; every task appends to the mutation catalogue.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T5 | no code-block line is a Status, and a frontmatter fence hides nothing (findings 2, 7) | done | — | `node --test tests/status-code-blocks.test.mjs` (six named tests pass) |
| T1 | one Python definition of a record, its eligibility rule, and the parity table (finding 1) | done | — | `node --test tests/record-recognition.test.mjs` (six named tests pass; the link test may skip on Windows) |
| T2 | every Python reader asks the one definition, and reads only regular text files (findings 3, 4, 5, 12) | done | — | `node --test tests/record-recognition.test.mjs` (ten named tests pass; three may skip on Windows, one as root) |
| T3 | lifecycle mirrors the definition, discovers by it, and dedups by it (findings 5, 6, 11) | done | — | `node --test tests/record-discovery.test.mjs` (ten named tests pass; five may skip on Windows) |
| T4 | every numbered candidate is counted or named, and a failed read is PARTIAL (findings 8, 9, 10) | pending | — | `node --test tests/record-naming.test.mjs` (six named tests pass; two may skip on Windows) |
| T6 | an archive is named by what the definition admits, and never by a template | done | — | `node --test tests/unmarked-archives.test.mjs` (three named tests pass) |
| T7 | every walk names a directory it could not list, reads `.md` in any case, and opens no FIFO | done | — | `node --test tests/walk-unlisted.test.mjs` (five named tests pass; the chmod test may skip on Windows or as root, the FIFO test on Windows) |

## Contract Coupling

T1 consumes T5's fence walk, so the table it writes holds only approved answers. T2 consumes T1's definition, eligibility and table; T3 consumes T1's table and T5's walk; T4 and T6 consume T3's selection; T7 consumes T2's `walk(..., unlisted, list_dir)` and its `tests/helpers/unlistable.py`. T5 completes first.
