# ADR-076: A recorded mutant runs in a worktree

**Status:** Proposed
**Date:** 2026-09-30
**Owner:** Zy
**Spec:** docs/specs/2026-09-30-a-mutant-never-touches-the-checkout.md
**Cross-references:** docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md, docs/adr/ADR-002-a-mutant-restore-outlives-its-process.md, docs/adr/ADR-016-a-mutant-earns-its-verdict.md, docs/adr/ADR-025-a-clean-run-is-evidence-of-itself.md, docs/research/2026-09-30-the-nervous-system-plan.md
**Governs:** plugin/bin/adr-verify, plugin/lib/fence.py, scripts/unasserted.mjs, scripts/mutate.mjs
**Enforced-by:** `tests/adr-verify-isolation.test.mjs::a mutant run leaves the checkout unchanged but for the task file's logs`
**Invalidates:** none — checked. `adr-context` over `plugin/bin/adr-verify`, `scripts/unasserted.mjs` and `scripts/mutate.mjs` (2026-09-30) names ADR-002, ADR-003, ADR-006, ADR-010, ADR-013, ADR-016, ADR-020, ADR-022, ADR-023, ADR-025, ADR-028, ADR-031, ADR-045, ADR-049, ADR-050, ADR-052, ADR-063, ADR-069, ADR-071, ADR-072, ADR-073 and ADR-075. ADR-002's journal and ADR-016's `--also-restore` stand for `--in-place`, and have nothing to restore in a worktree; ADR-025's clean run is taken in the same worktree as the mutant's and recorded as before.
**Served-path change:** `adr-verify --mutant` (shipped) builds a worktree of the checkout's working-tree content and runs both fences there by default, and says where it ran on its first line; `--in-place` is today's behaviour.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-09-30-a-mutant-never-touches-the-checkout.md). Decision-relevant deltas:

- This is N4 of docs/research/2026-09-30-the-nervous-system-plan.md, and the rest of the class ADR-075 enumerated: `adr-verify --mutant` and `scripts/unasserted.mjs` still rewrite source in the checkout (ADR-075 Out of Scope, deferred to BACKLOG).
- ADR-075's isolation lives in `scripts/mutate.mjs`, which does not ship, and `adr-verify` is Python and does. A second implementation in Python would repeat every lesson ADR-075 paid for, including the seven of its Codex round (BACKLOG, 2026-09-30): git's normalised bytes, setup failures after `worktree add`, and ownership before a child exists.
- The owner decided the default and three arms on 2026-09-30 (spec Grill Log rows 1-4): isolated by default; in place and said when no worktree can be built, or when the fence names the checkout by absolute path; both fences in one worktree.
- Binding F-9 found that `scripts/unasserted.mjs` hands its runner's `NODE_TEST_CONTEXT` to its suites, so started from inside a test runner it reads a failing suite as passing (spec Risks). `scripts/mutate.mjs`'s `childEnv` already strips it.
- The class, enumerated 2026-09-30 with `git grep -lE 'mutant|journal' -- 'scripts/*.mjs' 'plugin/bin/*' 'plugin/scripts/*.mjs' | xargs git grep -lE 'writeFileSync\(|write_text\(|write_bytes\(|os\.replace\('` (ADR-075's command): five files. `scripts/mutate.mjs` is isolated; this record takes `plugin/bin/adr-verify` and `scripts/unasserted.mjs`. `scripts/mutate-catalogue.mjs` and `scripts/neuter.py` edit the catalogue or print, and touch no source a peer runs.

## Existing Primitives Audit

- **ADR-075's isolation in `scripts/mutate.mjs`** (`campaignHome`, `sweepCampaigns`, the stash-or-HEAD build, the untracked copy and its exclusion of the campaign's own lock, journal and cache, `overlayTracked`): moved, not copied, into `plugin/scripts/worktree.mjs`, which ships. `scripts/mutate.mjs` imports it back. The campaign-only parts stay in `scripts/mutate.mjs`: the child handshake (`ownedBy`), the selection hand-over and the cache write-back.
- **`run_mutant` in `plugin/bin/adr-verify`** (the clean fence, the verdict grading, `record_run`, the Mutation Log line): reused, but not unchanged. Today one `cwd` serves both as where the fences run and as where evidence is read: target containment, secondary members, the journal's identity, the mutation sha taken after the `finally` (`plugin/bin/adr-verify:1555`), and `record_run`'s test-body locks. T2 splits them into two sets of paths (Decision).
- **ADR-002's journal and ADR-016's `--also-restore`**: both still govern the reset BETWEEN the clean fence and the mutant fence (`plugin/bin/adr-verify:1463`), applied inside the worktree. Only the final restore of the checkout goes, because nothing was applied there (spec F-5, F-11). `--in-place` keeps both as today.
- **`run_bounded` in `plugin/lib/fence.py`**: starts each fence in its own POSIX session, and on Windows in a suspended child assigned to a Job Object. It exposes no child handle, and it swallows cleanup on `BaseException`. T2 extends it to publish the fence's process group, or job, into the worktree's `owner.json` before the fence runs, and to say whether it ended.
- **`childEnv` in `scripts/mutate.mjs`**: its `NODE_TEST_CONTEXT` rule is what `unasserted.mjs` needs; T3 applies the same strip (spec F-13).

