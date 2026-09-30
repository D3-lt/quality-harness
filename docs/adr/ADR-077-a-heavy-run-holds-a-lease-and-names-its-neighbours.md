# ADR-077: A heavy run holds a lease, and names the heavy runs beside it

**Status:** Accepted
**Date:** 2026-09-30
**Owner:** Zy
**Spec:** docs/specs/2026-09-30-a-heavy-run-knows-what-else-is-running.md
**Cross-references:** docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md, docs/research/2026-09-30-the-nervous-system-plan.md
**Governs:** plugin/scripts/qh-check.mjs, plugin/bin/qh-check, scripts/mutate.mjs, scripts/selftest.sh, tests/campaign-fixture.mjs
**Enforced-by:** `tests/lease.test.mjs::a run beside others names and records them, and its exit and verdict are its own`
**Invalidates:** none — checked. `adr-context` over `plugin/scripts/qh-check.mjs` and `scripts/mutate.mjs` (2026-09-30) names ADR-060, ADR-061 and ADR-075 among others. This record adds fields to the `qh-check` record, which older readers ignore as they ignore ADR-075's, and refuses nothing (CLAUDE.md §3).
**Served-path change:** `qh-check` (shipped) holds a lease while its check runs, names the leases it observed at its start and end, and with `QUALITY_HARNESS_WAIT=1` or `--wait` waits its turn under a bounded admission protocol.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-09-30-a-heavy-run-knows-what-else-is-running.md). Decision-relevant deltas:

- This is N3 of docs/research/2026-09-30-the-nervous-system-plan.md, split from §301's Stage 7.
- On 2026-09-30 every `qh-check` of this repository that ADR-075's load line judged was unattributable (BACKLOG, "A lead for N2"). No result could say which run it overlapped.
- The owner chose the action on 2026-09-30: advise always, wait only when opted in (spec Grill Log row 1).
- **A cold Codex review of the first draft (2026-09-30) asked for changes, with ten findings, each checked against source and folded in.** Two admission rules contradicted each other and neither had a tie-break. The stubs used the test process as a "neighbour" whose own lease would overwrite it. Release on a signal would have announced a check still closing (`runLaunched` owns forwarding, `plugin/scripts/qh-check.mjs:64`). A parent-only campaign lease vanished while its isolated child worked. The Windows launcher bounds the whole run to the check's timeout plus 60 s (`plugin/bin/qh-check:82`). Publication, removal and unreadable leases had no contract. The campaign's `--wait` was promised but not planned. Tests asserted effects weaker than their facts. Existing test callers would share the machine's leases. And `beside` claimed every overlap where it records two observations (spec Grill Log rows 5-7).
- The class of heavy runs, enumerated 2026-09-30 from `plugin/bin`, `plugin/scripts` and `scripts`: `qh-check`, `mutate.mjs` campaigns, `adr-verify` fences, `unasserted.mjs` and `campaign-parity.mjs`. This record takes the first two (spec Non-Goals).

## Existing Primitives Audit

- **ADR-075's load line** (`plugin/scripts/load.mjs`): unchanged; `beside` sits beside `contended`.
- **`alive(pid)` in `scripts/mutate.mjs`**: reads every probe error but `EPERM` as dead. Moved to `plugin/scripts/lease.mjs` with a third answer: `ESRCH` is dead, `EPERM` is alive, anything else is unknown. The campaign imports it back.
- **ADR-075's campaign ownership** (the parent pid, the child pid, the child's process group, `groupAlive`): the campaign's lease records the same, so it is live exactly while ADR-075's lock would be.
- **`runLaunched` in `plugin/scripts/qh-check.mjs`**: owns signal forwarding during the check and returns the observed signal. It is unchanged; the lease is released after it returns, never inside a handler.
- **`childEnv` in `scripts/mutate.mjs`** and **`campaignEnv` in `tests/campaign-fixture.mjs`**: each gains a private `QUALITY_HARNESS_LEASE_DIR`, so no test run reads or writes the machine's leases.

## Decision

**A lease.** `plugin/scripts/lease.mjs` exports `leaseDir(env)`, `take`, `mark`, `observe`, `release` and `alive`.
- The directory is `$QUALITY_HARNESS_LEASE_DIR`, else `quality-harness-leases` under the OS temp directory (F-7).
- A lease is `<dir>/<pid>-<start ms>-<random>.json`: `{ pid, child?, group?, command, root, start, state }`. It is written to a temporary name and renamed, so no reader sees half a lease, and a run removes only the file it wrote (F-8).
- `observe(dir, self)` reads every other lease. One whose processes have all ended is removed. One that cannot be read, or whose probe answers unknown, is reported as unknown and kept, unless over a day old. The rest are live (F-3).
- A directory that cannot be used is said ("could not use the lease: <reason>"), and the run proceeds unleased (F-6).

**What a run says and records.** After taking its lease, and again when its work ends, a run prints one line per live or unknown lease: "running beside <command> (pid N, since <time>, in <root>)" or "… unknown: <file>". `qh-check` records the two observations as `beside` and `besideAtEnd`, plus `waitedMs`. The claim is those two instants, not every overlap. Exit code and verdict are the check's own (F-2).

