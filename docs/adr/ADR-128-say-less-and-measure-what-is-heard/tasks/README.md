# ADR-128 tasks

Derived index; the task files win.

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |
| 3 | T3 | none |
| 4 | T4 | ADR-121-T1 |

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| [T1](T1-r2-is-retired.md) | R2 is retired; no turn end names a commit below HEAD | done | none — no spec | `node --test --test-reporter=tap tests/r2-retired.test.mjs` |
| [T2](T2-own-commit-is-not-news.md) | A session's own commit does not re-send the branch-state line | done | none — no spec | `node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs` |
| [T3](T3-a-quoted-heredoc-is-data-to-the-advisory.md) | A commit word in a quoted heredoc body draws no advisory | pending | none — no spec | `node --test --test-reporter=tap tests/publish-advisory-heredoc.test.mjs` |
| [T4](T4-the-adopter-summary.md) | `qh nudges --summary`, carried by an outside run | pending | none — no spec | `node --test --test-reporter=tap tests/nudge-summary.test.mjs` |
