# Task ADR-140-T3: run() adopts its command into a job

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `winWatch(ops, ctx, pid)`
**Consumes:** `winAdopt(ops, pid)`, `winEnd(ops, tree, pid)` (T1)
**Data dependency:** needs a Windows run: CI's Windows job runs proc_tree_windows_test.go's real job calls through Git Bash
**Proof map:** v1

## Goal

On Windows `bsRun` (every `run()`, the artifact batch's Node runner included) starts its command suspended inside a job, and
ends the job at the deadline and once Wait returns, as the Unix process group is ended.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/wintree.go` | edit | `winWatch`: adopt, end at the deadline, end and release at return |
| `core/hooks/wintree_test.go` | edit | The three `TestWinTreeWatch` tests against fakes |
| `core/hooks/bstree_windows.go` | edit | `bsEndTree` suspends, `bsWatchTree` is `winWatch` over kernel32 |
| `core/hooks/bstree_unix.go` | edit | `bsWatchTree` also returns an error, always nil |
| `core/hooks/branchstate_collect.go` | edit | `bsRun` reports a failed adoption as a failed run |
| `core/hooks/proc_tree_windows_test.go` | add | The two `TestRunEnds` scenarios on Windows with Git Bash |
| `tests/core-run-tree.test.mjs` | edit | Runs on Windows too |
| `tests/core-win-tree.test.mjs` | edit | Names the `TestWinTreeWatch` tests |
| `tests/mutations/core/hooks/wintree.go.json` | edit | Each end in `winWatch` dropped is noticed |

## Ordered Steps

1. [S1] Confirm the failing tests exist and are red (TDD red): write the three `TestWinTreeWatch` tests against fakes.
2. [S2] Implement `winWatch` and the Windows `bsEndTree` / `bsWatchTree`; `bsRun` reports a failed adoption.
3. [S3] Add the Windows twins of `TestRunEndsTheTree` and `TestRunEndsWhatAFinishedCommandLeft`, drop the Windows skip in
   tests/core-run-tree.test.mjs, land, and read the Windows job's result.
   [proof: human: the CI Windows job log at the landing sha shows tests/core-run-tree.test.mjs passing, not skipped]
4. [S4] Add the mutants and record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/core-win-tree.test.mjs tests/core-run-tree.test.mjs 2>&1 | tee "$out" && grep -q '✔ a run() tree is ended at the deadline and when the command returns' "$out" && grep -q "✔ the core's run() ends the tree it started" "$out" && (cd core && GOOS=windows GOARCH=amd64 go vet ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a run() tree is ended at the deadline and when the command returns` | `tests/core-win-tree.test.mjs` | The three watch tests ran and passed | — | S1, S2 |
| `TestWinTreeWatchEndsAtTheDeadline` | `core/hooks/wintree_test.go` | The deadline ends the job | — | S2 |
| `TestWinTreeWatchEndsWhatTheCommandLeft` | `core/hooks/wintree_test.go` | Return ends and releases the job | — | S2 |
| `TestWinTreeWatchKillsWhatItCannotResume` | `core/hooks/wintree_test.go` | A child that cannot be resumed is a failed run | — | S2 |
| `the core's run() ends the tree it started` | `tests/core-run-tree.test.mjs` | The real scenarios, on Windows through the job | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `winWatch` |
| 2 — selected | `bsWatchTree` on Windows, called by `bsRun` |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | every `run()` on Windows; CI's Windows job runs the real scenarios |

## Mutation Log
- 2026-11-10 · 4710a2baf* · mutant killed · exit 1 · `core/hooks/wintree.go` · run()'s deadline would leave the job running until the command returned by itself · acceptance-sha256:b6184d0c662fa3a1c9546023ba5b35479a80edb564a5c92d22cd7705bd803306

## Invariants

On Unix `bsRun` behaves as before: `bsWatchTree` never returns an error there.

## Risks

A git daemon started without breakaway is ended with its command (ADR-140 Risks).

## Stop Condition

Stop if the Windows scenarios cannot record the grandchild's Windows pid.

## Out of Scope

- `executeNodeCLI` (ADR-140 Out of Scope).

## Verification Log
- 2026-11-10 · 4710a2baf* · exit 0 · `set -o pipefail …` · acceptance-sha256:b6184d0c662fa3a1c9546023ba5b35479a80edb564a5c92d22cd7705bd803306 · ms:2450