## Decision

**One mechanism, shipped.** `plugin/scripts/worktree.mjs` builds, removes and sweeps a worktree of a checkout's working-tree content at `<git-common-dir>/qh-campaigns/<id>/tree`, the home ADR-075 chose. It is a module for the JavaScript tools and a CLI for `adr-verify`: `node worktree.mjs build <root> --owner <pid>` prints one JSON line (the tree, the id, the build time and the overlaid file count) or the reason it could not build; `remove <id>` removes one; `sweep <root>` removes every one whose owners have all ended. One home and one sweep serve all three tools, so a killed run of any of them is swept by the next isolated run of any of them (spec F-8).

**Ownership, written before any process that works in the tree starts.** `build --owner <pid>` writes `<id>/owner.json` naming the owner before `worktree add`. A caller that starts a process working in the tree adds it (`groups` on POSIX, `jobs` on Windows) before that process runs. The sweep removes an `<id>` only when its owner and every recorded group or job has ended, and never one whose `owner.json` cannot be read, unless it is older than a day. On Windows, where a group cannot be probed, a recorded job keeps its tree until the owner has ended and the job's pids have all gone. So a Python owner killed while its fence still runs leaves a tree that no sweep removes under the fence (spec F-8).

**`adr-verify --mutant`, isolated by default.** After its preflight (the task file, the Mutation Log section, the `--from` match), it decides where the run goes:
- `--in-place`: in the checkout, as today.
- The fence text names the checkout's absolute path, in the spellings and at the boundary spec F-4 defines: in place, and the first line names the path. A path that only shares the prefix is not a match (F-12). An environment variable or a symlink that leads to the checkout is not detected, and the first line claims nothing about it.
- The build fails, with no git repository or with a git error: in place, and the first line says why (F-3).
- Otherwise the first line says "isolated in <id>". Two sets of paths then apply:
  - **Execution** is the worktree: the fences run at the directory corresponding to `--cwd`. The mutant is applied to the worktree's copy of its file, which must be inside the checkout; a target outside it runs in place and says so. The between-fence reset (the target and every `--also-restore` output) happens there.
  - **Evidence** is the checkout: the task file, the entry sha (taken once, before the run, for both rows), and `record_run`'s test-body locks.

  Every row is written before the tree is disposed of (F-2, F-5, F-6, F-11).
- In the `finally`, a fence still running is ended through its recorded group or job, and the tree is removed only once `run_bounded` confirms it ended. A SIGTERM becomes an unwind as today. A tree whose fence cannot be confirmed ended is left for the sweep (F-8).

**`scripts/unasserted.mjs`, isolated by default.** It builds one worktree and neuters and runs its suites there. Everything after the build sits inside one cleanup boundary: its early exits (the dirty target, enumeration, the failing baseline, the unreachable suite) return a code through that boundary instead of calling `process.exit`, so the tree is removed on every path. A build it cannot make is exit 2 naming `--in-place` (F-9, F-10). Its suites never inherit `NODE_TEST_CONTEXT` (F-13).

**What would make this fail, and whether the data exists.**
- **Parity.** F-6 fails if an isolated and an in-place run of the same mutant record different verdicts. T4 makes that a completion criterion over three real task files of this corpus. Each replay is pinned to its task, its explicit `--from`, `--to` and `--why`, the commit and a clean start. The isolated arm must show "isolated in" on its first line, and both arms must be fresh, complete and killed.
- **Exposure.** F-2 fails if a fence reading the checkout through `$FIXTURE_CHECKOUT` ever sees the mutant.

