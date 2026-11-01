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

## Invariants

The Node functions and their locked tests are unchanged.

## Risks

A corpus that omits a shape proves nothing about it; the rows follow the locked test file's states.

## Stop Condition

Stop if a Node function depends on state the corpus cannot carry; name it in the record.

## Out of Scope

- Collection (T2) and serving (T3).

## Verification Log
