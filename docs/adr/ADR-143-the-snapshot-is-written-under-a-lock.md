# ADR-143: The branch-state snapshot is written under an OS file lock

**Status:** Accepted
**Date:** 2026-11-10
**Owner:** Zy
**Spec:** None — no spec stage; docs/BACKLOG.md §438's third paragraph (the scoped verification of 53e9f6cc) is the input
**Cross-references:** docs/adr/ADR-135-branch-state-runs-in-the-core.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-065-branch-state-serves-its-snapshot.md, docs/adr/ADR-140-a-windows-gate-tree-ends-by-job.md, core/hooks/artifact.go, core/hooks/wintree_windows.go, plugin/scripts/branch-state.mjs
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T1 and T2 each add a catalogue mutant that removes the exclusion they rely on
**Invalidates:** ADR-135 — its Wiring row "Refresh | Bounded inline; no lock file or detached child from the hook" (docs/adr/ADR-135-branch-state-runs-in-the-core.md:72): the hook now locks a file beside the snapshot; still no detached child
**Served-path change:** `qh bridge branch-state` (SessionStart and UserPromptSubmit) holds an OS lock on `<git-dir>/qh-branch-state.json.lock` around each read-modify-replace of the snapshot (`bsWriter`, `bsStampBriefSaid` in core/hooks/branchstate_serve.go), so a hook no longer replaces a snapshot another hook published after it read, and one that cannot take the lock in time writes nothing

## Context

The snapshot's writers read it, decide, and replace it as three separate steps, with no exclusion across processes
(core/hooks/branchstate_serve.go:4 says "No lock file"):

- `bsWriter` (branchstate_serve.go:129-152) reads the current snapshot (:134), keeps it when it is newer and not dated in the
  future (:137-141), merges `said`, `redKey`, `permanentFor` and the `said*` fields from what it read (:143-148), then
  replaces the file (:149). Its callers are `bsCached`'s checkpoint and final write (:203-205; SessionStart and a missing or
  unusable snapshot, :553 and :654) and the due brief's inline refresh (:618).
- `bsStampBriefSaid` (:168-193) reads the snapshot (:172), merges what a brief said (:180-191) and replaces it (:192); called
  at :469, :487, :492 and :632.
- `bsReplaceFile` (:65-93) writes `<file>.<pid>.tmp` and renames it over the snapshot, writing in place when the rename is
  refused (Windows), and removes temporaries older than `bsOrphanMs` (60 s).

So a writer that read before another hook published replaces that publication with what it computed from the older read.
The age guard of ADR-135's review fix narrows this and cannot close it: it compares against `current` from :134, which is
already stale when the other write lands between :134 and :149. The stamp is worse: it rewrites the whole snapshot it read,
`state` included, so a stamp racing a refresh puts the older `state` back. ADR-135 recorded this (ADR-135:110-114) and filed
it in BACKLOG §438: "the fix is a short cross-process lock around publish and stamp, bounded by the hook budget". Node's
hook avoided it with a lock (`qh-branch-state.lock`, branch-state.mjs:848, :869-902) that serialised its one detached
refresher; ADR-135 dropped the refresher and the lock with it.

The class, enumerated 2026-11-10 with `git grep -n -E 'bsReplaceFile\(' -- core ':!*_test.go'`: the definition (:65) and
two writers (:149 in `bsWriter`, :192 in `bsStampBriefSaid`). Every snapshot write in the core goes through one of those two.
Outside the core, `git grep -n -E 'stampBriefSaid\(|replaceFile\(' -- plugin/scripts/branch-state.mjs` finds the Node CLI's
own writers (:789, :820-824, :1084), which no registered hook reaches since ADR-135 T4; the readers (core/hooks/mcp.go:44,
plugin/scripts/statusline.mjs:158) never write.

Hook budgets (plugin/hooks/hooks.json, 2026-11-10): UserPromptSubmit's branch-state registration has a 20 s host timeout,
SessionStart 30 s; ADR-135 Decision 2 holds a due brief's whole refresh to `bsRefreshBudgetMs` = 2000 (:23). The core ships
for linux and darwin (amd64, arm64) and windows/amd64 (`CORE_TARGETS`, plugin/scripts/core-assets.mjs:2-4).

## Existing Primitives Audit

- `claimPassLock` / `releasePassLock` (core/hooks/artifact.go:262-354): an O_CREATE|O_EXCL lock file with a token and a
  deadline, taken over by one claimant once the deadline has passed. **Not reused**, after the cold Codex review of this
  record (2026-11-10, P1): it judges a holder dead by its deadline, not by its death, so a live writer paused past the
  deadline (a slow disk, a descheduled process) loses the lock, resumes, and replaces the newer snapshot its successor
  published; the exclusion the decision needs would not hold. The artifact pass keeps it unchanged; nothing here edits
  artifact.go.
