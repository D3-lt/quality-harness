# ADR-120 Tasks

Implementation tasks for ADR-120: nothing left out. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | none |
| 4 | T4 | none |
| 5 | T5 | none |
| 6 | T6 | none |

## Waves

| Wave | Tasks | Why together |
|------|-------|--------------|
| 1 | T1, T3, T4, T5, T6 | no task consumes another's contract |
| 2 | T2 | consumes `parseShell(records)` and the lexer's boundary fields (T1) |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| [T1](T1-shell-grammar.md) | A shell grammar for the check classifier | pending | none — no spec | `node --test --test-reporter=tap tests/shell-grammar.test.mjs tests/fail-open.test.mjs tests/shell-words.test.mjs tests/qh-core-parity.test.mjs`, named tests, then the Go core |
| [T2](T2-publish-readers-on-the-tree.md) | The publish readers read the bytes a group prints | pending | none — no spec | `node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs`, named tests, then the Go core |
| [T3](T3-a-retired-spec-fact.md) | A tag that retires a spec fact | done | none — no spec | `node --test --test-reporter=tap tests/spec-retired.test.mjs`, named tests, then `spec-verify --spec` on the ADR-040 spec |
| [T4](T4-the-session-s-own-plugin.md) | Forwarders run the session's own plugin | pending | none — no spec | `node --test --test-reporter=tap tests/plugin-root.test.mjs`, named tests |
| [T5](T5-relock-advice-per-pair.md) | The relock advice once per check pair | pending | none — no spec | `node --test --test-reporter=tap tests/test-lock.test.mjs`, named tests |
| [T6](T6-a-stop-that-can-act.md) | A Stop continues a turn to run the check only when it is declared | pending | none — no spec | `node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs`, named tests, then the Go core |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `parseShell(records)` and the lexer's boundary fields | T2 | T1 before T2 |

## Notes

- Every task changes what a reader says or what the hooks deliver (the check and publish classifiers, spec-verify and
  work-next, the forwarders, adr-lint, the Stop rules): an outside run before the release (CLAUDE.md §18).
