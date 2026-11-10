# Task ADR-143-T1: An OS file lock the kernel releases on death

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `lockFile(path, wait)`, `unlock`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`core/hooks/filelock.go` gives a hook an exclusive lock on a file that no other process can take while the holder lives, that
the kernel releases when the holder dies, and whose acquisition waits at most a given bound (ADR-143 Decisions 1 and 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/filelock.go` | add | `lockFile(path, wait)`: open or create, try, retry every 10 ms to `wait`; `unlock`; the try-count seam |
| `core/hooks/filelock_unix.go` | add | `//go:build !windows`: the try is `syscall.Flock(LOCK_EX|LOCK_NB)`, the release `LOCK_UN` and close |
| `core/hooks/filelock_windows.go` | add | `LockFileEx` / `UnlockFileEx` over one byte, bound through kernel32 as wintree_windows.go:17-32 does |
| `core/hooks/filelock_test.go` | add | The lock's Go tests, run on every platform against the real OS call |
| `tests/core-file-lock.test.mjs` | add | Runs `go test -run '^TestFileLock' ./hooks/` and names each test it needs; not platform-gated, so CI's Windows job runs it |
| `tests/mutations/core/hooks/filelock_unix.go.json` | add | A mutant whose try always succeeds |

## Ordered Steps

1. [S1] Confirm the failing tests exist and are red (TDD red): write `TestFileLockRefusesWhileHeld`,
   `TestFileLockLiveHolderKeepsItPastAnyAge` (a holder keeps the lock for 1.5 s, three times the 500 ms after which the
   withdrawn deadline design handed it on; a claimant retrying with a 1 s wait throughout fails, and claims at once after
   `unlock`), `TestFileLockDeathReleasesIt` (a test-binary child, as branchstate_collect_test.go:199-202 starts one, locks the
   file and blocks; the parent's try fails, the child is killed, and the parent then locks within a bounded wait), and
   `TestFileLockWaitIsBounded` (a held lock: the try count through the seam stops at the bound, not a wall-clock check), and
   the Node test that runs them; confirm red (the package does not build without `lockFile`).
2. [S2] Implement `filelock.go` and `filelock_unix.go`. The lock file is opened with O_CREATE and never removed (ADR-143
   Decision 1).
3. [S3] Implement `filelock_windows.go`: LOCKFILE_EXCLUSIVE_LOCK|LOCKFILE_FAIL_IMMEDIATELY over byte 0 with a zeroed
   OVERLAPPED; ERROR_LOCK_VIOLATION is "held", any other error is returned naming the call. Build it with
   `GOOS=windows GOARCH=amd64 go vet ./hooks/`.
   [proof: human: the vet exits 0 on the reviewer's machine, and CI's Windows job runs S1's tests against LockFileEx]
4. [S4] Add the mutant that makes the unix try return success without calling Flock, and record it killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/core-file-lock.test.mjs 2>&1 | tee "$out" && grep -q '✔ the file lock is held until its holder releases it or dies' "$out" && (cd core && GOOS=windows GOARCH=amd64 go vet ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the file lock is held until its holder releases it or dies` | `tests/core-file-lock.test.mjs` | The four Go tests ran and passed | — | S1, S2 |
| `TestFileLockRefusesWhileHeld` | `core/hooks/filelock_test.go` | A second lock on the same path, from another open, is refused while the first is held | — | S2 |
| `TestFileLockLiveHolderKeepsItPastAnyAge` | `core/hooks/filelock_test.go` | A live holder paused 1.5 s keeps the lock; it is taken only after unlock | — | S2 |
| `TestFileLockDeathReleasesIt` | `core/hooks/filelock_test.go` | A killed child's lock is released by the kernel | — | S2 |
| `TestFileLockWaitIsBounded` | `core/hooks/filelock_test.go` | Acquisition gives up at its bound and reports refusal | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `lockFile`, `unlock` |
| 2 — selected | T2's snapshot writers call it; T2's mutant removing that call is RED |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | every `qh bridge branch-state` publish and stamp, through T2 |

## Mutation Log

## Invariants

A lock is never acquired while another live process or handle holds it; acquisition never waits past its bound; the lock
file is never removed.

## Risks

flock and LockFileEx lock per open file description and per handle, so two opens in one test process exclude each other as two
processes do; the death test uses a real child so the claim does not rest on that alone.

## Stop Condition

Stop if `GOOS=windows go vet ./hooks/` cannot build the binding without a new module dependency, or if any change to
core/hooks/artifact.go turns out to be needed (ADR-143 leaves it untouched).

## Out of Scope

- The artifact pass's lock (ADR-143 Out of Scope).

## Verification Log