- `publishLease` / `takeLease` (core/hooks/lease.go:63-106): one file per run, never a shared file; not the same shape.
- Node's `refreshBehind` (branch-state.mjs:869-902): age-judged as well, and its name is what
  tests/branch-state-native.test.mjs plants (:158) and asserts absent (:317), with 27 locks on that file
  (`python3 scripts/test-locks.py tests/branch-state-native.test.mjs`, 2026-11-10). Not reused.
- The kernel32 binding pattern of core/hooks/wintree_windows.go:17-32 (`syscall.NewLazyDLL`, `NewProc`): **reused** for
  `LockFileEx` / `UnlockFileEx`, which Go's syscall package does not export on Windows. `syscall.Flock` covers linux and
  darwin. core/go.mod has no dependencies, and this adds none.
- The test-binary child of core/hooks/branchstate_collect_test.go:199-202 (`os.Args[0]` with `-test.run`): **reused** to
  hold the lock in a process that is then killed.

## Decision

1. **An OS lock the kernel releases on death.** `core/hooks/filelock.go` holds `lockFile(path, wait)` and `unlock`: it opens
   (creating) `path` and takes an exclusive, non-blocking lock on it, `syscall.Flock(LOCK_EX|LOCK_NB)` in
   `filelock_unix.go` (`//go:build !windows`) and `LockFileEx(LOCKFILE_EXCLUSIVE_LOCK|LOCKFILE_FAIL_IMMEDIATELY)` over one
   byte in `filelock_windows.go`. A held lock is never taken from a live holder, whatever its age: only the holder's
   `unlock`, its handle's close, or its death releases it. The lock file itself is never removed, since removing it would let
   two writers lock two different files under one name.
2. **Held around each read-modify-replace, nothing else.** `bsWriter` and `bsStampBriefSaid` lock
   `<git-dir>/qh-branch-state.json.lock` before reading the snapshot and unlock after `bsReplaceFile` returns. No command runs
   and no collection waits under it. The name is apart from Node's `qh-branch-state.lock` and matches neither that name nor
   the temporaries' pattern `^qh-branch-state\.json\.\d+\.tmp$`, so the locked native tests (:157-158, :317-318) neither see
   it nor sweep it.
3. **Acquisition is bounded separately from holding.** A refused try is retried every 10 ms for at most `bsLockWaitMs` =
   250 ms; the inline refresh's publish waits at most what is left of its 2 s deadline when that is less, so ADR-135
   Decision 2's "2 s for the whole refresh" still holds. The worst added wall-clock per hook: a due brief, its remaining
   budget plus one stamp (250 ms); `bsCached`, a checkpoint, a final write and a stamp (750 ms), against an 8 s collection and
   a 20 s or 30 s host timeout. Holding has no bound of its own: a holder that hangs makes the others time out and write
   nothing, which is wrong in no direction.
4. **On a refused or failed lock nothing is written and nothing wrong is said.** `bsWriter` then returns the snapshot on disk
   when it is newer than its payload and usable, else its unwritten payload; `bsShown` answers with that, so the hook prints
   either the newer publication or what it itself just observed, never an older state as current. `bsStampBriefSaid` writes
   nothing; the consequence is that the line it printed is not recorded as said, and may be said once more on the next
   prompt (CLAUDE.md §15's unchanged-suppression misses once). A refused publish leaves the snapshot as it was, and the next
   prompt finds it due and refreshes. A lock that cannot be opened at all (a read-only git directory) is the same case.
5. **The header comment changes.** branchstate_serve.go:4's "No lock file" becomes a sentence naming this lock; "no process
   outlives the hook" still holds, and so does the lock, released with the process.

What would make it fail, and how it is shown: a writer that loses the lock while alive, or two writers interleaving. A seam
called between the read and the replace (a package-level `func()`, nil in production) lets a Go test pause a writer holding
the lock for 1.5 s, three times the 500 ms after which the deadline-judged design would have handed the lock to the next
claimant; the second writer must not take it during the pause, and the newer snapshot it then publishes must stand. A test
child process holding the lock and then killed shows the death release. Today the paused writer's replace wins and the newer
snapshot is gone, for `bsWriter` and for `bsStampBriefSaid` alike. Catalogue mutants that make the try succeed
unconditionally turn those tests red. The Windows half runs the same Go tests on CI's Windows job (tests/core-file-lock.test.mjs
is not platform-gated). Microsoft documents that a dead process's locks are released by the system "after the process
terminates", not at a fixed instant; a hook arriving in that gap times out once and writes nothing (Decision 4).

## Alternatives Considered

- **Accept the race** (today). Rejected: the scoped verification of 53e9f6cc measured the shape it leaves, a green read
  published over a newer red one, and the stamp restores an older `state` whenever it races a refresh.
