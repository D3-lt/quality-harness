# Task ADR-139-T4: The Windows selftest runs in shards, accounted over one merged row

**Status:** withdrawn — built and shadowed (S3 met), then removed with ADR-139's rollback (its Outcome)
**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `QH_SELFTEST_SHARD`, `QH_SELFTEST_ROWS_OUT`, `mergeRows(rows)`
**Consumes:** `sliceFiles(files, i, n)` (T1), `fanIn(jobs, artifacts, prefix, count)` (T2)
**Data dependency:** needs one landing run with the shadow layout beside the old job before the switch
**Proof map:** v1

## Goal

With `QH_SELFTEST_SHARD=i/n`, selftest.sh runs its slice of the ordered test files, writes its per-file row to
`QH_SELFTEST_ROWS_OUT`, skips the accounting, runs the non-suite checks only when `i` is 1, and unsets both variables before its
tests start. `scripts/merge-rows.mjs` merges shard rows into one, combining counters and reasonless skips by normalized file path
(a file's slices summed). The workflow runs three Windows shards and a fan-in, first beside `windows` under non-required names;
the fan-in calls `fan-in.mjs`, merges the rows and runs `suite-accounting.mjs --row` on the merged row. After one landing in which
both agree, the fan-in takes the name `windows` and the old job is removed.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/selftest.sh` | edit | The shard mode; the variables consumed and unset |
| `scripts/merge-rows.mjs` | add | `mergeRows` and its CLI |
| `.github/workflows/selftest.yml` | edit | The Windows shard matrix and the fan-in |
| `tests/selftest-shards.test.mjs` | add | Slice selection, a nested selftest run whole, merged-row accounting both ways |
| `tests/mutations/scripts/merge-rows.mjs.json` | add | Keeping the last row instead of merging is noticed |
| `tests/mutations/scripts/selftest.sh.json` | edit | A shard variable left in the tests' environment is noticed |

## Ordered Steps

1. [S1] Write the failing test: `QH_SELFTEST_DRY=1` with `QH_SELFTEST_SHARD=2/3` names the slice T1 gives; a selftest.sh started
   from inside a sharded one (the shape of tests/package.test.mjs:1108, locked by ADR-091 T3 and ADR-100 T5) sees no shard
   variable; three shards' rows merged pass `suite-accounting.mjs --row` with exit 0, and two shards' merged rows exit 1 naming the
   unrun files; without the variable selftest.sh still runs the accounting itself.
2. [S2] Implement the shard mode and scripts/merge-rows.mjs.
3. [S3] Add the shadow shards and fan-in; land it; compare both jobs' results.
   [proof: human: the landing's run id and both outcomes are recorded in docs/BACKLOG.md §459]
4. [S4] Switch the name and remove the old job.
5. [S5] Add the mutants; record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/selftest-shards.test.mjs tests/suite-accounting.test.mjs tests/land.test.mjs 2>&1 | tee "$out" && grep -q '✔ the Windows shards together reach every test file, and the merged row says when one did not' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the Windows shards together reach every test file, and the merged row says when one did not` | `tests/selftest-shards.test.mjs` | Slice selection, merged accounting both ways, unsharded path unchanged | — | S1, S2 |
| `a selftest started inside a shard runs whole` | `tests/selftest-shards.test.mjs` | The variables are unset for the tests | — | S1, S2 |
| `the committed ruleset requires only jobs the workflow declares` | `tests/land.test.mjs` | The required name survives the switch | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the shard mode, `mergeRows` |
| 2 — selected | the Windows shard jobs and the fan-in |
| 3 — discoverable | the variables named in selftest.sh's header comment |
| 4 — used | every landing run (T5) |

## Mutation Log
- 2026-11-04 · 7adeddc64* · mutant killed · exit 1 · `scripts/merge-rows.mjs` · only the last shard row is accounted, so the others read as unrun or pass unseen · acceptance-sha256:9fcaf98142c888671d646766adcca5264683ebb8b77228e1167637ac71b5bff0

## Invariants

`bash scripts/selftest.sh` without the variable runs exactly what it runs today, accounting included. The ubuntu and macOS
selftest jobs are unchanged. `tests/suite-accounting.test.mjs` and `tests/package.test.mjs` pass byte-identical.

## Risks

A shard's leak and orphan checks see only its own children, as today per process tree.

## Stop Condition

Stop if a test file passes only when another file ran earlier on the same runner.

## Out of Scope

- Splitting the macOS selftest (deferred: docs/BACKLOG.md §459)

## Verification Log
- 2026-11-04 · 7adeddc64* · exit 1 · `set -o pipefail …` · acceptance-sha256:9fcaf98142c888671d646766adcca5264683ebb8b77228e1167637ac71b5bff0 · ms:927 · test-lock-sha256:c0aa6c6f4e0f1e8707c01494c6938f6d4655f114ced300453430e234f68d78f2 · test-lock-file:docs/adr/locks/c0aa6c6f4e0f1e8707c01494c6938f6d4655f114ced300453430e234f68d78f2.lock
  ```
  --- last 10 line(s) of stdout (of 48 after folding 48 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 821.829209

  ✖ failing tests:

  test at tests/selftest-shards.test.mjs:1:1
  ✖ tests/selftest-shards.test.mjs (74.807292ms)
    'test failed'
  ```
- 2026-11-04 · 7adeddc64* · exit 0 · `set -o pipefail …` · acceptance-sha256:9fcaf98142c888671d646766adcca5264683ebb8b77228e1167637ac71b5bff0 · ms:1815
