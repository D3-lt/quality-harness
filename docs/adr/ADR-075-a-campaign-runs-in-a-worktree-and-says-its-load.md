# ADR-075: A campaign runs in a worktree, and every result says the load it ran under

**Status:** Accepted
**Date:** 2026-09-30
**Owner:** Zy
**Spec:** docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md
**Cross-references:** docs/adr/ADR-002-a-mutant-restore-outlives-its-process.md, docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/adr/ADR-069-a-stale-mutant-is-repointed-by-its-own-edit.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/research/2026-09-26-model-out-of-the-loop.md, docs/research/2026-09-30-the-nervous-system-plan.md, docs/BACKLOG.md
**Governs:** scripts/mutate.mjs, plugin/scripts/qh-check.mjs, plugin/scripts/load.mjs, tests/campaign-fixture.mjs
**Enforced-by:** `tests/mutate-isolation.test.mjs::a campaign leaves the working tree byte-identical and its mutants never appear there`
**Invalidates:** none — checked. `adr-context` over `scripts/mutate.mjs` and `plugin/scripts/qh-check.mjs` (2026-09-30) names ADR-002, ADR-006, ADR-023, ADR-069, ADR-071, ADR-072, ADR-073, ADR-060 and ADR-061. ADR-002's journal still restores every mutant, in the worktree or, with `--in-place`, in the checkout. ADR-023's reuse keys are unchanged, and the cache crosses the boundary in its own shape. ADR-069's `--root` is how the isolated child is pointed at its worktree. ADR-061 reads `checks.jsonl`, and the new fields are additive.
**Served-path change:** `qh-check` (shipped) writes both load samples into every record and says "unattributable" when either exceeds the core count; `node scripts/mutate.mjs` (repository tooling) runs its campaign in a worktree in the git directory holding the working-tree content, so no mutant ever appears in the checkout that peer sessions load.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md). Decision-relevant deltas:

- This is Stage 4's remaining mutation-tooling item, "worktree-isolated campaigns", deferred from ADR-069 and ADR-071 (BACKLOG §301, Stage 4, 2026-09-27), with no receipt at the destination until now.
- A worktree of this repository costs 0.2 to 0.7 s to create (measured 2026-09-29 on this checkout; spec Goal). A three-entry campaign over the spec's fixture repository takes about 200 ms end to end, in place (measured 2026-09-30).
- **Reviewed twice before acceptance.**
  - **The first draft, a worktree of `HEAD` under the temp root.** A same-lineage cold review showed it would silently re-grade a committed test after an uncommitted edit to it (`dirtyTargets`, `scripts/mutate.mjs:138`, checks only the mutated file). The owner chose working-tree content (spec Grill Log row 8).
  - **The second draft.** A Codex review of the whole plan (gpt-6-astra at xhigh, 2026-09-30) found four blocking defects, each confirmed against source:
    - The child re-evaluated the selection. `--changed HEAD` found nothing against the snapshot's `HEAD`, and `--shard … --no-cache` split on timings the child never received.
    - A worktree under the temp root grades some lifecycle tests differently. `plugin/scripts/lifecycle.mjs:347` exempts a scratch path only when the working directory is not under the temp root.
    - Crash ownership contradicted itself.
    - Every Acceptance fence could pass while the runner failed: `test "$(…)" -eq N` discards the runner's exit status, measured 2026-09-30 as a failing pipeline read as exit 0.

    The owner's word: "implement codex fixes to the plan" (spec Grill Log row 9).
- The class, enumerated 2026-09-30 with `git grep -lE 'mutant|journal' -- 'scripts/*.mjs' 'plugin/bin/*' 'plugin/scripts/*.mjs' | xargs git grep -lE 'writeFileSync\(|write_text\(|write_bytes\(|os\.replace\('`: five files. Three rewrite tracked source in the checkout to measure something: `scripts/mutate.mjs` (this record), and `plugin/bin/adr-verify --mutant` and `scripts/unasserted.mjs` (Out of Scope, deferred). `plugin/bin/adr-lint` and `plugin/scripts/lifecycle.mjs` matched on their prose, and they write state files, not source.
- The results that should say their load: `git grep -lE 'loadavg|load average' -- scripts plugin` found none on 2026-09-30. This record takes `qh-check` and the campaign. A fence recorded by `adr-verify` is deferred, and so is the reader that acts on `contended` (the nervous-system plan, N2).

