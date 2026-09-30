# Task ADR-075-T2: A campaign runs in a throwaway worktree of the working-tree content

**Depends-on:** T1
**Covers:** F-1, F-2, F-8, F-9, F-12, F-13, F-14, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5
**Estimated scope:** L (the campaign runner's entry, its child, its signals, its cache and its cleanup)
**Owner:** unassigned
**Produces:** `--in-place`, `isolate()` and `QUALITY_HARNESS_CAMPAIGN_CHILD` in `scripts/mutate.mjs`
**Consumes:** `loadLine` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `no mutant in the checkout`, `the uncommitted content is graded`, `could not isolate is exit 2`, `a leftover worktree is swept`, `SIGTERM removes the worktree`, `the cache comes back in its shape`, `both modes grade alike`

## Goal

A campaign that applies mutants runs, by default, in a worktree holding the checkout's working-tree content under the OS temp directory; the checkout is byte-identical before and after with no mutant ever in it; its verdict cache goes in and comes back; `--in-place` is today's behaviour.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `--in-place` in `KNOWN` and the usage line; `isolate()` after the preflight; the child and its marker; the process-group signals; the sweep; the cache in and back; `main()`'s async path; `--cache` forwarding |
| `.github/workflows/selftest.yml` | edit | the campaign steps pass `--in-place` (spec Non-Goals) |
| `tests/mutate-isolation.test.mjs` | edit | remove `todo` from the seven tests this task covers |
| `tests/gate-rules.test.mjs` | edit | the editor arm of `the mutation runner refuses to run over an editor, or beside another runner` passes `--in-place` (F-2 is in-place only now); its dead-owner arm runs over `campaignFixture()` with `--root`, so no test builds a worktree of this repository (CLAUDE.md §9) |
| `CLAUDE.md` | edit | §2's mutate line: isolation is the default and `--in-place` the opt-out; the rule against editing while a mutation tool runs narrows to `--in-place` |

## Ordered Steps

1. [S1] Remove `todo` from this task's tests and record the red run with `adr-verify` (TDD red). [proof: acceptance]
2. [S2] `--in-place` joins `KNOWN` and the usage line, and runs the campaign exactly as today, the uncommitted-target refusal included.
3. [S3] Without `--in-place`, after `recover()`, the catalogue read, the selection and the lock, and only for a run that applies mutants (never `--list`, `--stale`, `--repoint` or `--narrow`):
   - Sweep. For each `qh-campaign-*` entry in `git worktree list --porcelain`, read `<entry>/.mutate-lock`. When that lock names a dead pid, or there is no lock and the parent pid in the directory name is dead, `git worktree remove --force` the entry, then `git worktree prune`, and say "removed a campaign worktree left by an earlier run".
   - Build. Take `git stash create`, or `HEAD` when it prints nothing, then `git worktree add --detach <mkdtemp>/qh-campaign-<pid> <commit>`, then copy every path in `git ls-files --others --exclude-standard -z`.
   - Any failure is exit 2: "could not isolate: <reason>; --in-place runs in this checkout". The checkout is never written, and nothing that was built is left.
4. [S4] Spawn this script with `--in-place --root <worktree>` and the caller's arguments, with `--cache <path>` made absolute. Give it `detached: true` and inherited stdio, remove `QUALITY_HARNESS_MUTATE_LOCK` from its environment, and set `QUALITY_HARNESS_CAMPAIGN_CHILD=1`. The child then skips the load line, the `--changed` and shard lines, and the uncommitted-target refusal.
   - The parent does not register the handlers that exit first. On SIGINT or SIGTERM it ends the child's process group (`taskkill /T /F` on win32), removes the worktree and its temporary parent, and exits 130 or 143.
   - When the child exits, the parent removes both, prints `loadLine` (T1) once, and sets `process.exitCode` to the child's code.
5. [S5] Unless `--no-cache` or `--cache` is given, copy the checkout's `.mutation-cache.json` into the worktree before the child starts. After it exits, write the worktree's cache back through a temporary file and a rename. A cache the child did not write, or a write that fails, leaves the checkout's cache byte-identical, and the run says "the verdict cache was not updated: <reason>".
6. [S6] `.github/workflows/selftest.yml` passes `--in-place`, and CLAUDE.md §2 says what S2 to S5 did. [proof: human: a reader checks the workflow's campaign steps and CLAUDE.md §2 against `--in-place` in `scripts/mutate.mjs`]
7. [S7] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
test "$(node --test --test-reporter=tap tests/mutate-isolation.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (a campaign leaves the working tree byte-identical and its mutants never appear there|a campaign that cannot isolate stops and names --in-place, writing nothing|a killed campaign.s worktree is removed by the next run, and said|an isolated campaign reuses and returns the checkout.s verdict cache|an isolated campaign.s written-back cache is one CI.s merge job can read|a campaign stopped with SIGTERM removes its worktree|an isolated run and an in-place run of the same entries give the same verdicts)')" -eq 7 && node --test tests/mutate-runner.test.mjs tests/mutation-cache-merge.test.mjs && node --test tests/gate-rules.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a campaign leaves the working tree byte-identical and its mutants never appear there` | `tests/mutate-isolation.test.mjs` | no mutant in the checkout mid-run; bytes unchanged; the child's files stay out of the checkout | F-8, F-1, UC1-S1 | S3, S4 |
| `a campaign that cannot isolate stops and names --in-place, writing nothing` | `tests/mutate-isolation.test.mjs` | an unborn HEAD is exit 2 with the sentence, and nothing is written | F-13, UC1-S2 | S3 |
| `a killed campaign's worktree is removed by the next run, and said` | `tests/mutate-isolation.test.mjs` | the sweep and its line | F-9, UC1-S3 | S3 |
| `a campaign stopped with SIGTERM removes its worktree` | `tests/mutate-isolation.test.mjs` | the signal clause of F-9; on win32, the sweep | F-9 | S4 |
| `an isolated campaign reuses and returns the checkout's verdict cache` | `tests/mutate-isolation.test.mjs` | ran in a worktree; the verdict came back; the second run reused it | F-12, UC1-S4 | S4, S5 |
| `an isolated campaign's written-back cache is one CI's merge job can read` | `tests/mutate-isolation.test.mjs` | `readReport` accepts the file written back | F-12 | S5 |
| `an isolated run and an in-place run of the same entries give the same verdicts` | `tests/mutate-isolation.test.mjs` | parity | F-14, UC1-S5 | S2, S4 |
| `campaignPaths keeps every campaign file inside the root it is given` | `tests/mutate-runner.test.mjs` | the child's lock, journal and cache paths are its worktree's | F-1 | S4 |
| `the mutation runner refuses to run over an editor, or beside another runner` | `tests/gate-rules.test.mjs` | the in-place refusal, and one campaign per root in either mode | F-2 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `isolate()` and its tests |
| 2 — something selects it | the default path of `main`; deleting the call runs in place and the F-8 test goes red |
| 3 — the caller can discover it | the usage line names `--in-place`; CLAUDE.md §2 |
| 4 — it is used | every campaign run by hand; CI says `--in-place` |

## Mutation Log

## Invariants

- ADR-002: every mutant is journalled before it is applied, in whichever tree it is applied to.
- The preflight's refusals (a live lock, an unknown option, no match) happen before any worktree exists, with today's exit codes.
- Nothing of a worktree remains in the temp directory after its campaign: `tests/mutate-runner.test.mjs::a campaign leaves nothing in the temp directory, whatever its tests forget` runs a default campaign with `TMPDIR` pointed at a directory it then requires empty.
- The checkout's index and stash list are never written: `git stash create` makes an object and no ref.

## Risks

- `git stash create` ignores a change in a submodule; this repository has none.

## Stop Condition

Stop and ask if an isolated shard of the real catalogue grades any entry differently from CI's in-place cache at the same commit: F-14 then fails where it matters.

## Out of Scope

- `--repoint --write` and `--narrow --write` (deferred: docs/BACKLOG.md ADR-075 entry)

## Verification Log
