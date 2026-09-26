# ADR-065: The per-prompt branch-state brief serves its snapshot and refreshes behind the prompt

**Status:** Accepted
**Date:** 2026-09-26
**Owner:** Zy
**Spec:** None — no spec stage; the requirement is BACKLOG §301 Stage 1's measurement
**Cross-references:** docs/BACKLOG.md, docs/research/2026-09-26-model-out-of-the-loop.md, .claude/rules/15-know-what-ci-says.md
**Governs:** plugin/scripts/branch-state.mjs
**Enforced-by:** `branch-state: a due brief is served from the snapshot, not collected on the prompt`
**Invalidates:** none — checked
**Served-path change:** every `UserPromptSubmit` run of `branch-state.mjs --brief --cached 120` answers from its snapshot with no `gh` call on the prompt, and a snapshot whose branch, HEAD or upstream moved is refreshed rather than served as fresh.

## Context

Measured 2026-09-26 with `scripts/session-profile.mjs --attribute` over one 21 MB session transcript of this repository (BACKLOG §301, Stage 1):
- `branch-state.mjs` ran on 57 prompts and averaged 1,609 ms (max 7,462 ms) of the harness's `durationMs`. That is the largest per-prompt cost this plugin has.
- Measured apart the same day, at load 23 on a 10-core machine: a cache hit takes 0.10 s (Node's start), and a miss 1.28 s. Of the miss, the git calls are about 0.4 s and each `gh` call 1.1-2.3 s.
- So the average is prompts more than 120 s apart finding the snapshot expired and paying for the network on the prompt.

Every served snapshot already says its age (`(read Ns ago)`), and its CI line names the run's sha, so a stale answer is marked today. What the clock-only key misses is the events that change the answer:
- a commit;
- a push, which moves the upstream;
- a branch switch at the same sha, where CI is the newest run for the BRANCH.

Inside the 120 s window each of these is served as current.

The owner's direction for v3 (2026-09-26): optimise by measurement rather than by volume. This is the one reader on a hook's prompt path that makes a network call:

```bash
grep -o 'scripts/[a-z-]*\.mjs\|hooks/[a-z-]*\.cmd\|bin/[a-z-]*' plugin/hooks/hooks.json | sort -u
grep -ln "\['gh'\|'gh',\|\"gh\"\|fetch(\|https\.request\|'curl'" plugin/scripts/*.mjs plugin/bin/* plugin/lib/*.py
```

Run 2026-09-26:
- The hook entry points are `branch-state.mjs`, `lifecycle.mjs` and `run-shell-hook.mjs`.
- The only file that spawns `gh` or opens a network request is `branch-state.mjs`.
- The class has one member.

## Existing Primitives Audit

- **`cached()` and `usableCache()`** (`plugin/scripts/branch-state.mjs`) already validate a snapshot and checkpoint the git half before the network half. Reused. The snapshot gains a `key`, and a checkpoint is marked `partial`.
- **`findGitDir()`** (`plugin/scripts/git-directory.mjs`) already locates Git metadata without spawning Git. Reused to read the key from files.
- **`budgeted()`** already bounds a whole collection to 8 s. The refresher reuses it unchanged.
- **`emitCachedBranchState()`** already prints an age suffix and suppresses an unchanged brief. Reused; the suffix says a refresh is running.
- **No detached-process primitive exists in `plugin/`.** The refresher and its lock are new, and deliberately small.

## Decision

1. **A snapshot carries a key**, read from files before collection starts:
   - the raw content of `HEAD` (the symbolic ref, or a detached sha);
   - the sha it resolves to;
   - the sha of its upstream tracking ref, if one is configured.

   A checkpoint written before the network half is marked `partial`.
2. **Both cache-hit sites serve a snapshot as fresh only when all of these hold:** it is usable, within its age, not `partial`, and its key equals the current one. The two sites are `main()`'s early hit and `cached()`'s. A key that cannot be read from files is never equal.
3. **Only the `--brief` path serves a due snapshot.** When a usable snapshot exists but is due, it is printed with `(read Ns ago; refreshing)` and ONE detached `branch-state.mjs --refresh` is started behind the prompt.
   - The refresher collects under the existing 8 s budget and writes the snapshot.
   - An exclusive lock in the git directory keeps it to one.
   - A lock older than the budget plus a margin is reclaimed by an atomic rename, so two reclaimers cannot both start one.
4. **The full report is always collected in the foreground**, as today. That covers SessionStart (not `--brief`) and a `--brief` with no usable snapshot, so a session's one full report is never yesterday's.

What would make this fail:
- a `--brief` run that spawns `gh` while a usable snapshot exists;
- two refreshers at once;
- a snapshot served as fresh after its key moved;
- a hook host kept waiting on the refresher.

All four can be built today. T1 and T2 build them, and the last one runs on all three CI platforms. The latency claim is valid for a host that runs `branch-state` per prompt with a snapshot on disk. It is measured after release by the same `session-profile --attribute` run that produced the baseline, and T2's sign-off records that measurement.

## Alternatives Considered

- **Key CI by commit and keep a completed run for 10 minutes.** It would make fewer `gh` calls. Rejected because every release dispatches a second run on the same sha, and a kept `success` would print the old run while the new one runs, which is the unknown-read-as-green §15 forbids. The latency win comes from moving the call off the prompt, not from making it rarer.
- **A long-lived daemon.** Rejected for now: a persistent process per checkout is a larger surface than one bounded refresher. It stays a Stage 6 option (BACKLOG §301) if the measured latency does not hold.
- **Serve stale at SessionStart too.** Rejected by review. The full report is a session's one complete answer, and a snapshot with no age limit could be yesterday's.
- **Lower the TTL.** Rejected: more misses, each one paid on the prompt.

## Component / Boundary Impact

None — internal to `plugin/scripts/branch-state.mjs`. The refresher is the same script under a new flag, and nothing else starts it.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `.git/qh-branch-state.json` | gains `key` (ref, sha, upstream) and `partial` | `cached()` and the refresher | both cache-hit sites |
| `.git/qh-branch-state.lock` | new: exclusive create, removed on exit, reclaimed by rename when stale | the `--brief` path | the refresher |
| `branch-state.mjs --refresh` | new flag: collect and write the snapshot, print nothing | the `--brief` path (detached spawn) | none |
| the brief's age suffix | `(read Ns ago; refreshing)` while a refresh runs | `emitCachedBranchState` | the session |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `key` and `partial` in the snapshot; `snapshotKey(gitDir)` | T1 | T2 | No — a snapshot without `key` reads as moved and is refreshed |

## Implementation

See `tasks/README.md`:
- T1 keys a snapshot by branch, HEAD and upstream;
- T2 serves a due brief and refreshes it behind the prompt.

## Consequences

- **Positive:**
  - The per-prompt brief stops paying for the network once a snapshot exists.
  - A commit, push or branch switch is never served as the previous state's answer.
- **Negative:**
  - One short-lived detached process per due refresh.
  - One prompt sees the previous answer, marked as such, while the next is collected.
- **Neutral:** SessionStart, and a checkout with no snapshot, cost what they cost today.

## Out of Scope

- A daemon or a native reader (deferred: docs/BACKLOG.md §301 Stage 6)
- Keeping a completed CI answer longer than the existing age (permanent: boundary: a second run on the same sha is routine, and a kept `success` would read an unknown run as green, §15)
- The git half's own cost (deferred: docs/BACKLOG.md §301 Stage 6, after the post-release measurement)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A refresher is orphaned, or refreshers pile up on a loaded machine | Low | Med | one exclusive lock; the 8 s budget ends every command; a stale lock is reclaimed by rename, never waited on; a concurrency test |
| Windows or macOS keeps the hook host waiting on the detached child | Med | Med | `process.execPath`, `detached`, `stdio: 'ignore'`, `windowsHide`, `unref()`; a real-spawn test on all three CI platforms asserts the parent's pipes close before a slow stub `gh` finishes |
| A served stale line is read as current | Low | Med | the suffix names its age and that a refresh is running; the test fixture sets `said` unequal to the text so suppression cannot hide it |

## Rollback

Revert the commit. The old reader ignores the snapshot's new fields, and the lock file is safe to delete. Nothing else persists.

## Follow-ups

- [ ] After release, re-run `session-profile --attribute` on a real session and compare `branch-state`'s `durationMs` with the 1,609 ms baseline (T2's sign-off).
