# Task ADR-140-T1: A platform-neutral job-tree routine with a kernel seam

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `winAdopt(ops, pid)`, `winEnd(ops, tree, pid)`, `winTreeOps`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`core/hooks/wintree.go` orders a job tree's adoption and ending through a struct of kernel functions, so every branch runs on
every platform; `core/hooks/wintree_windows.go` fills it from kernel32.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/wintree.go` | add | `winTreeOps`, `winAdopt`, `winEnd`: the order and the fallbacks (ADR-140 Decision 1) |
| `core/hooks/wintree_windows.go` | add | The kernel32 bindings and `winKernel()`; each call checked where it is made |
| `core/hooks/wintree_test.go` | add | Fakes drive every branch: job taken, job refused, resume refused, terminate refused |
| `tests/core-win-tree.test.mjs` | add | Runs `go test -run '^TestWinTree' ./hooks/` and names each test it needs |
| `tests/mutations/core/hooks/wintree.go.json` | add | One mutant per fallback |

## Ordered Steps

1. [S1] Confirm the failing tests exist and are red (TDD red): write `TestWinTreeAdoptResumesWhateverTheJob`, `TestWinTreeAdoptKillsWhatItCannotResume`,
   `TestWinTreeEndPrefersTheJob` and `TestWinTreeEndFallsBackToTaskkill` against fakes, and the Node test that runs them; confirm
   red (the package does not build without the routine).
2. [S2] Implement `wintree.go`: `winAdopt` creates the job and assigns the pid, then resumes either way; on a failed resume it
   kills the child and returns the error. `winEnd` terminates the job when there is one and returns; otherwise, or when
   terminating failed, it runs taskkill.
3. [S3] Implement `wintree_windows.go` with fence.py's checks: a THREADENTRY32 sized by `unsafe.Sizeof`, ResumeThread's
   previous count read (repeat while above 1, at most 16 times), an error naming the call and its last error for each failure,
   and an error when no thread of the pid was found. Build it with `GOOS=windows go vet ./hooks/`.
   [proof: human: GOOS=windows go build and vet exit 0 on the reviewer's machine, and CI's Windows job compiles it]
4. [S4] Add mutants for each fallback and record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/core-win-tree.test.mjs 2>&1 | tee "$out" && grep -q '✔ the job-tree routine takes every branch it claims' "$out" && (cd core && GOOS=windows GOARCH=amd64 go vet ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the job-tree routine takes every branch it claims` | `tests/core-win-tree.test.mjs` | The four Go tests ran and passed | — | S1, S2 |
| `TestWinTreeAdoptResumesWhateverTheJob` | `core/hooks/wintree_test.go` | A refused job still resumes the child | — | S2 |
| `TestWinTreeAdoptKillsWhatItCannotResume` | `core/hooks/wintree_test.go` | A child that cannot be resumed is killed and the error returned | — | S2 |
| `TestWinTreeEndPrefersTheJob` | `core/hooks/wintree_test.go` | A job that terminates means no taskkill | — | S2 |
| `TestWinTreeEndFallsBackToTaskkill` | `core/hooks/wintree_test.go` | No job, or a refused terminate, runs taskkill | — | S2 |
| `TestWinTreeReleaseClosesOnlyAHeldJob` | `core/hooks/wintree_test.go` | Only a held job handle is closed | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `winAdopt`, `winEnd` |
| 2 — selected | T2 and T3 call them |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | CI's Windows job, through T2's scenarios |

## Mutation Log
- 2026-11-10 · 4710a2baf* · mutant killed · exit 1 · `core/hooks/wintree.go` · a suspended child that cannot be resumed would be left alive, waiting out the deadline · acceptance-sha256:2d62a5b61a51b3c7f66958e3d1a68cd02d07509b33a86e4e28e7c9e34f600848

## Invariants

A suspended child is resumed or killed before `winAdopt` returns; it is never left suspended.

## Risks

A fake that does not match the kernel's contract proves the order only; T2's Windows scenario runs the real calls.

## Stop Condition

Stop if `GOOS=windows go vet ./hooks/` cannot build the bindings without a new module dependency.

## Out of Scope

- The Node runner's taskkill (ADR-140 Out of Scope).

## Verification Log
- 2026-11-10 · 4710a2baf* · exit 0 · `set -o pipefail …` · acceptance-sha256:2d62a5b61a51b3c7f66958e3d1a68cd02d07509b33a86e4e28e7c9e34f600848 · ms:2076
