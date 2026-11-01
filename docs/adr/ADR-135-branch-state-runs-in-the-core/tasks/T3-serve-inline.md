# Task ADR-135-T3: The core serves, suppresses and refreshes branch state inline

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** native `qh bridge branch-state`
**Consumes:** `collectBranchState` (T2), `branchstate.go` pure functions (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The core serves `branch-state [--brief] [--cached N]` with the Node CLI's cache, suppression and output, refreshing a stale
cache inline under a 2 s network budget and never starting a detached process.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/branchstate_serve.go` | add | Cache read and replace, suppression keys, own-commit walk, inline refresh |
| `core/cmd/qh/main.go` | edit | Selects the native handler behind a flag until T4 |
| `tests/branch-state-native.test.mjs` | add | The subprocess scenarios against the native command |
| `tests/mutations/core/hooks/branchstate_serve.go.json` | add | Suppression and budget mutants |

## Ordered Steps

1. [S1] Write `tests/branch-state-native.test.mjs`: the scenarios of the locked subprocess tests (cwd, moved, own-commit, quiet, cap, red said once, unknown said once), run against `qh bridge branch-state` with the native flag, plus a stale cache with a `gh` stub slower than the budget that must print the cached answer marked stale and leave no process behind. Confirm it fails first.
2. [S2] Implement serving, with Windows replace-over-open fallback as branch-state.mjs:782-807.
3. [S3] Add mutants on the suppression key and the refresh budget; record them killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/branch-state-native.test.mjs 2>&1 | tee "$out" && grep -q '✔ a stale cache past the budget is served marked stale and nothing outlives the hook' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a stale cache past the budget is served marked stale and nothing outlives the hook` | `tests/branch-state-native.test.mjs` | Decision 2 | — | S1, S2 |
| `the native branch state says what the Node one says in every locked scenario` | `tests/branch-state-native.test.mjs` | Parity over the subprocess scenarios | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `branchstate_serve.go` |
| 2 — selected | `qh bridge branch-state` behind the native flag |
| 3 — discoverable | T4 |
| 4 — used | T4 |

## Mutation Log

## Invariants

Exit 0 on every path; an age in the output stays out of the suppression key (CLAUDE.md §19).

## Risks

A prompt can wait up to the budget on a stale cache; the cap is set by the test, not inherited (CLAUDE.md §7).

## Stop Condition

Stop if a locked scenario cannot be reproduced against the native command without editing the locked test.

## Out of Scope

- Switching the hooks (T4).

## Verification Log
