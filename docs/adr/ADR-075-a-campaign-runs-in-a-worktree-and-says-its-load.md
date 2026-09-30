# ADR-075: A campaign runs in a worktree, and every result says the load it ran under

**Status:** Proposed
**Date:** 2026-09-30
**Owner:** Zy
**Spec:** docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md
**Cross-references:** docs/adr/ADR-002-a-mutant-restore-outlives-its-process.md, docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/adr/ADR-069-a-stale-mutant-is-repointed-by-its-own-edit.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/research/2026-09-26-model-out-of-the-loop.md, docs/BACKLOG.md
**Governs:** scripts/mutate.mjs, plugin/scripts/qh-check.mjs, tests/campaign-fixture.mjs
**Enforced-by:** `tests/mutate-isolation.test.mjs::a campaign leaves the working tree byte-identical and its mutants never appear there`
**Invalidates:** none — checked. `adr-context` over `scripts/mutate.mjs` and `plugin/scripts/qh-check.mjs` (2026-09-30) names ADR-002, ADR-006, ADR-023, ADR-069, ADR-071, ADR-072, ADR-073, ADR-060 and ADR-061. ADR-002's journal still restores every mutant, in the worktree or, with `--in-place`, in the checkout; ADR-023's reuse keys are unchanged and the cache crosses the boundary in its own shape; ADR-069's `--root` is how the isolated child is pointed at its worktree; ADR-061 reads `checks.jsonl`, and the new fields are additive.
**Served-path change:** `qh-check` (shipped) writes the load it ran under into every record and says "unattributable" when it ran above the core count; `node scripts/mutate.mjs` (repository tooling) runs its campaign in a throwaway worktree holding the working-tree content, so no mutant ever appears in the checkout that peer sessions load.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md). Decision-relevant deltas:

- This is Stage 4's remaining mutation-tooling item, "worktree-isolated campaigns", deferred from ADR-069 and ADR-071 (BACKLOG §301, Stage 4, 2026-09-27), with no receipt at the destination until now.
- A worktree of this repository costs 0.2 to 0.7 s to create (measured 2026-09-29 on this checkout; spec Goal). A two-entry campaign over the spec's fixture repository took 195 ms end to end, in place (measured 2026-09-30).
- **Re-opened by a cold review, 2026-09-30.** The first draft isolated a worktree of `HEAD`. A read-only reviewer ran today's runner and showed that `dirtyTargets` (`scripts/mutate.mjs:138`) checks only the mutated file, so an uncommitted edit to a TEST is graded today; a `HEAD` worktree would silently re-grade the committed test, and an uncommitted catalogue entry would read as "no mutation matches". The owner chose working-tree content (spec Grill Log row 8). The same review found eleven more defects, each folded in below or into T2.
- The class, enumerated 2026-09-30 with `git grep -lE 'mutant|journal' -- 'scripts/*.mjs' 'plugin/bin/*' 'plugin/scripts/*.mjs' | xargs git grep -lE 'writeFileSync\(|write_text\(|write_bytes\(|os\.replace\('`: five files. Three rewrite tracked source in the checkout to measure something: `scripts/mutate.mjs` (this record), and `plugin/bin/adr-verify --mutant` and `scripts/unasserted.mjs` (Out of Scope, deferred). `plugin/bin/adr-lint` and `plugin/scripts/lifecycle.mjs` matched on their prose, and they write state files, not source.
- The results that should say their load: `git grep -lE 'loadavg|load average' -- scripts plugin` found none on 2026-09-30. This record takes `qh-check` and the campaign; a fence recorded by `adr-verify` is deferred.

## Existing Primitives Audit

- **`campaignPaths(root)` and `--root` (ADR-069)**: reused unchanged. The isolated campaign is today's campaign pointed at a worktree.
- **The in-place campaign loop, its lock, journal and dirty-target refusal (ADR-002, `scripts/mutate.mjs`)**: reused as the engine. An isolated run spawns this same script with `--in-place --root <worktree>`, so both modes run one loop over the same bytes, and F-14's parity holds by construction rather than by maintenance.
- **`readReport` (`scripts/mutation-cache-merge.mjs`)**: reused to check that the cache written back is one CI's merge job accepts. The merge function itself is not used: it returns `measured` as a count, and `readReport` refuses that shape.
- **`git stash create`**: reused to capture the tracked working-tree content as a commit object without touching the checkout, its index or its stash list.
- **`runCheck` options (`platform`, `env`) in `plugin/scripts/qh-check.mjs`**: reshaped. `loadavg` and `cores` join them as seams.
- **Load sampling**: none exists. `plugin/scripts/load.mjs` is new, and `qh-check` and the campaign share it.