## Alternatives Considered

- **A second implementation in Python for `adr-verify`.** Rejected: it duplicates the isolation ADR-075 paid for, and its seven Codex findings would have to be found again in another language.
- **Refuse when no worktree can be built.** Rejected by the owner (spec Grill Log row 2): the evidence gate outside git would stop working, and the in-place run is today's, named.
- **Isolate only the mutant's fence.** Rejected by the owner (row 4): the clean fence's outputs would still land in the checkout, and the two runs would read different trees.
- **Leave `unasserted.mjs` in place because it does not ship.** Rejected: it neuters the gates this checkout's peers load, which is the exposure N4 exists to end.

## Component / Boundary Impact

`plugin/scripts/worktree.mjs` is new and owns worktree lifecycle for the plugin's gates and this repository's tools. `adr-verify` gains a Node subprocess call; Node is already a requirement (README, Requirements).

## Wiring & Contract Changes

Inherited from docs/specs/2026-09-30-a-mutant-never-touches-the-checkout.md §Contracts Touched; delta:

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `plugin/scripts/worktree.mjs` (module and CLI) | new: `build`, `remove`, `sweep`, `addOwned` / `add-owned` | T1 | `scripts/mutate.mjs` (T1), `plugin/bin/adr-verify` and `plugin/lib/fence.py` (T2), `scripts/unasserted.mjs` (T3) |
| `<id>/owner.json` | the owner pid, and every recorded process group or job, written before each starts | T1 | the sweep of any isolated run |
| `run_bounded` in `plugin/lib/fence.py` | records its fence's group or job before it runs; reports whether it ended | T2 | `plugin/bin/adr-verify` |
| `adr-verify --in-place` | new option; the first line says where the run went | T2 | task authors; `adr-execute` |
| `unasserted.mjs --in-place` | new option | T3 | maintainers |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `build`, `remove`, `sweep`, `addOwned` and the `owner.json` contract in `plugin/scripts/worktree.mjs` | T1 | T2, T3 | No — new; `scripts/mutate.mjs` keeps its behaviour |
| `adr-verify --in-place` and its first line | T2 | T4 | No — `--in-place` is today's behaviour |

## Implementation

See `tasks/README.md` and one file per task:

- **T1:** the shared worktree module, extracted from `scripts/mutate.mjs`.
- **T2:** `adr-verify --mutant` in a worktree.
- **T3:** `unasserted.mjs` in a worktree, and its suites' environment.
- **T4:** paired verdicts over three real task files, the completion criterion.

## Consequences

- **Positive:**
  - No peer session or editor meets a mutant recorded by `adr-verify` or neutered by `unasserted.mjs`.
  - A fence's generated outputs stop landing in the checkout.
- **Negative:**
  - Each recorded mutant pays for a worktree (0.1 to 0.25 s measured for ADR-075's, 2026-09-30).
  - A fence that depends on an ignored file fails its clean run in the worktree, and says so.
- **Neutral:**
  - `adr-verify` without `--mutant` still runs in place: it changes no source.

## Out of Scope

Inherited from docs/specs/2026-09-30-a-mutant-never-touches-the-checkout.md §Non-Goals; delta:

- A fence that reads the checkout through an environment variable or a symlink is not detected (permanent: boundary: F-4 detects the path as written; T4's paired runs and the first line are the mitigation)
- `mutate.mjs --repoint --write` and `--narrow --write` stay in place (permanent: boundary: ADR-075 Out of Scope)
- A change inside a submodule is not carried into the worktree (permanent: boundary: ADR-075's mechanism, spec Non-Goals)
- Outside-platform and outside-corpus evidence (deferred: docs/BACKLOG.md ADR-076 entry; the release's §18 outside run supplies it, not T4)

## Risks

Inherited from docs/specs/2026-09-30-a-mutant-never-touches-the-checkout.md §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Moving ADR-075's code breaks the campaign in a way its tests miss | Med | High | T1 re-runs every ADR-075 and branch of the catalogue on the moved code (§18) |
| `adr-verify` cannot find `node` | Low | Med | the build is a failure like any other: in place, and the first line says so |

## Rollback

`git revert` of the implementing commits. No persistent state changes shape: the Verification and Mutation Log grammars are unchanged, and a leftover `<git-common-dir>/qh-campaigns/<id>` is removed by the next sweep or by hand.

## Follow-ups

- [ ] Record in BACKLOG which task files T4 paired, and their verdicts.
