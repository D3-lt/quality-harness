# Task ADR-076-T2: adr-verify --mutant runs in a worktree

**Depends-on:** T1
**Covers:** F-2, F-3, F-4, F-5, F-6, F-7, F-8, F-11, F-12, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5, UC1-S6
**Estimated scope:** L (the gate's mutant path, the fence runner's ownership, nine tests)
**Owner:** unassigned
**Produces:** `adr-verify --in-place` and its first line
**Consumes:** `build`, `remove`, `sweep`, `addOwned` and the `owner.json` contract in `plugin/scripts/worktree.mjs` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the mutant is applied in the worktree`, `outside git the run is in place and says so`, `a fence naming the checkout runs in place`, `a shared prefix is not the checkout`, `the fences run in the worktree`, `the clean build is reset before the mutant fence`, `evidence is read from the checkout`, `--in-place is today`, `a stopped run removes its tree`

## Goal

`adr-verify --mutant` runs its clean and mutant fences in a worktree of the checkout's working-tree content by default, resets the target and declared outputs inside it between the fences, reads its evidence from the checkout and writes its rows there before disposing of the tree, and says on its first line where it ran (ADR-076 Decision, "`adr-verify --mutant`, isolated by default").

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the mode decision; the build through T1's CLI; execution paths (fence cwd, target, journal, secondary members) in the tree; evidence paths (task file, entry sha, test-body locks) in the checkout; rows before disposal; `--in-place` in the parser and `--help` |
| `plugin/lib/fence.py` | edit | `run_bounded` publishes the fence's process group, or job, through T1's `add-owned` before the fence runs, and reports whether it ended |
| `tests/adr-verify-isolation.test.mjs` | edit | remove `todo`; add the nested `--cwd`, absolute-target and evidence-lock cases |
| `tests/mutations.json` | edit | this task's entries |

## Ordered Steps

1. [S1] Remove `todo` from the nine tests in `tests/adr-verify-isolation.test.mjs` and record the red run with `adr-verify` (TDD red). [proof: acceptance]
2. [S2] Parse `--in-place`, and name it in `--help`.
3. [S3] After the preflight, decide the mode. Each of these is in place, with a first line saying why: `--in-place`; the fence names the checkout's absolute path in a spelling F-4 defines, at a path boundary (with a platform seam, so the Windows spellings are tested on every host); the target lies outside the checkout; the T1 build fails. Otherwise the first line is "isolated in <id>".
4. [S4] Isolated execution: the fence cwd, the target, the journal and the `--also-restore` members are the worktree's; the reset between the fences (`restore_live_transaction`) runs there.
5. [S5] Evidence stays the checkout's: the task file, the entry sha for both rows (taken once, before the run), and `record_run`'s test-body locks. Write both rows before the tree is disposed of.
6. [S6] `run_bounded` records the fence's group or job with T1's `add-owned` before it runs, and says whether it ended. In the `finally`, end a fence still running, and remove the tree only on a confirmed end; otherwise leave it for the sweep.
7. [S7] Record one killed mutant per Rests-on name. This task's own mutants run with `--in-place`, because the gate under test is the one being edited. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/adr-verify-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a mutant run leaves the checkout unchanged but for the task file.s logs|outside git the mutant runs in place and says why|a fence naming the checkout runs in place and names the path|a fence.s generated output stays in the worktree|an isolated and an in-place run record the same verdict|--in-place applies the mutant in the checkout and restores it|a generated output left by the clean fence is reset before the mutant fence|a sibling path sharing the checkout.s prefix does not force the run in place)' "$T")" -eq 8 && test "$(grep -cxE 'ok [0-9]+ - a stopped mutant run removes its worktree( # SKIP Windows ends the tree at once; the next run sweeps it)?' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a mutant run leaves the checkout unchanged but for the task file's logs` | `tests/adr-verify-isolation.test.mjs` | "isolated in"; no exposure; every other byte, the index, the staged diff, the stash list and the task file outside its logs unchanged | F-2, UC1-S1 | S3, S4, S5 |
| `outside git the mutant runs in place and says why` | `tests/adr-verify-isolation.test.mjs` | the first line; the mutant still recorded | F-3, UC1-S2 | S3 |
| `a fence naming the checkout runs in place and names the path` | `tests/adr-verify-isolation.test.mjs` | the first line names the path | F-4, UC1-S3 | S3 |
| `a sibling path sharing the checkout's prefix does not force the run in place` | `tests/adr-verify-isolation.test.mjs` | the boundary | F-12, UC1-S6 | S3 |
| `a fence's generated output stays in the worktree` | `tests/adr-verify-isolation.test.mjs` | no generated file in the checkout | F-5 | S4 |
| `a generated output left by the clean fence is reset before the mutant fence` | `tests/adr-verify-isolation.test.mjs` | the reset between fences, in the tree | F-5, F-11, UC1-S5 | S4 |
| `an isolated and an in-place run record the same verdict` | `tests/adr-verify-isolation.test.mjs` | equal verdicts; both rows name HEAD, clean and then dirty (`*`) | F-6 | S5 |
| `--in-place applies the mutant in the checkout and restores it` | `tests/adr-verify-isolation.test.mjs` | exposure seen, file restored | F-7 | S2, S3 |
| `a stopped mutant run removes its worktree` | `tests/adr-verify-isolation.test.mjs` | SIGTERM ends the fence and removes the tree (POSIX) | F-8, UC1-S4 | S6 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the mode decision and its tests |
| 2 — something selects it | every `adr-verify --mutant` without `--in-place` |
| 3 — the caller can discover it | the first line, and `--help` |
| 4 — it is used | `adr-execute`'s mutation step |

## Mutation Log

## Invariants

- The Verification and Mutation Log grammars are unchanged; `adr-lint` reads an isolated run's entries as it reads today's.
- ADR-002's journal and ADR-016's `--also-restore` still govern the reset between the fences, and all of `--in-place`.
- Nothing is refused that ran before: every arm that cannot isolate runs in place (spec F-3, F-4).

## Risks

- A fence that reads an ignored file fails its clean run in the worktree. It fails before any mutant, and says so.

## Stop Condition

Stop and ask if the verdict grading has to change to run in another directory.

## Out of Scope

- Isolating `adr-verify` without `--mutant` (permanent: boundary: spec Non-Goals)

## Verification Log
