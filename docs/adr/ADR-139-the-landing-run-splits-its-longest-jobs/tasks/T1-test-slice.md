# Task ADR-139-T1: A deterministic slice of the test files, each file in exactly one slice

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `sliceFiles(files, i, n)`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`sliceFiles(files, i, n)` in scripts/test-slice.mjs returns the i-th of n slices of a file list: the list sorted by
repository-relative name with `/` separators, every `n`-th file from position `i - 1`, so every file is in exactly one slice on
every platform. Its CLI prints the slice, one name per line, and refuses an `i` or `n` that is not a whole number with
`1 <= i <= n`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/test-slice.mjs` | add | `sliceFiles` and its CLI |
| `tests/test-slice.test.mjs` | add | Union and disjointness over n, platform-independent order, refusals |
| `tests/mutations/scripts/test-slice.mjs.json` | add | An off-by-one or an unsorted list is noticed |

## Ordered Steps

1. [S1] Write the failing test: over the real `tests/*.test.mjs` list and n = 1…4, the slices are disjoint and their union is the
   list; the same names given with `\` separators or in another order give the same slices; `0/3`, `4/3`, `a/3` and `1/0` are
   refused with exit 2.
2. [S2] Implement `sliceFiles` and the CLI.
3. [S3] Add mutants on the sort and the stride; record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/test-slice.test.mjs 2>&1 | tee "$out" && grep -q '✔ every test file is in exactly one slice, whatever the platform or the order given' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every test file is in exactly one slice, whatever the platform or the order given` | `tests/test-slice.test.mjs` | Union, disjointness, separator and order independence, refusals | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `sliceFiles` |
| 2 — selected | T2, T3, T4 call it |
| 3 — discoverable | its CLI usage line |
| 4 — used | every shard job's log names its slice (T5) |

## Mutation Log
- 2026-11-04 · 753af2cf1* · mutant killed · exit 1 · `scripts/test-slice.mjs` · slices taken in the given order differ by platform and listing order · acceptance-sha256:4189d56658beac19ea8bfea2bb3efc7c836277442ed7b2dfcfda82ff6f509308

## Invariants

`tests/helpers/shard.mjs` and the `*.shard-N.test.mjs` files are untouched: a sliced file's parts are ordinary list entries.

## Risks

Uneven slices: measured in T5, not guessed here.

## Stop Condition

Stop if a test file depends on another running in the same process or job.

## Out of Scope

- Cost-balanced slices (deferred: docs/BACKLOG.md §459)

## Verification Log
- 2026-11-04 · 753af2cf1* · exit 1 · `set -o pipefail …` · acceptance-sha256:4189d56658beac19ea8bfea2bb3efc7c836277442ed7b2dfcfda82ff6f509308 · ms:199 · test-lock-sha256:326b52034d1526a24032a4668219c89587c353b99ecb7d56b50ae00e01ef163e · test-lock-file:docs/adr/locks/326b52034d1526a24032a4668219c89587c353b99ecb7d56b50ae00e01ef163e.lock
  ```
  --- last 10 line(s) of stdout (of 35 after folding 35 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 81.909375

  ✖ failing tests:

  test at tests/test-slice.test.mjs:1:1
  ✖ tests/test-slice.test.mjs (78.140209ms)
    'test failed'
  ```
- 2026-11-04 · 753af2cf1* · exit 0 · `set -o pipefail …` · acceptance-sha256:4189d56658beac19ea8bfea2bb3efc7c836277442ed7b2dfcfda82ff6f509308 · ms:867