## Existing Primitives Audit

- **`campaignPaths(root)` and `--root` (ADR-069)**: reused unchanged. The isolated campaign is today's campaign pointed at a worktree.
- **The in-place campaign loop, its lock, journal and dirty-target refusal (ADR-002, `scripts/mutate.mjs`)**: reused as the engine. An isolated run spawns this same script with `--in-place --root <worktree>`, so both modes run one loop over the same bytes, and F-14's parity holds by construction.
- **The selection functions of `main` (`--case`, `--changed`, `--shard`, the timing read)**: reused, and run once, in the parent. The child is handed the result (F-15).
- **`readReport` (`scripts/mutation-cache-merge.mjs`)**: reused to check that the cache written back is one CI's merge job accepts. The merge function itself is not used: it returns `measured` as a count, and `readReport` refuses that shape.
- **`git stash create`**: reused to capture the tracked working-tree content as a commit object, without touching the checkout, its index or its stash list. Measured 2026-09-30: a worktree built from it inside `.git` held the unstaged edit, and the checkout's status and stash list were unchanged.
- **`runCheck` options (`platform`, `env`) in `plugin/scripts/qh-check.mjs`**: reshaped. `loadavg` and `cores` join them as seams.
- **Load sampling**: none exists. `plugin/scripts/load.mjs` is new, and `qh-check` and the campaign share it.

## Decision

**What the worktree holds, and where.** By default, a mutation campaign runs in a throwaway `git worktree` at `<git-common-dir>/qh-campaigns/<id>/tree`, never under the OS temp root: a test that tells scratch from project by the temp root must grade alike in both modes. The worktree holds the checkout's working-tree content. `git stash create` captures `HEAD` plus the uncommitted tracked changes as a commit, or yields `HEAD` itself when there are none; the worktree is checked out detached at that commit; then every untracked file that is not ignored is copied in. The campaign grades exactly what an in-place run would, and the checkout's files, index and stash list are never written. The verdict cache is the one exception, written back by design.

**The selection is made once, by the parent.** `node scripts/mutate.mjs` keeps its preflight — it recovers a journal, reads the catalogue, resolves the selection (`--case`, `--changed`, `--shard` with the timings it reads) and claims the root's lock. The uncommitted-target refusal (F-2) applies to `--in-place` only, because an isolated run grades the uncommitted content instead of losing it. For a run that applies mutants, the parent writes the selected entries' labels, in order, to `<id>/selected.json`. It then spawns this script with `--in-place --root <worktree> --selected <file>`, plus `--no-cache` or an absolute `--cache <path>` when the caller gave one. The child accepts `--selected` only under `QUALITY_HARNESS_CAMPAIGN_CHILD=1`, runs exactly those entries, and re-evaluates nothing (F-15). It skips what the parent says once: the load line, the `--changed` and shard lines, the exposure listing and the uncommitted-target refusal. `QUALITY_HARNESS_MUTATE_LOCK` is removed from its environment.

**Ownership, from before the worktree exists until the last process ends.**
- The parent writes `<id>/owner.json` with its pid before it builds the worktree, and adds the child's pid, which is also its process group, once spawned.
- The root's lock holds both. `claimTheRun` treats a lock as live while either pid, or on POSIX the child's process group, lives. So no second campaign runs on the root while an orphaned child still works (F-16).
- In this mode the parent stays in the event loop and does not register the handlers that exit first. On SIGINT or SIGTERM it ends the child's process group — `taskkill /T /F` on Windows, which has no catchable SIGTERM — waits for the group to end, removes the worktree and its `<id>` directory, prints the load line with the end sample taken at the signal, and exits 130 or 143.
- When the child exits on its own, the parent removes the same, prints the load line once, and sets `process.exitCode` to the child's code. A child ended by a signal is reported as such, with exit 1.
- The next run sweeps an `<id>` only when `owner.json` names no live pid and, on POSIX, no live group, and says so. An `<id>` with no `owner.json` is one whose parent died before writing it, and nothing was built there yet. On Windows the sweep is the only cleanup, and pid liveness is its only test (F-9).