## Decision

By default, a mutation campaign runs in a throwaway `git worktree` under the OS temp directory. The worktree holds the checkout's working-tree content: `git stash create` captures `HEAD` plus the uncommitted tracked changes as a commit, `HEAD` itself when there are none; the worktree is checked out detached at that commit; then every untracked file that is not ignored is copied in. So the campaign grades exactly what an in-place run would, and the checkout, its index and its stash list are never written.

`node scripts/mutate.mjs` keeps its preflight — it recovers a journal, reads and selects the catalogue, and claims the root's lock — and the uncommitted-target refusal (F-2) now applies to `--in-place` only, because an isolated run grades the uncommitted content instead of losing it. For a run that applies mutants, it then builds the worktree and spawns itself with `--in-place --root <worktree>` and the caller's arguments. The child is marked by `QUALITY_HARNESS_CAMPAIGN_CHILD=1`, has `QUALITY_HARNESS_MUTATE_LOCK` removed, and skips what the parent says once: the load line, the `--changed` and shard lines, the exposure listing and the uncommitted-target refusal. The parent stays in the event loop, and in that mode it does not register the handlers that exit first.

The child runs in its own process group. On SIGINT or SIGTERM the parent ends that group, so the child's `node --test` goes with it, then removes the worktree and exits 130 or 143. On Windows it ends the tree with `taskkill /T /F`, where no catchable SIGTERM exists. The next run sweeps a worktree left behind by SIGKILL, and it decides a worktree is abandoned from the child's own lock (`<worktree>/.mutate-lock`), never from the parent's pid, so it never pulls a tree from under a live child.

The checkout's verdict cache is copied in before the run, and the child's cache is written back after it through a temporary file and a rename. The copy keeps the child's shape, which is mutate's own and is what `readReport` accepts. A worktree that cannot be built is exit 2, "could not isolate", naming `--in-place`, and never a silent fallback. `--in-place` is today's behaviour. Before it applies a mutant in the checkout — with `--in-place`, `--repoint --write` or `--narrow --write` — it names the other processes whose command line names the checkout, as advice. CI's campaign passes `--in-place`: nobody else loads its runner's checkout.

`qh-check` and a campaign sample the 1-minute load and the core count at start and end. Above the core count at either sample, the `qh-check` record says `contended: true`, and both say "unattributable: load N on M cores". With no load average (`[0, 0, 0]`, as Windows reports), `contended` is `null` and both say the load could not be read. A campaign keeps no record file, so its printed summary is where it says this. Exit codes and verdicts never change (CLAUDE.md §3).

**What would make this fail, and whether the data exists.** F-14 fails if an isolated run grades any entry differently from an in-place run over the same content: a test that reads an ignored file would do it. The fixture proves the mechanism. The real catalogue is proved by one isolated shard of it, compared entry by entry with CI's in-place cache at the same commit (Follow-ups). That data exists once T2 lands.

## Alternatives Considered

- **A worktree of `HEAD` only (the first draft).** Rejected after the cold review. It re-grades the committed test after an uncommitted edit to it, and an uncommitted catalogue entry reads as "no mutation matches". Widening the refusal to every file the run reads would keep it honest, but only by forcing a commit before every rerun.
- **Copy the checkout into a temporary directory instead of a worktree.** Rejected. It copies ignored files — build output, dependencies — so the campaign would read what `git` does not track, and it is slower than a worktree here.
- **Run the loop in-process against a worktree, with no child.** Rejected. The loop is synchronous, so SIGINT and SIGTERM handlers never run while it works (measured 2026-08-27; the `scripts/mutate.mjs` header), and the worktree could only be cleaned by the next run. A parent in the event loop cleans up on the signal itself.
- **Refuse or delay a run under load.** Rejected by the spec's Non-Goals: advice only, CLAUDE.md §3.

## Component / Boundary Impact

