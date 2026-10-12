# ADR-099 Tasks

Implementation tasks for ADR-099: SessionStart does not list ready tasks; work-next owns ready. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | ADR-097-T1 |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | SessionStart and the compaction note name no ready task, and the ready-task cache is gone | done | none — no spec | `node --test tests/ready-is-work-next.test.mjs` (two named tests pass), the corpus-existence regression, the readiness golden, and a clean `mutate.mjs --stale` |
| T2 | ADR-040, ADR-046 and ADR-095 are retired whole as governing, through the adr-retire stage | done | none — no spec | `adr-retire-check docs/adr-archive/README.md`, the three units listed under `docs/adr-archive/`, the path-length test, `adr-context` naming them as governing, the spec still covered, and `adr-lint` on the active records that name them |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the removal (what makes the ready-line tasks of ADR-040, ADR-046 and ADR-095 untrue) | T2 | T1 before T2; both land in one commit, because between them lint refuses the ADR-095 cache task's `done` |

## Notes

- The removal is one task, not two: removing the lines leaves the cache unreached, and the only order that keeps each commit green (the cache first) writes an uncached call into both emitters that the next commit deletes.
- T1 retakes ADR-068 T2's and ADR-092 T3's lock maps (ADR-092 T3's added by the owner on 2026-10-12, before the red run); a relock snapshots hashes and runs no fence. T1 edits no other record: T2 retires ADR-040, ADR-046 and ADR-095 whole through the adr-retire stage, which retires whole decision units only (the parent record's Decision 5 names what it cannot do).
- T1 depends on ADR-097 T1 (committed as dbf53131): both edit `tests/lifecycle.test.mjs` and relock ADR-068 T2, so T1 re-runs `test-locks.py` before it deletes a test.