**Admission, only when asked.** With `QUALITY_HARNESS_WAIT=1` or `--wait`, a run publishes its lease as `waiting`. Its ticket is (start, pid, lease name), a total order. Each second it observes: it may start when no other lease is `running` and none `waiting` holds an earlier ticket. It then marks its lease `running` before its work starts, and says how long it waited (F-4, F-10). A waiter never blocks one ahead of it, so there is no deadlock. The bound, `QUALITY_HARNESS_WAIT_MAX_S` (default 1800), ends a wait with "stopped waiting" and the run proceeds (F-5). An unknown lease blocks like a running one until the bound, since whether it runs cannot be told. A waiter stopped by SIGINT or SIGTERM releases its lease and exits 130 or 143 without starting (F-9).

**Release after the work, not on the signal.** `qh-check` releases in a `finally` after `runLaunched` returns, so a check still closing keeps its lease. A campaign's parent adds its isolated child and, on POSIX, its group to the lease once spawned. It releases only when ADR-075's group-ended wait has confirmed the end. A parent killed outright leaves a lease that stays live while the child lives, and the next observer removes it once all have ended (F-1, F-11).

**Windows.** `plugin/bin/qh-check` bounds the Node process by the check's timeout plus the wait bound (when waiting) plus 60 s (F-5). A forced termination there leaves a lease that the next observer removes once its pid has ended.

**Tests never share the machine's leases.** `scripts/selftest.sh` exports a temporary `QUALITY_HARNESS_LEASE_DIR` and clears `QUALITY_HARNESS_WAIT`. `childEnv` gives each campaign test run a lease directory in its scratch, and `campaignEnv` gives each fixture campaign one (F-12).

**What would make this fail, and whether the data exists.**
- **Naming and admission.** F-2, F-4 and F-10 fail if a participating run misses a neighbour at either observation, or starts while another runs. The fixture tests order the events rather than time them.
- **Collisions in use.** The plan's criterion needs three days of ordinary use. `beside`, `besideAtEnd` and `waitedMs` in the `qh-check` records supply `qh-check`'s side. A campaign-only collision enters the data through the `qh-check` that ran beside it. It is a follow-up, not a task.

## Alternatives Considered

- **Refuse to start beside another heavy run.** Rejected by the owner (spec Grill Log row 1) and by CLAUDE.md §3.
- **Wait by default.** Rejected by the owner: a waiter hides a slow run behind another.
- **A lock with one holder.** Rejected: it cannot name every neighbour, and a stale holder blocks everyone.
- **Read the process table for heavy commands.** Rejected: it guesses what is heavy from command lines (§16), where a lease is each run's own statement.
- **Wait for older leases only, or for every lease (the first draft's two rules).** Rejected by Codex's review: the first starves a newcomer behind a later arrival's equal timestamp, and the second deadlocks two waiters until the bound.

## Component / Boundary Impact

`plugin/scripts/lease.mjs` is new and owns the lease files. `qh-check` and the campaign are its callers.

## Wiring & Contract Changes

Inherited from docs/specs/2026-09-30-a-heavy-run-knows-what-else-is-running.md §Contracts Touched; delta:

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `plugin/scripts/lease.mjs` | new: `leaseDir`, `take`, `mark`, `observe`, `release`, `alive` | T1 | `plugin/scripts/qh-check.mjs` (T1), `scripts/mutate.mjs` (T2) |
| `<lease dir>/<pid>-<start>-<random>.json` | new: `{ pid, child?, group?, command, root, start, state }` | T1 | every participating run |
| `qh-check` record `beside`, `besideAtEnd`, `waitedMs` | new optional fields | T1 | N2's reader; older readers ignore them |
| `plugin/bin/qh-check` timeout | includes the wait bound | T1 | Windows sessions |
| `scripts/selftest.sh`, `childEnv`, `campaignEnv` | a private lease directory | T1, T2 | the suite |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `take`, `mark`, `observe`, `release`, `leaseDir` and `alive` in `plugin/scripts/lease.mjs` | T1 | T2 | No — new |

## Implementation

See `tasks/README.md` and one file per task:

- **T1:** the lease module, and `qh-check` taking, observing, waiting and releasing.
- **T2:** a campaign takes the same lease, covering its child, and waits when asked.

## Consequences

- **Positive:** a result names the heavy runs it observed, and a session may queue behind them.
- **Negative:** each participating run writes and removes one small file and polls once a second while waiting.
- **Neutral:** on Linux the temp directory is shared, so users on one machine see each other's leases; on macOS it is per user.

## Out of Scope

Inherited from docs/specs/2026-09-30-a-heavy-run-knows-what-else-is-running.md §Non-Goals; delta:

- `adr-verify` fences, `unasserted.mjs` and `campaign-parity.mjs` as participants (deferred: docs/research/2026-09-30-the-nervous-system-plan.md, N2's data first)
- The plan's three-day collision criterion (deferred: docs/research/2026-09-30-the-nervous-system-plan.md, a follow-up here)
- A pid reused by an unrelated process keeps a dead run's lease live (permanent: boundary: the lease's command is the run's own claim, not a check of the process; the wait bound ends its effect)

## Risks

Inherited from docs/specs/2026-09-30-a-heavy-run-knows-what-else-is-running.md §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| An unknown lease blocks every waiter until the bound | Low | Med | it is named, and the bound ends it |
| A campaign's isolated child is counted as its own neighbour | Med | Low | the child never takes a lease (ADR-075's `QUALITY_HARNESS_CAMPAIGN_CHILD` marker) |

## Rollback

`git revert` of the implementing commits, and delete the lease directory. The new record fields are ignored by every reader that predates them.

## Follow-ups

- [ ] After three days of ordinary use with 3.2.x, count the `qh-check` records whose `beside` or `besideAtEnd` is non-empty, with and without waiting, and record the count in BACKLOG (the plan's N3 criterion).
