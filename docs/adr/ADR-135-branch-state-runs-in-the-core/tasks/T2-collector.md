# Task ADR-135-T2: The core collects the git, release and CI halves under one budget

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `collectBranchState`
**Consumes:** `branchstate.go` pure functions (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`collectBranchState` gathers what `collect` in branch-state.mjs gathers, through one seam with a total budget, `LC_ALL=C`
and `GIT_OPTIONAL_LOCKS=0` on git, and the git and release halves before `gh`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/branchstate_collect.go` | add | Collection, budget seam, review ledger reader, loose-object parents |
| `core/hooks/branchstate_collect_test.go` | add | Replays stubbed command answers |
| `tests/mutations/core/hooks/branchstate_collect.go.json` | add | A dropped `LC_ALL=C` or budget is noticed |

## Ordered Steps

1. [S1] Write `TestBranchStateCollect` cases from the `run` stubs in `tests/branch-state.test.mjs`: no tags (positive, under a non-English `LANG`), describe failure, spent budget marks COULD NOT LOOK, non-GitHub remote asks no `gh`, detached HEAD lists by commit, stale page retried by commit with `land/<sha>`, job-view budget names unread workflows. Confirm they fail first.
2. [S2] Implement the collector with an injectable runner and clock.
3. [S3] Add mutants dropping `LC_ALL=C` and the budget check; record them killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
cd core && go test -count=1 -v -run '^TestBranchStateCollect' ./hooks/ 2>&1 | tee "$out" && ! grep -qE 'no tests to run|^FAIL|--- FAIL' "$out" && grep -q -- '--- PASS: TestBranchStateCollect' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `TestBranchStateCollect` | `core/hooks/branchstate_collect_test.go` | Every collection branch named in S1 | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `collectBranchState` |
| 2 — selected | T3 |
| 3 — discoverable | T4 |
| 4 — used | T4 |

## Mutation Log
- 2026-11-01 · 01f17307* · mutant killed · exit 1 · `core/hooks/branchstate_collect.go` · the real-runner subtest reads the child env: LC_ALL came back lt_LT.UTF-8, not C, and the git alias subtest read lt_LT.UTF-8|0; mutate.mjs case RED · acceptance-sha256:9603b5c8b287e9484e9c6214d76c3cc8ad26ee4ea36a5fd076cec470312101dd
- 2026-11-01 · 01f17307* · mutant killed · exit 1 · `core/hooks/branchstate_collect.go` · subtests budget spent before the remotes, before the release half, before the first command, and budgeted gives each command the remainder failed: past the deadline the commands ran instead of answering budget-spent · acceptance-sha256:9603b5c8b287e9484e9c6214d76c3cc8ad26ee4ea36a5fd076cec470312101dd
- 2026-11-01 · 01f17307* · mutant killed · exit 1 · `core/hooks/branchstate_collect.go` · subtests land green, land red, empty listing land 40 and 64 failed: the land/<sha> run was dropped by the retry filter · acceptance-sha256:9603b5c8b287e9484e9c6214d76c3cc8ad26ee4ea36a5fd076cec470312101dd

## Invariants

Every non-answer is COULD NOT LOOK with its reason, never silence (ADR-005).

## Risks

`gh` output shapes are only as covered as the stubs; they come from the Node tests, which were measured.

## Stop Condition

Stop if a Node branch has no stub to replay; add the case to the record first.

## Out of Scope

- Cache and refresh (T3).

## Verification Log
- 2026-11-01 · 01f17307* · exit 1 · `set -o pipefail …` · acceptance-sha256:9603b5c8b287e9484e9c6214d76c3cc8ad26ee4ea36a5fd076cec470312101dd · ms:198 · test-lock-sha256:91a2641cac19ce519ac0a1a35dd0a1f873f814ba7f46d4d2af5e66f2c877ff88 · test-lock-file:docs/adr/locks/91a2641cac19ce519ac0a1a35dd0a1f873f814ba7f46d4d2af5e66f2c877ff88.lock
  ```
  --- last 10 line(s) of stdout (of 14 after folding 14 raw)
  hooks/branchstate_collect_test.go:47:19: undefined: bsAnswer
  hooks/branchstate_collect_test.go:55:12: undefined: bsAnswer
  hooks/branchstate_collect_test.go:59:12: undefined: bsAnswer
  hooks/branchstate_collect_test.go:70:12: undefined: bsAnswer
  hooks/branchstate_collect_test.go:72:11: undefined: bsAnswer
  hooks/branchstate_collect_test.go:74:10: undefined: bsAnswer
  hooks/branchstate_collect_test.go:80:29: undefined: bsAnswer
  hooks/branchstate_collect_test.go:80:29: too many errors
  FAIL	github.com/D3-lt/quality-harness/core/hooks [build failed]
  FAIL
  ```
- 2026-11-01 · 01f17307* · exit 0 · `set -o pipefail …` · acceptance-sha256:9603b5c8b287e9484e9c6214d76c3cc8ad26ee4ea36a5fd076cec470312101dd · ms:749
- 2026-11-01 · 01f17307* · exit 0 · `set -o pipefail …` · acceptance-sha256:9603b5c8b287e9484e9c6214d76c3cc8ad26ee4ea36a5fd076cec470312101dd · ms:1339
- 2026-11-01 · 01f17307* · exit 0 · `set -o pipefail …` · acceptance-sha256:9603b5c8b287e9484e9c6214d76c3cc8ad26ee4ea36a5fd076cec470312101dd · ms:1126
- 2026-11-01 · 01f17307* · exit 0 · `set -o pipefail …` · acceptance-sha256:9603b5c8b287e9484e9c6214d76c3cc8ad26ee4ea36a5fd076cec470312101dd · ms:1138
