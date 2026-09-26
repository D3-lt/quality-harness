# Task ADR-065-T2: A due brief is served, and refreshed behind the prompt

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one module and its tests)
**Owner:** unassigned
**Produces:** `branch-state.mjs --refresh`; `.git/qh-branch-state.lock`; the `refreshing` suffix
**Consumes:** `key` and `partial` in the snapshot, `snapshotKey(gitDir)` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `no gh on the brief when a snapshot exists`, `one refresher at a time`, `the full report is collected in the foreground`, `the host is not kept waiting`

## Goal

On `--brief`, when a usable snapshot exists but is due:
- the prompt answers from it with `(read Ns ago; refreshing)`;
- it starts one detached `--refresh` run, guarded by an exclusive lock that is reclaimed atomically when stale.

The full report (no `--brief`), and a `--brief` with no usable snapshot, are collected in the foreground as today.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/branch-state.mjs` | edit | `--refresh` in the flag parser; the `refreshBehind({ spawn, lock, now })` seam; `main()` routes a due brief through it; the suffix |
| `tests/branch-state.test.mjs` | edit | the tests below |
| `tests/mutations.json` | edit | mutants, including the one `Enforced-by` names |
| `plugin/hooks/hooks.json` | read | confirms the per-prompt command is `--brief --cached 120` and SessionStart's is not `--brief` |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red).
2. [S2] Add `--refresh`: gather under `budgeted(BUDGET_MS)`, write the snapshot (with `key`), remove the lock, print nothing, and exit 0.
3. [S3] Add `refreshBehind`:
   - create `<gitDir>/qh-branch-state.lock` with `flag: 'wx'`;
   - on `EEXIST`, reclaim only a lock older than `BUDGET_MS` plus a margin, by renaming it to a unique name and retrying the exclusive create once; otherwise start nothing;
   - spawn `process.execPath` with this script and `--refresh`, with `detached: true`, `stdio: 'ignore'` and `windowsHide: true`, then `unref()`.
4. [S4] In `main()`, only a `--brief` run with a usable but due snapshot is emitted with the suffix and handed to `refreshBehind`. Every other path is unchanged.
5. [S5] Run the fence green, and record mutants with `adr-verify --mutant`:
   - collect in the foreground whenever due;
   - serve stale on the full report;
   - drop the lock check;
   - reclaim by delete-then-create.
   [proof: mutation]
6. [S6] After release, measure one real session with `node scripts/session-profile.mjs <transcript> --attribute`. Record `branch-state`'s `durationMs` average and max in the sign-off, against the 1,609 ms / 7,462 ms baseline. [proof: human: the post-release durationMs of branch-state read from a real transcript]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/branch-state.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (a due brief is served and one refresher starts behind the prompt|the full report and a brief with no snapshot are collected in the foreground|one refresher at a time, and a stale lock is reclaimed once|the refresher writes the snapshot and the host is not kept waiting)' | grep -qx 4
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a due brief is served and one refresher starts behind the prompt` | `tests/branch-state.test.mjs` | with a snapshot past its age, and `said` unequal to the text, the `run` seam records no `gh` call, the output carries `refreshing`, and the spawn seam is called once; with a fresh snapshot (the clean twin) it is not called | none | S1, S4 |
| `the full report and a brief with no snapshot are collected in the foreground` | `tests/branch-state.test.mjs` | the full report with a stale snapshot, and `--brief` with none, both run `collect` on the prompt and spawn nothing | none | S1, S4 |
| `one refresher at a time, and a stale lock is reclaimed once` | `tests/branch-state.test.mjs` | a held lock younger than the budget starts nothing; one older is reclaimed and starts exactly one when two reclaimers race | none | S1, S3 |
| `the refresher writes the snapshot and the host is not kept waiting` | `tests/branch-state.test.mjs` | a real spawn in a temporary repository, with a stub `gh` on PATH that sleeps 3 s. The parent's stdout and stderr pipes close well before 3 s, and the snapshot then carries `key`. Runs on all three CI platforms | none | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `refreshBehind` and `--refresh` |
| 2 — something selects it | `main()`'s due-brief branch, reached by `hooks.json`'s `--brief --cached 120`; the "collect in the foreground whenever due" mutant |
| 3 — the caller can discover it | the `refreshing` suffix in the brief |
| 4 — it is used | the post-release `session-profile --attribute` measurement (S6) |

## Mutation Log

## Invariants

- The reader still exits 0 whatever it finds, and blocks nothing (CLAUDE.md §3, §15).
- At most one refresher per git directory at a time.
- A snapshot served while stale always says its age.

## Risks

- A refresher killed mid-write leaves a checkpoint marked `partial`, which T1 makes due, never fresh.

## Stop Condition

Stop and ask in either case:
- the real-spawn test shows the hook host kept waiting on any CI platform;
- any `--brief` path still spawns `gh` while a usable snapshot exists.

## Out of Scope

- A daemon (deferred: docs/BACKLOG.md §301 Stage 6)
- Refreshing the git half synchronously (deferred: docs/BACKLOG.md §301 Stage 6)

## Verification Log
