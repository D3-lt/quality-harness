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
| `core/hooks/bridge.go` | edit | `RunBridge` selects the native handler behind `QH_BRANCH_STATE_NATIVE=1` until T4 |
| `core/hooks/eventlog.go` | edit | The session log read without a git spawn, as Node's `{ spawn: false }` |
| `core/hooks/branchstate_serve_test.go` | add | `commitParents`, `ownCommitWalk` and `replaceFile` units |
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
- 2026-11-01 · 17c620dd* · mutant killed · exit 1 · `core/hooks/branchstate_serve.go` · mutate.mjs: the stale-cache test and the moved Decision-2 scenario failed with the inline budget at 8000 ms · acceptance-sha256:61d85e49ee2922b3d2583574d68472f6d8e837c861551243fd4714c037d2a55d
- 2026-11-01 · 17c620dd* · mutant killed · exit 1 · `core/hooks/branchstate_serve.go` · mutate.mjs: the red and the no-GitHub parity scenarios failed when the same red run was said in full again · acceptance-sha256:61d85e49ee2922b3d2583574d68472f6d8e837c861551243fd4714c037d2a55d

## Invariants

Exit 0 on every path; an age in the output stays out of the suppression key (CLAUDE.md §19).

## Risks

A prompt can wait up to the budget on a stale cache; the cap is set by the test, not inherited (CLAUDE.md §7).

The 2 s budget is the WHOLE inline collection, git half included (the caller's direction on 2026-11-01); ADR-135 Decision 2
says "2 s for the network half". The wording gap is the owner's to settle; the code follows the whole-collection reading.

A refresh is judged cut when a command was prevented by the budget OR returned at or after its deadline, since a `gh` killed
by its share of the budget answers not-ok without `budget: true`; a command finishing exactly at the deadline is therefore
also counted as cut, and the snapshot is served marked stale.

A child is killed on its timeout, but not its own descendants: a `gh` that forked a grandchild holding its stdout would
keep the hook waiting until that grandchild exits. The real `gh` does not; the stub execs to keep one process.

Node's performance trace (`startPerformanceTrace('branch-state', …)`, QUALITY_HARNESS_TRACE_FILE) is not written by the
native handler: a trace reader sees no branch-state spans while QH_BRANCH_STATE_NATIVE=1, and from T4 on until it is ported.

## Stop Condition

Stop if a locked scenario cannot be reproduced against the native command without editing the locked test.

## Out of Scope

- Switching the hooks (T4).

## Verification Log
- 2026-11-01 · 17c620dd* · exit 1 · `set -o pipefail …` · acceptance-sha256:61d85e49ee2922b3d2583574d68472f6d8e837c861551243fd4714c037d2a55d · ms:4885 · test-lock-sha256:7ef2f56930f2322e22db78dab7bbbe5f8613d6a430e980de0addd7735fbc8575 · test-lock-file:docs/adr/locks/7ef2f56930f2322e22db78dab7bbbe5f8613d6a430e980de0addd7735fbc8575.lock
  ```
  --- last 10 line(s) of stdout (of 320 after folding 332 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 1,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-01 · 17c620dd* · exit 0 · `set -o pipefail …` · acceptance-sha256:61d85e49ee2922b3d2583574d68472f6d8e837c861551243fd4714c037d2a55d · ms:20014
- 2026-11-01 · 17c620dd* · exit 0 · `set -o pipefail …` · acceptance-sha256:61d85e49ee2922b3d2583574d68472f6d8e837c861551243fd4714c037d2a55d · ms:20139
- 2026-11-01 · 17c620dd* · exit 0 · `set -o pipefail …` · acceptance-sha256:61d85e49ee2922b3d2583574d68472f6d8e837c861551243fd4714c037d2a55d · ms:20174
- 2026-11-01 · 01e54810* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:61d85e49ee2922b3d2583574d68472f6d8e837c861551243fd4714c037d2a55d · ms:0 · test-lock-sha256:7ef2f56930f2322e22db78dab7bbbe5f8613d6a430e980de0addd7735fbc8575 · test-lock-file:docs/adr/locks/7ef2f56930f2322e22db78dab7bbbe5f8613d6a430e980de0addd7735fbc8575.lock · test-lock-kind:replace
- 2026-11-01 · 01e54810* · exit 0 · `set -o pipefail …` · acceptance-sha256:61d85e49ee2922b3d2583574d68472f6d8e837c861551243fd4714c037d2a55d · ms:20089