**The cache.** The checkout's verdict cache is copied in before the run. The child's cache is written back after it by `writeBackCache(from, to, { fs, say })` through a temporary file and a rename, keeping the child's shape, which is mutate's own and is what `readReport` accepts. A copy or write that fails leaves the checkout's cache byte-identical and says "the verdict cache was not updated: <reason>".

**Failure and the in-place mode.** A worktree that cannot be built is exit 2, "could not isolate", naming `--in-place`, and never a silent fallback. `--in-place` is today's behaviour. Before it applies a mutant in the checkout — with `--in-place`, `--repoint --write` or `--narrow --write` — it names the other processes whose command line names the checkout, as advice. CI's campaign passes `--in-place`, because nobody else loads its runner's checkout.

**Load.** `qh-check` and a campaign sample the 1-minute load and the core count at the start and at the end, and always say both: "load: A at start, B at end, on N cores". `contended` is true when either sample exceeds the core count, false when both are at or below it, and null when either could not be read (`[0, 0, 0]`, as Windows reports). It is an endpoint observation and is said as one. "Unattributable" is added when it is true. The `qh-check` record carries both samples and `contended`. A campaign keeps no record file, so its printed summary carries them. Exit codes and verdicts never change (CLAUDE.md §3).

**What would make this fail, and whether the data exists.**
- **Parity.** F-14 and F-15 fail if an isolated run selects or grades any entry differently from an in-place run over the same content. T4 makes that a completion criterion over the real catalogue: paired uncached runs, on this machine, of every entry whose tests include `tests/lifecycle.test.mjs` (122 on 2026-09-30, three of them about scratch-versus-project) and of `--shard 1/48`, zero mismatches allowed. That data exists once T2 lands.
- **Overhead.** The spec's under-2-second target fails if the parent's "worktree built in N ms" line exceeds 2000 in any T4 run.

## Alternatives Considered

- **A worktree of `HEAD` only (the first draft).** Rejected after the cold review. It re-grades the committed test after an uncommitted edit to it, and an uncommitted catalogue entry reads as "no mutation matches".
- **A worktree under the OS temp root (the second draft).** Rejected after the Codex review. `plugin/scripts/lifecycle.mjs:347` treats a scratch path as exempt only when the working directory is not under the temp root, so the lifecycle suite grades differently there. BACKLOG §301 records the same finding from the first campaign run in a worktree.
- **The child re-evaluates the caller's arguments (the second draft).** Rejected after the Codex review. `--changed HEAD` compares against the snapshot's `HEAD`, and `--no-cache` withholds the timings `--shard` reads. The selection is made once and handed over.
- **Copy the checkout into a temporary directory instead of a worktree.** Rejected. It copies ignored files — build output, dependencies — so the campaign would read what `git` does not track, and it is slower than a worktree here.
- **Run the loop in-process against a worktree, with no child.** Rejected. The loop is synchronous, so SIGINT and SIGTERM handlers never run while it works (measured 2026-08-27; the `scripts/mutate.mjs` header), and the worktree could only be cleaned by the next run.
- **Refuse or delay a run under load.** Rejected by the spec's Non-Goals: advice only, CLAUDE.md §3. Acting on `contended` belongs to the reader the nervous-system plan names next (N2), under its own record.

## Component / Boundary Impact

`scripts/mutate.mjs` gains an isolation layer around its unchanged loop, and ownership stays with the campaign runner. `main()` gains an asynchronous path: its promise sets `process.exitCode` as its return value does today. `plugin/scripts/load.mjs` is a new leaf with one reason to change, how load is read and judged, consumed by `qh-check` and the campaign. `scripts/campaign-parity.mjs` is new repository tooling, T4's instrument. `qh-check`'s record gains fields; its verdict logic is untouched.

## Wiring & Contract Changes

