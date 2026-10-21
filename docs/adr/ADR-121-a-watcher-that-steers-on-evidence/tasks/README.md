# ADR-121 Tasks

Implementation tasks for ADR-121. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1, T2 |
| 4 | T4 | T2 |
| 5 | T5 | T1, T3 |
| 6 | T6 | T3, T4, T5 |
| 7 | T7 | T1 |

## Waves

| Wave | Tasks | Why together |
|------|-------|--------------|
| 1 | T1 | every later decision reads its numbers |
| 2 | T2 | consumes T1's outcomes |
| 3 | T3, T4, T7 | consume the gate or the ledger |
| 4 | T5 | consumes the watcher |
| 5 | T6 | measures the whole |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| [T1](T1-the-nudge-ledger.md) | Every finding gets an outcome, and `qh nudges` reports them | pending | none — no spec | `node --test --test-reporter=tap tests/nudge-ledger.test.mjs`, named tests |
| [T2](T2-an-evidence-gate.md) | Every intervention has a fact behind it, a cooldown and a budget | pending | none — no spec | `node --test --test-reporter=tap tests/evidence-gate.test.mjs`, named tests |
| [T3](T3-the-watcher.md) | `qh watch`: one process per repository, answering hooks over a socket | pending | none — no spec | `node --test --test-reporter=tap tests/watcher.test.mjs`, named tests |
| [T4](T4-evidence-grounded-self-evaluation.md) | The Stop question is built from the evidence | pending | none — no spec | `node --test --test-reporter=tap tests/self-evaluation.test.mjs`, named tests |
| [T5](T5-lessons-in-memoryd.md) | Proven lessons go to memoryd; mrw writes become visible | pending | none — no spec | `node --test --test-reporter=tap tests/lessons.test.mjs`, named tests |
| [T6](T6-the-bench-arm.md) | The watcher is measured in the bench, with a kill criterion | pending | none — no spec | the verdict recorded in docs/BENCHMARKS.md |
| [T7](T7-a-diff-against-what-was-decided.md) | A diff is checked against what Accepted records decided | pending | none — no spec | `node --test --test-reporter=tap tests/decisions-check.test.mjs`, named tests |
