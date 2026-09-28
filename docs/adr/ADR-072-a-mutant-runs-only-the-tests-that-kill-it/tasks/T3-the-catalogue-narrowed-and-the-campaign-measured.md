# Task ADR-072-T3: The catalogue narrowed, and the next campaign measured against run 36413858960

**Depends-on:** T2, T4
**Covers:** none — no spec
**Estimated scope:** M (the catalogue, one CI campaign)
**Owner:** unassigned
**Produces:** `tests/mutations.json` with `only` filled for the admitted entries
**Consumes:** `narrowEntry(entry, record, sources)` (T2), and `--narrow --write` measuring before it writes (T4)
**Data dependency:** needs the shard caches of a push campaign run after T1, which record killers (a `--no-cache` dispatched run writes no cache), and one dispatched CI campaign after the write
**Proof map:** v1

## Goal

The admitted entries are narrowed, every narrowed entry is RED under its pattern, and the next dispatched campaign's summed shard runner-seconds are at least half below run 36413858960's 50,430.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/mutations.json` | edit | `only` for the narrowed entries |
| `docs/BACKLOG.md` | edit | §301's Stage 4 line: the measured before and after |

## Ordered Steps

1. [S1] After T1 has landed, the first push campaign re-measures every RED entry, because records without `killers` are not reusable. CI's `mutation cache` job merges the shards' caches. Download that artifact from the push run and run `node scripts/mutate.mjs --narrow --cache <the merged cache>` to read the proposals and refusals. [proof: human: the counts are read, not asserted]
2. [S2] On a clean tree, run `node scripts/mutate.mjs --narrow --write --cache <the merged cache>`, with no `--force`. Every narrowed entry must come back RED, or it is undone and named. [proof: acceptance]
3. [S3] Dispatch the CI campaign on the resulting commit and compare its summed shard runner-seconds with run 36413858960's 50,430. Sign off with both numbers, or revert the catalogue commit and say so. [proof: human: a CI measurement]

## Acceptance

```bash
set -o pipefail
node -e "const n = JSON.parse(require('fs').readFileSync('tests/mutations.json','utf8')).mutations.filter(e => typeof e.only === 'string' && e.only.startsWith('^(?:')).length; console.log(n, 'narrowed'); process.exit(n >= 400 ? 0 : 1)" && node scripts/mutate.mjs --stale
```

Human-observed: the dispatched campaign's summed shard runner-seconds, against 50,430 for run 36413858960, recorded in the sign-off.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | the catalogue edit is proved by T2's measured write and by the campaign | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the narrowed `only` fields |
| 2 — something selects it | `testArgs` passes `only` as `--test-name-pattern` |
| 3 — the caller can discover it | n/a: catalogue data |
| 4 — it is used | the dispatched campaign's shard times |

## Mutation Log

## Invariants

- Entries with an `only` today are unchanged.
- Every narrowed entry is RED under its pattern at the commit that narrows it.

## Risks

- A dispatched campaign on a loaded day measures the runners, not the change: compare the summed runner-seconds, which contention inflates on both sides alike, and say if the day was abnormal.

## Stop Condition

Stop and ask if fewer than half the runner-seconds are saved: the record's claim then does not hold.

## Out of Scope

- The 22 cross-file entries (permanent: boundary: ADR-072 Out of Scope)

## Verification Log
