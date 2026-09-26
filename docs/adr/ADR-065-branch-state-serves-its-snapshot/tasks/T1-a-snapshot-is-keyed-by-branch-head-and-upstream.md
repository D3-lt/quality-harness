# Task ADR-065-T1: A snapshot is keyed by branch, HEAD and upstream

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one module)
**Owner:** unassigned
**Produces:** `key` and `partial` in the snapshot; `snapshotKey(gitDir)`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the key is read before collection`, `a moved or unreadable key is due`, `a checkpoint is never fresh`

## Goal

A snapshot records a key read from files before collection starts:
- the raw `HEAD`;
- the sha it resolves to;
- the upstream tracking ref's sha, if configured.

A checkpoint written before the network half is marked `partial`. Both cache-hit sites, `main()`'s early hit and `cached()`'s, serve a snapshot as fresh only when it is usable, within its age, not `partial`, and its key equals the current one.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/branch-state.mjs` | edit | `snapshotKey(gitDir)` resolves `HEAD`, a loose ref, `packed-refs`, a worktree's `commondir`, and the upstream from `config` without spawning Git; `cached()` stores `key`, and `partial` on the checkpoint; both hit tests compare |
| `tests/branch-state.test.mjs` | edit | the tests below |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red).
2. [S2] Add `snapshotKey(gitDir)` with these rules:
   - a detached `HEAD` is its own sha;
   - `ref: <name>` reads the loose ref first, then `packed-refs`, through `commondir` for a worktree;
   - the upstream comes from `branch.<name>.remote` and `.merge` in `config`, resolved the same way;
   - anything unrecognised is `null`.
3. [S3] Read the key before `gather`, and store it in every snapshot `cached()` writes. The git-half checkpoint also carries `partial: true`.
4. [S4] Both hit tests require the key to be equal and non-null, and the snapshot not `partial`.
5. [S5] Run the fence green, and record mutants with `adr-verify --mutant`:
   - drop the key comparison in `main()`;
   - drop it in `cached()`;
   - read `packed-refs` before the loose ref;
   - serve a `partial` snapshot.
   [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/branch-state.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (a snapshot whose branch, HEAD or upstream moved is not served as fresh|the key is read from files for a branch, a packed ref, a worktree and a detached checkout)' | grep -qx 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a snapshot whose branch, HEAD or upstream moved is not served as fresh` | `tests/branch-state.test.mjs` | in a temporary repository, a snapshot within its age is served when nothing moved (the clean twin). It is due, at both hit sites, after each of: a commit, an update of the upstream ref, a branch switch at the same sha, a snapshot with no `key`, and a `partial` checkpoint | none | S1, S3, S4 |
| `the key is read from files for a branch, a packed ref, a worktree and a detached checkout` | `tests/branch-state.test.mjs` | the key's sha equals `git rev-parse HEAD` in each shape, including a ref that is both loose and packed with different values (the loose one wins). The upstream equals `git rev-parse @{u}`. No Git is spawned, and a malformed `HEAD` gives `null` | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `snapshotKey`, the `key` and `partial` fields |
| 2 — something selects it | both hit tests; the two "drop the comparison" mutants |
| 3 — the caller can discover it | n/a: no declared interface; the snapshot file is internal |
| 4 — it is used | every `--cached` prompt after a commit, push or branch switch |

## Mutation Log

## Invariants

- A snapshot hit spawns no Git process, as today.
- A snapshot that cannot prove its key is never served as fresh.

## Risks

- A ref layout this reader does not know (reftable) reads as `null`, so it refreshes every time: slower, never wrong. Named in the test.

## Stop Condition

Stop and ask if reading the key without Git cannot be made to agree with `git rev-parse` in one of the shapes on the Windows CI job.

## Out of Scope

- The background refresh (T2's job)
- The reftable ref backend (deferred: docs/BACKLOG.md §301 Stage 6)

## Verification Log