`scripts/mutate.mjs` gains an isolation layer around its unchanged loop, and ownership stays with the campaign runner. `main()` gains an asynchronous path: its promise sets `process.exitCode` as its return value does today. `plugin/scripts/load.mjs` is a new leaf with one reason to change, how load is read and judged, consumed by `qh-check` and the campaign. `qh-check`'s record gains fields; its verdict logic is untouched.

## Wiring & Contract Changes

Inherited from docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md §Contracts Touched; delta:

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `runCheck({ loadavg, cores })` | two new optional seams | `plugin/scripts/qh-check.mjs` (T1) | `tests/qh-check.test.mjs` |
| `QUALITY_HARNESS_LOADAVG`, `QUALITY_HARNESS_CORES`, `QUALITY_HARNESS_PROCESS_LIST` | test seams, read by the campaign | `scripts/mutate.mjs` (T1, T3) | the tests |
| `QUALITY_HARNESS_CAMPAIGN_CHILD` | marks the isolated child | `scripts/mutate.mjs` (T2) | `scripts/mutate.mjs` |
| `main()` | may return a promise; `process.exitCode` is set from what it resolves to | `scripts/mutate.mjs` (T2) | the script's own entry |
| `--cache <path>` | forwarded to the child as an absolute path | `scripts/mutate.mjs` (T2) | CI's shard jobs |
| `.github/workflows/selftest.yml` | the campaign steps pass `--in-place` | T2 | CI |
| the uncommitted-target refusal | `--in-place` only (spec F-2) | `scripts/mutate.mjs` (T2) | `tests/gate-rules.test.mjs` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `sampleLoad`, `contention`, `loadLine` in `plugin/scripts/load.mjs` | T1 | T2 | No — new |
| `--in-place`, `isolate()` and `QUALITY_HARNESS_CAMPAIGN_CHILD` | T2 | T3 | No — `--in-place` is today's behaviour |

## Implementation

See `tasks/README.md` and one file per task:

- T1: the load.
- T2: isolation, which includes the cache crossing the boundary and the signals.
- T3: naming who an in-place run exposes.

## Consequences

- **Positive:**
  - A peer session never meets a mutant from a campaign run by hand here.
  - An uncommitted test or catalogue edit is graded without a commit.
  - A result says whether its timing can be trusted.
- **Negative:**
  - Each campaign pays 0.2 to 0.7 s for its worktree, plus the copy of its untracked files.
  - The lock still allows one campaign per root, so two campaigns never run side by side.
- **Neutral:**
  - `--repoint --write` and `--narrow --write` keep running in place, and now say who they expose.
  - CI passes `--in-place`.

## Out of Scope

Inherited from docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md §Non-Goals; delta:

- `--repoint --write` and `--narrow --write` stay in place: they edit this checkout's catalogue by design, and the edit would be lost with a worktree (deferred: docs/BACKLOG.md ADR-075 entry)
- `plugin/bin/adr-verify --mutant` and `scripts/unasserted.mjs` rewrite source in the checkout too (deferred: docs/BACKLOG.md ADR-075 entry)
- A fence recorded by `adr-verify` does not say its load (deferred: docs/BACKLOG.md ADR-075 entry)
- On Windows the exposure listing says it could not look, rather than listing processes (permanent: boundary: `ps` is the lister this record chooses, and a Windows lister is not worth a second code path for an advisory line)

## Risks

Inherited from docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The isolated child inherits `QUALITY_HARNESS_MUTATE_LOCK` and refuses its own parent | High if missed | High | T2 removes it; the gate-rules dead-owner arm runs exactly this path, over a fixture |
| A test reads an ignored file, so an isolated run differs from an in-place one | Low | High | the real-catalogue shard comparison (Follow-ups); ignored files are left out on purpose |
| A large untracked tree makes the copy slow | Low | Low | the copy follows `git ls-files --others --exclude-standard`, so ignored build output is never copied |
| The worktree fills the temp disk | Low | Medium | one worktree per campaign, removed on exit, swept by the next run |

## Rollback

`git revert` of the implementing commits. No persistent state changes shape: `checks.jsonl` records gain fields that older readers ignore, the verdict cache's format is unchanged, and `git stash create` writes no ref. `--in-place` is today's behaviour for anyone who needs it before a revert.

## Follow-ups

- [ ] Run one shard of the real catalogue isolated and compare it entry by entry with CI's in-place cache at the same commit: F-14 on the real catalogue.
- [ ] Retire the palace memory "a mutation campaign is live for peers" once an isolated campaign has shipped.