- **Generalise `claimPassLock` with a grace parameter** (this record's first draft). Withdrawn after the cold Codex review
  (2026-11-10, P1): a deadline cannot tell a dead holder from a slow one, so a stamp paused past 500 ms lost its lock to a
  newer publisher and then restored its older snapshot; the draft's own Risks row admitted the double write. A longer deadline
  only moves the threshold. The draft also changed the artifact pass's caller, whose only test is of the Node copy
  (tests/artifact-pass-behind.test.mjs:20), the review's P2; leaving artifact.go alone removes that exposure.
- **Reclaim an O_EXCL lock only when its pid is dead.** Rejected: a pid is reused, and asking whether a Windows pid is alive
  is a second per-platform probe; the kernel already knows, and an OS lock asks it directly.
- **Compare-and-swap through a version counter and a retried rename.** Rejected: a rename replaces unconditionally on POSIX and
  Windows; nothing makes "replace only if still version N" atomic across processes without a lock.
- **An OS advisory lock** (`flock`, `LockFileEx`) was rejected in the first draft for needing two per-platform files. Re-weighed
  after P1 and chosen: the two files are small, the binding pattern already exists (ADR-140's wintree_windows.go), and release
  on death is exactly the property the age-judged lock lacks.
- **Hold the lock across the whole refresh**, as Node's lock spanned its refresher. Rejected: a 2 s critical section makes
  every concurrent prompt wait or skip; only the read-modify-replace needs exclusion.
- **Reuse Node's `qh-branch-state.lock`.** Rejected: the locked native tests plant it (:158) and assert it absent after a
  native refresh (:317).

## Component / Boundary Impact

None — internal to the core's hooks package (`core/hooks`). `filelock*.go` has one reason to change: how the OS gives a
process an exclusive lock on a file. Branch state is its only caller; the artifact pass keeps its own lock.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `<git-dir>/qh-branch-state.json.lock` | new file, created on first use and never removed; locked only while a hook holds it | core/hooks/branchstate_serve.go (T2) | other branch-state hooks |
| `lockFile(path, wait)`, `unlock` | new, internal | core/hooks/filelock.go (T1) | branchstate_serve.go (T2) |
| `qh-branch-state.json` | schema unchanged; a writer that cannot lock writes nothing | T2 | statusline.mjs, core/hooks/mcp.go, the Node CLI |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `lockFile(path, wait)` / `unlock` | T1 | T2 | No — new |

## Implementation

See `ADR-143-the-snapshot-is-written-under-a-lock/tasks/README.md`.

## Consequences

- **Positive:** a published snapshot is never replaced by a writer that read before it, however long that writer paused; a
  stamp no longer restores an older `state`; a dead holder's lock is released by the kernel, not by a timer.
- **Negative:** a hook may wait up to 250 ms per locked step; a refused lock drops a publish (the next prompt refreshes) or a
  stamp (a line may be said once more). A small file stays in the git directory. Per-platform code whose Windows half runs
  only on Windows (CI's job and peers).
- **Neutral:** the artifact pass's lock is untouched.

## Out of Scope

- The Node CLI's own writers (`branch-state.mjs` :820-824, :1084), which a person runs by hand; a hand run can still race a hook (permanent: boundary: no registered hook reaches them since ADR-135 T4, and they are the parity oracle the locked tests compare against)
- The readers (core/hooks/mcp.go:44, plugin/scripts/statusline.mjs:158) (permanent: boundary: a reader needs no lock, since a replace is a rename; the Windows in-place fallback can show a torn file, which parses as no snapshot, as today)
- The artifact pass's deadline-judged lock (`claimPassLock`, core/hooks/artifact.go:262) and its missing Go test (permanent: boundary: this record does not change it; whether its own steal-from-a-live-holder shape matters is that pass's question, for its own record)
- A filesystem where `flock` is not honoured across hosts (permanent: boundary: the git directory is local in every supported setup)
- BACKLOG §438's other open items, the Node processes the hooks start and `bsRefreshPublishable`'s call site (deferred: docs/BACKLOG.md §438)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A holder hangs inside the read-modify-replace | Low | Low | Others time out and write nothing (Decision 4); the hook's own deadline ends it, and the kernel releases the lock |
| Windows releases a dead holder's lock late | Low | Low | One later hook times out and writes nothing; the next one locks |
| A stamp after a refresh it waited for marks the newer state with the older text as `said` | Low | Low | The brief compares text, so a newer state with different text is still said; unchanged from today |
| The interleave tests depend on timing on a slow runner | Med | Low | Each test sets `bsLockWaitMs` itself; the refused-lock bound is counted through a seam, not timed (CLAUDE.md §7) |

## Rollback

Revert T2's commit, then T1's: the hooks go back to unlocked writes. A `qh-branch-state.json.lock` left in a git directory is
ignored by the reverted build and can be deleted by hand; the snapshot's schema never changed, so no snapshot needs migrating.

## Follow-ups

- [ ] Close the third paragraph of docs/BACKLOG.md §438 once T2 is done.
