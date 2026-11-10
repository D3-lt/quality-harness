# Task ADR-143-T2: The snapshot's writers hold the file lock

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `bsLockWaitMs`, `qh-branch-state.json.lock`
**Consumes:** `lockFile(path, wait)` (T1), `unlock` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`bsWriter` and `bsStampBriefSaid` (core/hooks/branchstate_serve.go:129-152, :168-193) lock `<store>.lock` through T1's OS
lock before reading the snapshot and unlock after replacing it, wait at most `bsLockWaitMs` (or what is left of the inline
refresh's deadline), and write nothing when the lock is refused (ADR-143 Decisions 2-5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/branchstate_serve.go` | modify | `bsLockWaitMs`, the read-to-replace seam, the lock around :134-149 and :172-192, the refused-lock answer, `bsWriterBy` for the deadline at :618, and the header comment at :4 |
| `core/hooks/branchstate_serve_test.go` | modify | Five new tests beside the existing ones; none of the existing ones change |
| `tests/branch-state-collect.test.mjs` | modify | The five tests join the `serving` list (:22-23) and are asserted PASS by name; 0 locks on this file (test-locks.py, 2026-11-10) |
| `tests/mutations/core/hooks/branchstate_serve.go.json` | modify | A mutant that skips the snapshot lock |

## Ordered Steps

1. [S1] Confirm the failing tests exist and are red (TDD red): add the seam `bsBetweenReadAndReplace func()` (nil in
   production) called after the read and before `bsReplaceFile` in both writers, then write
   `TestBranchStateLockedPublishKeepsTheNewer` (writer A pauses in the seam; writer B publishes a newer snapshot; the newer
   one must stand), `TestBranchStateLockedStampKeepsTheNewer` (a stamp pauses in the seam; a newer snapshot is published;
   its `state` must stand with the stamp's `said` carried) and `TestBranchStateLiveHolderIsNotOvertaken` (the Codex review's
   P1 case: a stamp holds the lock paused 1.5 s in the seam, three times the 500 ms the withdrawn deadline design allowed;
   a publisher of a newer snapshot with `bsLockWaitMs` raised to 5 s has not written at the 1 s mark, writes after the stamp
   unlocks, and its snapshot stands with the stamp's `said`); confirm all three red today: the paused writer's replace wins.
2. [S2] Write `TestBranchStateRefusedLockWritesNothing` (the lock held by another open for the whole call: `bsWriter` writes
   nothing and returns the newer usable snapshot on disk or its payload, and `bsStampBriefSaid` writes nothing; the bound is
   shown by T1's try-count seam, not by wall-clock) and `TestBranchStateLockNameIsApartFromNode` (the lock path is
   `qh-branch-state.json.lock`, which matches neither `qh-branch-state.lock` nor `^qh-branch-state\.json\.\d+\.tmp$`, the
   names tests/branch-state-native.test.mjs:317-318 and tests/branch-state.test.mjs:1724 check). `bsLockWaitMs` is a `var`,
   as `bsRefreshBudgetMs` is (:23), and each test sets it: the interleave tests raise it well past their pause, so a slow
   Windows runner cannot flake them (CLAUDE.md §7).
3. [S3] Implement: `lockFile(store+".lock", wait)`. `bsWriter(store)` keeps its signature and waits `bsLockWaitMs`, so
   `TestBranchStateWriterKeepsANewerSnapshot` and `TestBranchStateCachedAnswersWithTheKeptSnapshot` are unchanged; a second
   constructor, `bsWriterBy(store, deadline)`, used only by the inline refresh at :618, waits `min(bsLockWaitMs, deadline -
   now)` and publishes nothing when that is not positive. `unlock` after `bsReplaceFile`; on a refused or failed lock return as
   Decision 4 says. Rewrite the header comment at :4.
4. [S4] Add the five tests to tests/branch-state-collect.test.mjs's `serving` list and assert each `--- PASS` line by name.
5. [S5] Run the locked native scenarios unchanged: `node --test tests/branch-state-native.test.mjs` passes, including
   "no lock file" (:317) and "no temporary left" (:318). [proof: acceptance]
6. [S6] Add the catalogue mutant that skips the lock (the writer proceeds as if `lockFile` succeeded without calling it) and
   record it killed; then run every catalogue entry in tests/mutations/core/hooks/branchstate_serve.go.json (eight before
   this task, two of them over `bsWriter`'s body at :138 and the caller at :157), since wrapping the body can leave a `from`
   STALE or a mutant GREEN, and either is a finding about this task, not a pass (CLAUDE.md §18). [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/branch-state-collect.test.mjs tests/branch-state-native.test.mjs 2>&1 | tee "$out" && (cd core && go test -count=1 -v -run '^TestBranchState(LockedPublishKeepsTheNewer|LockedStampKeepsTheNewer|LiveHolderIsNotOvertaken|RefusedLockWritesNothing|LockNameIsApartFromNode)$' ./hooks/ 2>&1 | tee -a "$out") && grep -q -- '--- PASS: TestBranchStateLockedPublishKeepsTheNewer' "$out" && grep -q -- '--- PASS: TestBranchStateLockedStampKeepsTheNewer' "$out" && grep -q -- '--- PASS: TestBranchStateLiveHolderIsNotOvertaken' "$out" && grep -q -- '--- PASS: TestBranchStateRefusedLockWritesNothing' "$out" && grep -q -- '--- PASS: TestBranchStateLockNameIsApartFromNode' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `TestBranchStateLockedPublishKeepsTheNewer` | `core/hooks/branchstate_serve_test.go` | A publish paused between read and replace does not roll back a newer publication | — | S1, S3 |
| `TestBranchStateLockedStampKeepsTheNewer` | `core/hooks/branchstate_serve_test.go` | A stamp paused between read and replace does not restore an older `state` | — | S1, S3 |
| `TestBranchStateLiveHolderIsNotOvertaken` | `core/hooks/branchstate_serve_test.go` | A live stamp paused 1.5 s keeps the lock; the newer publication waits for it and survives | — | S1, S3 |
| `TestBranchStateRefusedLockWritesNothing` | `core/hooks/branchstate_serve_test.go` | A refused lock writes nothing, answers with no older state, and tries no more than its bound | — | S2, S3 |
| `TestBranchStateLockNameIsApartFromNode` | `core/hooks/branchstate_serve_test.go` | The lock file is invisible to the locked native assertions | — | S2, S3 |
| `the core collects branch state as the Node collect does` | `tests/branch-state-collect.test.mjs` | The serving tests, the five new ones among them, ran and passed | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `bsLockWaitMs`, `bsWriterBy` and the lock path |
| 2 — selected | `bsWriter`, `bsWriterBy` and `bsStampBriefSaid` call `lockFile`; the mutant that skips it is RED |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | every `qh bridge branch-state` publish and stamp; tests/branch-state-native.test.mjs drives the binary |

## Mutation Log

## Invariants

No snapshot write happens without the lock held; a live holder is never overtaken; the lock is never held across a command
or a collection; a refused lock writes nothing; the inline refresh's publish never waits past its 2 s deadline.

## Risks

A seam called in production by mistake would pause a hook; it is nil unless a test sets it, and the tests reset it. The
interleave tests depend on timing: each sets `bsLockWaitMs` itself, far above its pause, rather than inheriting the product's
250 ms, and the refused-lock bound is counted, not timed.

## Stop Condition

Stop if tests/branch-state-native.test.mjs needs any change to pass, since 27 tasks lock it: the lock name or the release is
then wrong, not the test.

## Out of Scope

- The Node CLI's writers (ADR-143 Out of Scope).

## Verification Log
