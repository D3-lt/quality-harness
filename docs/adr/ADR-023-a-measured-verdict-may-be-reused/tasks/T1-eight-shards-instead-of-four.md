# Task ADR-023-T1: Split the campaign across eight shards instead of four

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Halve the campaign's wall-clock by doubling the matrix, with the total work and every verdict
unchanged.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `.github/workflows/selftest.yml` | edit | the `mutations ${{ matrix.shard }}/4` job name, the matrix list, and the `--shard i/n` argument passed to `mutate.mjs` |
| `tests/package.test.mjs` | edit | `continuous integration runs the checks this repository owns` asserts the workflow's shape; the shard count is part of what it reads |

## Ordered Steps

1. [S1] Write the failing assertion first: extend the CI-shape test so it reads the mutation matrix from `selftest.yml` and requires the shard count in the job name, the matrix entries and the `--shard` argument to be the SAME number. Confirm it is red against the current 4/4 workflow by asserting 8. (TDD red.)
2. [S2] Change the matrix to eight entries, the job name to `mutations ${{ matrix.shard }}/8`, and the `--shard ${{ matrix.shard }}/8` argument, in one edit so the three cannot disagree.
3. [S3] Re-run the CI-shape test and confirm it passes for 8. [proof: acceptance]
4. [S4] Confirm `mutate.mjs --shard 8/8` selects a non-empty, non-overlapping slice, since `--shard i/n` was only ever exercised at n=4. [proof: acceptance]

## Acceptance

```bash
set -o pipefail
node --test tests/package.test.mjs 2>&1 | tee /tmp/adr023-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr023-t1.out \
  && node scripts/mutate.mjs --shard 8/8 --list | tee /tmp/adr023-t1b.out \
  && test -s /tmp/adr023-t1b.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `continuous integration runs the checks this repository owns` | `tests/package.test.mjs` | the shard count agrees across the job name, the matrix and the `--shard` argument | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the CI-shape test reads the workflow and asserts the three numbers agree |
| 2 — something selects it | the workflow IS the caller; a matrix entry that names no shard produces no job, which the same test catches |
| 3 — the caller can discover it | n/a: no declared interface — `--shard i/n` already exists and is documented in `mutate.mjs`'s usage line |
| 4 — it is used | the run's own job list on the next push; wall-clock is observable in the Actions UI and nothing else measures it |

## Mutation Log

## Invariants

- The three places the shard count appears never disagree — a job named `x/8` running `--shard x/4` silently skips half the catalogue while reporting success.
- Total mutants executed across all shards is unchanged; this task changes concurrency, never coverage.

## Risks

- Eight concurrent runners may queue on a constrained plan, giving back the wall-clock. Harmless: total work and every verdict are identical, so the worst case is today's timing.

## Stop Condition

Stop if `--shard i/n` turns out not to partition the catalogue exactly — an overlap double-counts a
verdict and a gap drops one silently. That is a defect in the slicing rather than in the count, and
it belongs to its own task.

## Out of Scope

- Balancing shards by cost rather than by index (deferred: docs/BACKLOG.md §106)

## Verification Log
