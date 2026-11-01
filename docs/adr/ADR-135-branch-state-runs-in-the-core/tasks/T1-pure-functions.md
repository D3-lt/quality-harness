# Task ADR-135-T1: The core's pure branch-state functions answer as Node's do

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `branchstate.go` pure functions
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Go versions of `headRuns`, `render`, `ciRed`, `redKey`, `unknownKey`, `briefUnchanged`, `movedSince`, `pastShowCap`,
`unchangedButOwnCommits` and `snapshotKey` give the Node functions' answers on every corpus row.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/branchstate.go` | add | The pure functions |
| `core/hooks/branchstate_parity_test.go` | add | Answers the corpus rows (`QH_BRANCH_STATE_CORPUS`) |
| `tests/branch-state-parity.test.mjs` | add | Builds rows from the Node functions and runs the Go test |
| `tests/mutations/core/hooks/branchstate.go.json` | add | A changed render or key is noticed |

## Ordered Steps

1. [S1] Write `tests/branch-state-parity.test.mjs`: build rows from the Node exports over the state shapes `tests/branch-state.test.mjs` uses (looked/not, red, running, green with skipped jobs, tip anchor, COULD NOT LOOK notes, release blocked, unreviewed counts), write them to a corpus, run `go test -run '^TestBranchStateParity$' ./hooks/` with `QH_BRANCH_STATE_CORPUS`, and require "N rows compared, 0 disagreements". Confirm it fails before the Go side exists.
2. [S2] Port the functions into `core/hooks/branchstate.go` and answer each row in `branchstate_parity_test.go`.
3. [S3] Add catalogue mutants on the render's COULD NOT LOOK line and on `redKey`, and record them killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/branch-state-parity.test.mjs 2>&1 | tee "$out" && grep -q '✔ the core answers every branch-state row as the Node functions do' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the core answers every branch-state row as the Node functions do` | `tests/branch-state-parity.test.mjs` | Row-for-row parity, and that rows were compared | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `core/hooks/branchstate.go` |
| 2 — selected | Not yet; T3 calls it |
| 3 — discoverable | Not yet; T4 |
| 4 — used | Not yet; T4 |

## Mutation Log
- 2026-11-01 · 303eedca* · mutant killed · exit 1 · `core/hooks/branchstate.go` · Changing the Go render of an unread CI makes the parity test report disagreements against the Node render. · acceptance-sha256:7d618160b972c36465fae5f2fea7c04e7f3160912319458fe0e1b247193ea784
- 2026-11-01 · 303eedca* · mutant killed · exit 1 · `core/hooks/branchstate.go` · An unsorted failed-job list changes the Go red key, and the parity rows built from unsorted failures disagree. · acceptance-sha256:7d618160b972c36465fae5f2fea7c04e7f3160912319458fe0e1b247193ea784

## Invariants

The Node functions and their locked tests are unchanged.

## Risks

A corpus that omits a shape proves nothing about it; the rows follow the locked test file's states.

## Stop Condition

Stop if a Node function depends on state the corpus cannot carry; name it in the record.

## Out of Scope

- Collection (T2) and serving (T3).

## Verification Log
- 2026-11-01 · 303eedca* · exit 1 · `set -o pipefail …` · acceptance-sha256:7d618160b972c36465fae5f2fea7c04e7f3160912319458fe0e1b247193ea784 · ms:708 · test-lock-sha256:e6f39fa811d8b94c5ae5992d0bc3eab3713040d3c8b41783e3720d8df218ba43 · test-lock-file:docs/adr/locks/e6f39fa811d8b94c5ae5992d0bc3eab3713040d3c8b41783e3720d8df218ba43.lock
  ```
  --- last 10 line(s) of stdout (of 33 after folding 33 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: 'testing: warning: no tests to run\nPASS\nok  \tgithub.com/D3-lt/quality-harness/core/hooks\t0.005s [no tests to run]\n\n',
      expected: /1424 rows compared, 0 disagreements/,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-11-01 · 303eedca* · exit 0 · `set -o pipefail …` · acceptance-sha256:7d618160b972c36465fae5f2fea7c04e7f3160912319458fe0e1b247193ea784 · ms:377
- 2026-11-01 · 303eedca* · exit 0 · `set -o pipefail …` · acceptance-sha256:7d618160b972c36465fae5f2fea7c04e7f3160912319458fe0e1b247193ea784 · ms:797
- 2026-11-01 · 303eedca* · exit 0 · `set -o pipefail …` · acceptance-sha256:7d618160b972c36465fae5f2fea7c04e7f3160912319458fe0e1b247193ea784 · ms:801
