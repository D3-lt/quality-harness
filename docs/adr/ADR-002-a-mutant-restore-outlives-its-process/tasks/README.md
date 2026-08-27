# ADR-002 Tasks

Implementation tasks for ADR-002: A mutant restore must outlive the process that applied it. See the
parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |

T2 consumes T1's ordering guarantee (the journal is in place before the mutation), so T1 lands
first even though neither declares a `Depends-on`.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | the restore is on disk before the mutation is | pending | — | `node --test tests/evidence-chain.test.mjs …` |
| T2 | the warning survives the kill, and SIGTERM is actually tested | pending | — | `node --test tests/evidence-chain.test.mjs && node scripts/mutate.mjs --case 'verify:' …` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | journal written before the mutation lands | T2 | T1 before T2 |

## Notes

- T1 shipped in v2.18.2 (`6bbff6d`) before this record was written; the ADR says so. Executing it
  re-runs its fence against the code as it stands.
- **T2 is genuinely open.** Steps 4 and 5 are unwritten work: every kill test today uses `SIGKILL`,
  so the `SIGTERM` handler has no test and no mutation and would rot unnoticed.
