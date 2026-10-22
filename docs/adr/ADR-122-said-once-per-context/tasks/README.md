# ADR-122 Tasks

Implementation tasks for ADR-122: each hook item is said once per context. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |
| 4 | T4 | T1, T2 |
| 5 | T5 | T1, T3, T4 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| [T1](T1-measure-the-channels.md) | Measure what reaches the context, and count a session's hook text | done | none — no spec | `node --test --test-reporter=tap tests/hook-footprint.test.mjs`, named tests |
| [T2](T2-the-said-per-context-helper.md) | One helper: the marker, the transcript scan, the fallback and the reset | done | none — no spec | `node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs`, named tests, then the Go core |
| [T3](T3-route-every-emitter.md) | Every emitter is said once per context, and the event log knows the generation | done | none — no spec | `node --test --test-reporter=tap tests/said-per-context-routing.test.mjs …`, named tests, then the goldens, the publish, turn-end and standing suites and the Go core |
| [T4](T4-one-channel-per-recipient.md) | One channel per recipient | done | none — no spec | `node --test --test-reporter=tap tests/hook-channel.test.mjs`, named tests, then the Go core |
| [T5](T5-the-after-measurement.md) | The after-measurement and the release note | pending | none — no spec | `node --test --test-reporter=tap tests/hook-footprint.test.mjs`, the after-fixture test |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the hook-output record shapes and the channel measurement | T2, T4 | T1 first |
| T1 | `scripts/hook-footprint.mjs` | T5 | T1 before T5 |
| T2 | `saidInContext` and the marker | T3, T4 | T2 before T3 and T4 |
| T3 | generation-aware `emittedFor`, every emitter routed | T5 | T3 before T5 |
| T4 | one channel per recipient | T5 | T4 before T5 |

## Notes

- Every task from T2 on changes what the hooks deliver: an outside run before the release (CLAUDE.md §18).
- T1 and T5 read a recorded session's transcript on this machine; no transcript, figure derived from another repository's
  corpus, or path from it is committed (CLAUDE.md §6). The fixtures are synthetic, built by the tests.
