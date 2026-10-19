# ADR-115: A release judges the load the run did not bring

**Status:** Accepted
**Date:** 2026-10-19
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-19, choosing "Fix the measure" when `scripts/release.mjs` stopped 3.8.47 on two passes it read as contended
**Cross-references:** docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md, docs/adr/ADR-100-a-repeated-procedure-is-one-command.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks
**Served-path change:** none — `scripts/release.mjs` is this repository's tooling and does not ship

## Context

`scripts/release.mjs` counts a full check's pass only when the machine was not contended across it, read with ADR-075's `contention` over two samples of the 1-minute load average, one before the check and one when it exits (ADR-100 T3; v3.8.25 was pushed on a pass `qh-check` had recorded as unattributable). The end sample holds the check's own load: the selftest runs one fewer workers than the cores, and each test spawns git, Python and Node beside it.

Measured 2026-10-19 on this machine (10 cores, idle at a load of 6 to 9 with a VM, the window server and other sessions running): five full selftests through `qh-check` started at 6.1 to 8.7, ended at 14.0 to 19.7, and took 202 to 209 s each. The wall times are within a few percent whatever the end load, so the end load was the run's own. Every one read as contended, and `release.mjs` stopped 3.8.47 twice with nothing pushed.

A first idea, end load against start load plus the run's worker count, does not clear these runs either: 6.89 → 16.59 with 9 workers is above 15.89. The run's own load is not bounded by its worker count.

## Existing Primitives Audit

- **`contention` and `sampleLoad`** (`plugin/scripts/load.mjs`, ADR-075 T1): kept as they are. `qh-check`'s "unattributable" line still uses both samples, and ADR-075 left "a reader that acts on `contended`" to a later record, which `release.mjs` is.
- **`waitFor`** in `release.mjs`: its predicate, `contention(s, s, cores) === false`, is the test of a quiet machine this record reuses.

## Decision

1. **The start sample stands; the end sample is taken once the run's own load has decayed.** After the check exits, `release.mjs` samples the load every 30 s, for at most 4 minutes, until it is at or below the core count. A sample there means the load from everything else is at or below it too: not contended. A load still above the count at 4 minutes is other work: contended. The 1-minute average keeps about 2% of a load that stopped 4 minutes earlier, so the bound is long enough for the run's own load to leave and short against a release.
2. **The rest is unchanged:** a contended pass is taken again once the load is below the count, a second stops the release with nothing pushed, and a load that cannot be read is not contended.
3. **`plugin/` is not touched.** `contention`, `qh-check`'s load line and ADR-075's definition stay as they are.

**This fails if** a release goes on after a pass whose start sample was above the core count, or whose load stayed above it for the whole bound after the check; or if the wait has no bound.

## Alternatives Considered

- **End load against start load plus the worker count.** Rejected: it does not clear today's runs, since nested spawns put more on the machine than the workers.
- **An owner override flag.** Not chosen: the owner asked for the measure to be fixed rather than set aside.
- **Judge a run by its slowdown against its own history** (`selftest-files.jsonl`). Rejected for now: a slower run is a better signal of contention than a load average, but it needs a baseline per file and a threshold nobody has measured.

## Component / Boundary Impact

`scripts/release.mjs` only. This repository has no architecture document.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `release.mjs`'s check step | the end sample is taken after the run's load decays, for at most 4 minutes | T1 | the release |
| CLAUDE.md §13 step 1 and `.claude/rules/13-releasing.md` | say what "not contended across it" means now | T1 | a reader of the release rules |

## Inter-task Contracts

None — one task.

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** a release can go out on a busy but uncontended machine, and still stops on one others are saturating.
- **Negative:** up to 4 minutes more per release check; a spike between the two samples is still unseen (an endpoint observation, as before).
- **Neutral:** `qh-check` still says "unattributable" for these runs; only the release reads them differently.

## Out of Scope

- `qh-check`'s own load line (permanent: boundary: ADR-075 owns it, and a pass a person reads as unattributable stays so)
- A slowdown-based measure (deferred: docs/BACKLOG.md §384)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Other work starts as the run ends, and the settle wait reads it as contention | Low | Low | the release stops with nothing pushed and says why; running again resumes |
| Other work ran mid-run and stopped before the end | Med | Med | unchanged from today: the load line says it is an endpoint observation |

## Rollback

Revert T1's commit; `release.mjs` reads the end sample at exit again.

## Follow-ups

- [x] Owner decision: Accepted, 2026-10-19, so 3.8.47 can be released on it.
