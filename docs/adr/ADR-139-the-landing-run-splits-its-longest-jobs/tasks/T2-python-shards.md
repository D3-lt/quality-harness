# Task ADR-139-T2: The Python floor runs in shards, and its fan-in passes only on every shard's own success

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `fanIn(jobs, artifacts, prefix, count)`
**Consumes:** `sliceFiles(files, i, n)` (T1)
**Data dependency:** needs one landing run with the shadow layout beside the old job before the switch
**Proof map:** v1

## Goal

`coverage.sh --python --shard i/n --out DIR` runs its slice under coverage.py and leaves the data files in DIR without judging;
`QUALITY_HARNESS_COVERAGE_SHARDS=DIR bash scripts/coverage.sh --python` combines every shard's data and judges the floor, failing on
an unreadable or empty data file. `scripts/fan-in.mjs` lists the run's jobs and artifacts through `gh api` and passes only when
exactly `count` jobs named `<prefix> i/count` exist, each concluded `success`, each with a non-empty artifact. The workflow runs the
shards and a fan-in first under non-required names beside `coverage floor (python)`; after one landing in which the totals agree,
the fan-in takes the name `coverage floor (python)` and the old job is removed.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/fan-in.mjs` | add | `fanIn` and its CLI over `gh api` |
| `scripts/coverage.sh` | edit | `--shard`, `--out` and the fan-in mode for the Python surface; a failed combine fails |
| `.github/workflows/selftest.yml` | edit | The shard matrix (`fail-fast: false`), the fan-in (`if: always()`), the artifact hand-over (hidden files included) |
| `tests/coverage-shards.test.mjs` | add | Combine across two checkout roots; corrupt or missing shard data refused; `fanIn` over each job state |
| `tests/mutations/scripts/fan-in.mjs.json` | add | Accepting `skipped`, a missing job or an empty artifact is noticed |
| `tests/mutations/.github/workflows/selftest.yml.json` | edit | Dropping `always()` from a fan-in is noticed |

## Ordered Steps

1. [S1] Write the failing tests: a fixture Python package measured over complementary paths from two separate checkout roots,
   combined in a third, gives the same file set and covered lines and arcs as one unsharded run; a corrupt or empty shard data file
   fails the fan-in mode even when coverage would otherwise pass; `fanIn` passes on three successful jobs with artifacts and fails,
   naming the shard, on each of: one `failure`, one `cancelled`, one `skipped`, one missing, one duplicated, one missing or empty
   artifact; the workflow's fan-in jobs run `if: always()` and call `scripts/fan-in.mjs`.
2. [S2] Implement scripts/fan-in.mjs and the coverage.sh modes; the floor stays defined once.
3. [S3] Add the shadow shards and fan-in to the workflow; land it; read both totals on that landing.
   [proof: human: the landing's run id and both totals are recorded in docs/BACKLOG.md §459]
4. [S4] Switch the name and remove the old job; `tests/coverage-split.test.mjs` passes byte-identical, since the fan-in job keeps
   id `coverage-python` and `run: bash scripts/coverage.sh --python`.
5. [S5] Add the mutants; record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/coverage-shards.test.mjs tests/coverage-split.test.mjs 2>&1 | tee "$out" && grep -q '✔ a fan-in passes only when every expected shard concluded success and left its data' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a fan-in passes only when every expected shard concluded success and left its data` | `tests/coverage-shards.test.mjs` | Every job state; artifacts; the workflow's fan-in shape | — | S1, S2 |
| `the Python shards combine across checkout roots to the unsharded figure` | `tests/coverage-shards.test.mjs` | `[paths]`, corrupt data refused | — | S1, S2 |
| `a shard file that is a database but not coverage data fails the combine` | `tests/coverage-shards.test.mjs` | Every data file is read by coverage.py before the combine (the Codex review of 753af2cf..86945589) | — | S1, S2 |
| `the committed ruleset requires only jobs the workflow declares` | `tests/land.test.mjs` | The required names survive the switch | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `fanIn`, the fan-in mode |
| 2 — selected | the workflow's fan-in jobs |
| 3 — discoverable | coverage.sh's usage line, fan-in.mjs's usage line |
| 4 — used | every landing run (T5) |

## Mutation Log
- 2026-11-04 · 3612157c1* · mutant killed · exit 1 · `scripts/fan-in.mjs` · a skipped or cancelled shard reads as passed · acceptance-sha256:c16840647d15faa8d6025b204c3a5f7167e79396ed2ffa4a9fa5c0c79b2eda2a

## Invariants

`bash scripts/coverage.sh` and `--python` without the new flags run what they run today. The required check's name does not change.

## Risks

`gh api` unavailable in the fan-in: could-not-look, so it fails, never passes.

## Stop Condition

Stop if the API cannot list a run's jobs from inside that run.

## Out of Scope

- The JavaScript surface (T3).

## Verification Log
- 2026-11-04 · 3612157c1* · exit 1 · `set -o pipefail …` · acceptance-sha256:c16840647d15faa8d6025b204c3a5f7167e79396ed2ffa4a9fa5c0c79b2eda2a · ms:208 · test-lock-sha256:fb697f36b3a79aef1a196c0b37f819e11afbce147d376686beb7b6ba90cf3fe1 · test-lock-file:docs/adr/locks/fb697f36b3a79aef1a196c0b37f819e11afbce147d376686beb7b6ba90cf3fe1.lock
  ```
  --- last 10 line(s) of stdout (of 37 after folding 37 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 98.468417

  ✖ failing tests:

  test at tests/coverage-shards.test.mjs:1:1
  ✖ tests/coverage-shards.test.mjs (81.397583ms)
    'test failed'
  ```
- 2026-11-04 · 3612157c1* · exit 0 · `set -o pipefail …` · acceptance-sha256:c16840647d15faa8d6025b204c3a5f7167e79396ed2ffa4a9fa5c0c79b2eda2a · ms:358
