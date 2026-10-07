# ADR-087 Tasks

Implementation tasks for ADR-087: Read the Status shapes measured in public corpora, and name the numbered files left unread.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |
| 4 | T4 | T1 |
| 5 | T5 | T1, T2, T3, T4 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | frontmatter values and `active` are read alike by every reader | done | F-1, F-2, F-3, F-7, F-8, UC1-S1, UC1-S2 | `node --test tests/corpus-shapes.test.mjs tests/status-reading.test.mjs tests/not-recognised-reason.test.mjs` (five named tests pass) |
| T2 | a MADR 2 bullet Status is read above the first section | done | F-4 | `node --test tests/corpus-shapes.test.mjs` (two named tests pass) |
| T3 | a frontmatter `superseded_by` names the replacement | done | F-5, F-6 | `node --test tests/corpus-shapes.test.mjs` (two named tests pass) |
| T4 | numbered files outside a record directory are named as not read | done | F-9, UC2-S1, UC2-S2 | `node --test tests/corpus-shapes.test.mjs` (two named tests pass) |
| T5 | a yaml-frontmatter fixture corpus in the matrix | done | F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-9 | `node --test tests/corpus-matrix.test.mjs` (the corpus's named test passes) |

## Contract Coupling

T2, T3 and T4 consume T1's `frontmatter_block` / `frontmatterBlock`, so T1 completes first. T5 consumes every reading the other four produce, so it is last.
