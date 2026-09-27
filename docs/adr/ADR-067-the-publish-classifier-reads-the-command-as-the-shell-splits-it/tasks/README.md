# ADR-067 Tasks

Implementation tasks for ADR-067: The publish classifier reads a command as the shell splits it. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers. This README is a derived index.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| Task | File | Status |
|------|------|--------|
| T1 | [T1-one-lexer-proved-against-the-shell.md](T1-one-lexer-proved-against-the-shell.md) | done |
| T2 | [T2-the-publish-classifier-reads-argv.md](T2-the-publish-classifier-reads-argv.md) | done |
| T3 | [T3-the-armed-grammar-reads-the-same-lexer.md](T3-the-armed-grammar-reads-the-same-lexer.md) | done |
