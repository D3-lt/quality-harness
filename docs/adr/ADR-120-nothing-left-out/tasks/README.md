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
| 7 | T7 | none |
| 8 | T8 | none |
| 9 | T9 | none |
| 10 | T10 | none |
| 11 | T11 | none |
| 12 | T12 | none |
| 13 | T13 | none |
| 14 | T14 | none |
| 15 | T15 | none |
| 16 | T16 | none |

## Waves

| Wave | Tasks | Why together |
|------|-------|--------------|
| 1 | T1, T3 to T16 | no task consumes another's contract |
| 2 | T2 | consumes `parseShell(records)` and the lexer's boundary fields (T1) |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| [T1](T1-shell-grammar.md) | A shell grammar for the check classifier | done | none — no spec | `node --test --test-reporter=tap tests/shell-grammar.test.mjs tests/fail-open.test.mjs tests/shell-words.test.mjs tests/qh-core-parity.test.mjs`, named tests, then the Go core |
| [T2](T2-publish-readers-on-the-tree.md) | The publish readers read the bytes a group prints | done | none — no spec | `node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs`, named tests, then the Go core |
| [T3](T3-a-retired-spec-fact.md) | A tag that retires a spec fact | done | none — no spec | `node --test --test-reporter=tap tests/spec-retired.test.mjs`, named tests, then `spec-verify --spec` on the ADR-040 spec |
| [T4](T4-the-session-s-own-plugin.md) | Forwarders run the session's own plugin | done | none — no spec | `node --test --test-reporter=tap tests/plugin-root.test.mjs`, named tests |
| [T5](T5-relock-advice-per-pair.md) | The relock advice once per check pair | done | none — no spec | `node --test --test-reporter=tap tests/test-lock.test.mjs`, named tests |
| [T6](T6-a-stop-that-can-act.md) | A Stop continues a turn to run the check only when it is declared | done | none — no spec | `node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs`, named tests, then the Go core |
| [T7](T7-adr-next-reads-other-corpora.md) | adr-next reads another corpus's records and a sign-off's last verdict | done | none — no spec | `node --test --test-reporter=tap tests/adr-next-foreign.test.mjs`, named tests |
| [T8](T8-terminal-status-and-step-sign-offs.md) | A withdrawn task reads stopped, and a sign-off covers the steps it names | done | none — no spec | `node --test --test-reporter=tap tests/adr-next-terminal.test.mjs`, named tests |
| [T9](T9-a-pass-stands-across-prose.md) | A pass stands across a prose-only change, for every reader | pending | none — no spec | `node --test --test-reporter=tap tests/prose-pass.test.mjs`, named tests, then the Go core |
| [T10](T10-a-long-fence-in-the-background.md) | adr-verify runs a long fence in the background and records it | done | none — no spec | `node --test --test-reporter=tap tests/adr-verify-background.test.mjs`, named tests |
| [T11](T11-a-check-that-cannot-start.md) | A check that cannot start here continues no turn | done | none — no spec | `node --test --test-reporter=tap tests/turn-end-declared.test.mjs`, named tests, then the Go core |
| [T12](T12-another-repository-by-relative-path.md) | A commit into another repository by a relative path is judged there | done | none — no spec | `node --test --test-reporter=tap tests/foreign-relative.test.mjs`, named tests, then the Go core |
| [T13](T13-quieter-brief-and-mention.md) | branch-state reads the session's worktree and says a permanent unknown once; `git stash push` is no push | done | none — no spec | `node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs`, named tests, then the Go core |
| [T14](T14-a-mutant-the-fence-never-sees.md) | A mutant the fence never sees is inconclusive; a missing dependency is could-not-run | done | none — no spec | `node --test --test-reporter=tap tests/mutant-escape.test.mjs`, named tests |
| [T15](T15-lock-drift-generated-specs-templates.md) | Lock drift named at commit; generated specs skipped; the template and skill lines | done | none — no spec | `node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs`, named tests |
| [T16](T16-a-failed-check-keeps-its-output.md) | A failed check keeps the tail of its output | done | none — no spec | `node --test --test-reporter=tap tests/check-output.test.mjs`, named tests |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `parseShell(records)` and the lexer's boundary fields | T2 | T1 before T2 |

## Notes

- Every task changes what a reader says or what the hooks deliver (the check and publish classifiers, spec-verify and
  work-next, the forwarders, adr-lint, the Stop rules): an outside run before the release (CLAUDE.md §18).
