# ADR-023 Tasks

Implementation tasks for ADR-023: Reuse a mutation verdict only when nothing it rests on has
changed. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |
| 3 | T3 | T2 |

T1 is independent of both and can land first — it is the half that needs no argument about
evidence, only a bigger matrix.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Split the campaign across eight shards instead of four | done | — | `node --test tests/package.test.mjs && node scripts/mutate.mjs --shard 8/8 --list` |
| T2 | Key a verdict on its inputs, and reuse it only on an exact match | pending | — | `node --test tests/mutate-runner.test.mjs && node scripts/mutate.mjs --case 'a reused verdict is refused'` |
| T3 | Force a full campaign for a release, and prove the forcing works | pending | — | `node --test tests/package.test.mjs tests/mutate-runner.test.mjs && node scripts/mutate.mjs --case 'a forced run reuses nothing'` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T2 | `cacheKey()` and the reuse decision | T3 | T2 before T3 — T3 decides when T2's reuse is permitted, so there is nothing to forbid until it exists |
| T2 | measured/reused summary counts | T3 | T2 before T3 — T3 asserts a forced run reports zero reused |

## Notes

- T1 changes wall-clock only and carries no evidence argument; it is separable and can ship alone if
  the rest of the record is not accepted.
- T2's S7 needs a full campaign run to record its overhead measurement, which its Acceptance fence
  deliberately does not execute — the fence would then take 80 minutes and outrun any tool timeout.