Inherited from docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md §Contracts Touched; delta:

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `runCheck({ loadavg, cores })` | two new optional seams | `plugin/scripts/qh-check.mjs` (T1) | `tests/qh-check.test.mjs` |
| `QUALITY_HARNESS_LOADAVG`, `QUALITY_HARNESS_CORES`, `QUALITY_HARNESS_PROCESS_LIST` | test seams, read by the campaign | `scripts/mutate.mjs` (T1, T3) | the tests |
| `QUALITY_HARNESS_CAMPAIGN_CHILD`, `--selected <file>` | the child's marker and its handed-over selection | `scripts/mutate.mjs` (T2) | `scripts/mutate.mjs` |
| the root lock and `<id>/owner.json` | the parent pid and the child's process group | `scripts/mutate.mjs` (T2) | a second campaign; the sweep |
| `writeBackCache(from, to, { fs, say })` | exported | `scripts/mutate.mjs` (T2) | `tests/mutate-isolation.test.mjs` |
| `main()` | may return a promise; `process.exitCode` is set from what it resolves to | `scripts/mutate.mjs` (T2) | the script's own entry |
| `--cache <path>` | forwarded to the child as an absolute path | `scripts/mutate.mjs` (T2) | CI's shard jobs |
| `.github/workflows/selftest.yml` | the campaign steps pass `--in-place` | T2 | CI |
| the uncommitted-target refusal | `--in-place` only (spec F-2) | `scripts/mutate.mjs` (T2) | `tests/gate-rules.test.mjs` |
| `scripts/campaign-parity.mjs` | new: paired uncached runs, per-entry comparison | T4 | the maintainer; T4's Acceptance |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `sampleLoad`, `contention`, `loadLine` in `plugin/scripts/load.mjs` | T1 | T2 | No — new |
| `--in-place`, `isolate()`, `QUALITY_HARNESS_CAMPAIGN_CHILD` and the "worktree built in N ms" line | T2 | T3, T4 | No — `--in-place` is today's behaviour |

## Implementation

See `tasks/README.md` and one file per task:

- **T1:** the load.
- **T2:** isolation — the selection handoff, ownership, the cache and the signals.
- **T3:** naming who a run in the checkout exposes.
- **T4:** parity over the real catalogue, the completion criterion.

## Consequences

- **Positive:**
  - A peer session never meets a mutant from a campaign run by hand here.
  - An uncommitted test or catalogue edit is graded without a commit.
  - Every result says the load at its ends.
- **Negative:**
  - Each campaign pays for its worktree and for copying its untracked files (target under 2 s, measured by T4).
  - An orphaned child keeps its root locked until it ends.
- **Neutral:**
  - `--repoint --write` and `--narrow --write` keep running in place, and now say who they expose.
  - CI passes `--in-place`.

## Out of Scope

Inherited from docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md §Non-Goals; delta:

- `--repoint --write` and `--narrow --write` stay in place: they edit this checkout's catalogue by design, and the edit would be lost with a worktree (deferred: docs/BACKLOG.md ADR-075 entry)
- `plugin/bin/adr-verify --mutant` and `scripts/unasserted.mjs` rewrite source in the checkout too (deferred: docs/BACKLOG.md ADR-075 entry)
- A fence recorded by `adr-verify` does not say its load (deferred: docs/BACKLOG.md ADR-075 entry)
- A reader that acts on `contended` (deferred: docs/research/2026-09-30-the-nervous-system-plan.md)
- On Windows the exposure listing says it could not look rather than listing processes, and ownership rests on pid liveness alone (permanent: boundary: `ps` and process groups are the mechanisms this record chooses, and a Windows lister is not worth a second code path for an advisory line)

## Risks

Inherited from docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The isolated child inherits `QUALITY_HARNESS_MUTATE_LOCK` and refuses its own parent | High if missed | High | T2 removes it; the gate-rules dead-owner arm runs this path, over a fixture |
| A test reads an ignored file, so an isolated run differs from an in-place one | Low | High | T4's paired runs; ignored files are left out on purpose |
| A pid is reused after its process dies, so a sweep keeps a dead campaign's worktree | Low | Low | the worktree stays until a later run; nothing is deleted wrongly |
| T4's paired runs are slow | High | Low | run once, detached, at load below the core count (costly-runs) |

## Rollback

`git revert` of the implementing commits. No persistent state changes shape: `checks.jsonl` records gain fields that older readers ignore, the verdict cache's format is unchanged, `git stash create` writes no ref, and `.git/qh-campaigns/` holds nothing once its campaigns have ended. `--in-place` is today's behaviour for anyone who needs it before a revert.

## Follow-ups

- [ ] Retire the palace memory "a mutation campaign is live for peers" once an isolated campaign has shipped.
