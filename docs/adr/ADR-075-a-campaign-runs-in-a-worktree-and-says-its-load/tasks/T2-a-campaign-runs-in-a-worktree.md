# Task ADR-075-T2: A campaign runs in a worktree of the working-tree content, in the git directory

**Depends-on:** T1
**Covers:** F-1, F-2, F-8, F-9, F-12, F-13, F-14, F-15, F-16, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5, UC1-S6, UC1-S7, UC1-S8
**Estimated scope:** L (the campaign runner's entry, its child, its ownership, its signals, its cache and its cleanup)
**Owner:** unassigned
**Produces:** `--in-place`, `isolate()`, `writeBackCache`, `QUALITY_HARNESS_CAMPAIGN_CHILD`, `--selected` and the "worktree built in N ms" line in `scripts/mutate.mjs`
**Consumes:** `loadLine` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `no mutant in the checkout`, `the uncommitted content is graded`, `the selection is handed over`, `could not isolate is exit 2`, `no sweep under a live campaign`, `SIGTERM removes the worktree`, `the cache comes back in its shape`, `both modes grade alike`

## Goal

A campaign that applies mutants runs, by default, in a worktree of the checkout's working-tree content under `<git-common-dir>/qh-campaigns/`, over exactly the parent's selection. The checkout's files, index and stash list are never written (the verdict cache aside, by design); a campaign owns its worktree until its last process ends; `--in-place` is today's behaviour.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `--in-place` in `KNOWN` and the usage line; `isolate()` after the selection; `selected.json` and `--selected`; `owner.json`, the two-pid root lock and `claimTheRun`'s liveness; the sweep; the child, its process group and the parent's signals; `writeBackCache`; `main()`'s async path; `--cache` forwarding |
| `.github/workflows/selftest.yml` | edit | the campaign steps pass `--in-place` (spec Non-Goals) |
| `tests/mutate-isolation.test.mjs` | edit | remove `todo` from the eleven tests this task covers |
| `tests/gate-rules.test.mjs` | edit | in `the mutation runner refuses to run over an editor, or beside another runner`, the editor arm passes `--in-place` (F-2 is in-place only now), and the dead-owner arm runs over `campaignFixture()` with `--root`, so no test builds a worktree of this repository (CLAUDE.md §9) |
| `CLAUDE.md` | edit | §2's mutate line: isolation is the default and `--in-place` the opt-out; the rule against editing while a mutation tool runs narrows to `--in-place` |

## Ordered Steps

1. [S1] Remove `todo` from this task's tests and record the red run with `adr-verify` (TDD red). [proof: acceptance]
2. [S2] `--in-place` joins `KNOWN` and the usage line, and runs the campaign exactly as today, the uncommitted-target refusal included.
3. [S3] Without `--in-place`, and only for a run that applies mutants (never `--list`, `--stale`, `--repoint` or `--narrow`): after `recover()`, the catalogue read, the whole selection (`--case`, `--changed`, `--shard` and the timings it reads) and the root lock:
   - write `<git-common-dir>/qh-campaigns/<id>/owner.json` with this pid;
   - sweep every other `<id>` whose `owner.json` names no live pid and, on POSIX, no live process group, or has no `owner.json` at all: `git worktree remove --force`, `git worktree prune`, and say "removed a campaign worktree left by an earlier run";
   - build `<id>/tree` from `git stash create`, or `HEAD` when it prints nothing, with `git worktree add --detach`, copy in every path of `git ls-files --others --exclude-standard -z`, and say "worktree built in N ms".

   Any failure is exit 2: "could not isolate: <reason>; --in-place runs in this checkout". The checkout is never written, and nothing that was built is left behind.
4. [S4] Write the selected labels, in order, to `<id>/selected.json`. Spawn this script with `--in-place --root <id>/tree --selected <id>/selected.json`, plus `--no-cache` or an absolute `--cache <path>` when the caller gave one. Use `detached: true` so the child leads its own process group, with inherited stdio, `QUALITY_HARNESS_MUTATE_LOCK` removed and `QUALITY_HARNESS_CAMPAIGN_CHILD=1` set.
   - Record the child's pid in `owner.json` and in the root lock. `claimTheRun` counts a lock as live while either pid, or on POSIX the child's group, lives.
   - The child accepts `--selected` only with that marker. It runs exactly those entries and skips the load line, the `--changed` and shard lines, the exposure listing and the uncommitted-target refusal.
   - The parent does not register the handlers that exit first. On SIGINT or SIGTERM it ends the child's group (`taskkill /T /F` on win32), waits for it to end, removes `<id>`, prints `loadLine` (T1) with its end sample, and exits 130 or 143.
   - When the child exits, the parent removes `<id>`, prints `loadLine` once, and sets `process.exitCode` to the child's code, or 1 with the signal named if a signal ended it.
5. [S5] Unless `--no-cache` or `--cache` is given, copy the checkout's `.mutation-cache.json` into the tree before the child starts. After it exits, `writeBackCache(from, to, { fs, say })` writes it back through a temporary file and a rename. A cache the child did not write, or a copy or rename that fails, leaves the checkout's cache byte-identical and says "the verdict cache was not updated: <reason>".
6. [S6] `.github/workflows/selftest.yml` passes `--in-place`, and CLAUDE.md §2 says what S2 to S5 did. [proof: human: a reader checks the workflow's campaign steps and CLAUDE.md §2 against `--in-place` in `scripts/mutate.mjs`]
7. [S7] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/mutate-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a campaign leaves the working tree byte-identical and its mutants never appear there|a campaign that cannot isolate stops and names --in-place, writing nothing|a killed campaign.s worktree is removed by the next run, and said|an isolated campaign reuses and returns the checkout.s verdict cache|a second campaign waits while an orphaned child of the first still runs|an isolated campaign runs exactly the entries an in-place one selects|an uncommitted test edit and an untracked test are graded as an in-place run grades them|a verdict cache that cannot be written back is left as it was, and said|an isolated campaign.s written-back cache is one CI.s merge job can read|a campaign stopped with SIGTERM removes its worktree|an isolated run and an in-place run of the same entries give the same verdicts)' "$T")" -eq 11 && node --test tests/mutate-runner.test.mjs tests/mutation-cache-merge.test.mjs && node --test tests/gate-rules.test.mjs
```

The runner's exit status is carried by `pipefail` and `&&`, never discarded inside a `test "$(…)"` (T1's Acceptance says how that was measured).

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a campaign leaves the working tree byte-identical and its mutants never appear there` | `tests/mutate-isolation.test.mjs` | no mutant in the checkout mid-run; files, index, staged diff and stash list unchanged | F-8, F-1, UC1-S1 | S3, S4 |
| `an uncommitted test edit and an untracked test are graded as an in-place run grades them` | `tests/mutate-isolation.test.mjs` | the snapshot holds the uncommitted and untracked content | F-8, UC1-S6 | S3 |
| `an isolated campaign runs exactly the entries an in-place one selects` | `tests/mutate-isolation.test.mjs` | `--changed HEAD` over a dirty source and `--shard 1/2 --no-cache` select alike | F-15, UC1-S8 | S3, S4 |
| `a campaign that cannot isolate stops and names --in-place, writing nothing` | `tests/mutate-isolation.test.mjs` | an unborn HEAD is exit 2 with the sentence, and nothing is written | F-13, UC1-S2 | S3 |
| `a killed campaign's worktree is removed by the next run, and said` | `tests/mutate-isolation.test.mjs` | the sweep, once the orphan has ended | F-9, UC1-S3 | S3 |
| `a second campaign waits while an orphaned child of the first still runs` | `tests/mutate-isolation.test.mjs` | the two-pid lock; no sweep under a live child | F-16, UC1-S7 | S3, S4 |
| `a campaign stopped with SIGTERM removes its worktree` | `tests/mutate-isolation.test.mjs` | the signal clause of F-9, and the load line at the signal; on win32, the sweep | F-9, F-10 | S4 |
| `an isolated campaign reuses and returns the checkout's verdict cache` | `tests/mutate-isolation.test.mjs` | ran in a worktree; the verdict came back; the second run reused it | F-12, UC1-S4 | S4, S5 |
| `an isolated campaign's written-back cache is one CI's merge job can read` | `tests/mutate-isolation.test.mjs` | `readReport` accepts the file written back | F-12 | S5 |
| `a verdict cache that cannot be written back is left as it was, and said` | `tests/mutate-isolation.test.mjs` | `writeBackCache` with a failing rename | F-12 | S5 |
| `an isolated run and an in-place run of the same entries give the same verdicts` | `tests/mutate-isolation.test.mjs` | parity on the fixture | F-14, UC1-S5 | S2, S4 |
| `campaignPaths keeps every campaign file inside the root it is given` | `tests/mutate-runner.test.mjs` | the child's lock, journal and cache paths are its worktree's | F-1 | S4 |
| `the mutation runner refuses to run over an editor, or beside another runner` | `tests/gate-rules.test.mjs` | the in-place refusal, and one campaign per root | F-2 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `isolate()`, `writeBackCache` and their tests |
| 2 — something selects it | the default path of `main`; deleting the call runs in place and the F-8 test goes red |
| 3 — the caller can discover it | the usage line names `--in-place`; CLAUDE.md §2; the "worktree built" line |
| 4 — it is used | every campaign run by hand; CI says `--in-place` |

## Mutation Log

## Invariants

- ADR-002: every mutant is journalled before it is applied, in whichever tree it is applied to.
- The preflight's refusals (a live lock, an unknown option, no match) happen before any worktree exists, with today's exit codes.
- Nothing of a campaign remains in the temp directory: `tests/mutate-runner.test.mjs::a campaign leaves nothing in the temp directory, whatever its tests forget` runs a default campaign with `TMPDIR` pointed at a directory it then requires empty.
- `git stash create` makes an object and no ref; the index is read, never written.
- A worktree is removed only after the process group that used it has ended.

## Risks

- `git stash create` ignores a change inside a submodule; this repository has none.
- A reused pid can keep a dead campaign's `<id>` alive until a later run; nothing is removed wrongly.

## Stop Condition

Stop and ask if T4's paired runs show any mismatch: F-14 or F-15 then fails where it matters, and isolation must not become the default.

## Out of Scope

- `--repoint --write` and `--narrow --write` (deferred: docs/BACKLOG.md ADR-075 entry)

## Verification Log
