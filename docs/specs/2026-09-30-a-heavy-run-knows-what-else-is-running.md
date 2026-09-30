# Spec: A heavy run knows what else heavy is running

> **Date:** 2026-09-30 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-077 (`docs/adr/ADR-077-a-heavy-run-holds-a-lease-and-names-its-neighbours.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** docs/research/2026-09-30-the-nervous-system-plan.md (N3), docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md (N1, whose load line this sits beside)

## Problem

N1 made every `qh-check` and campaign say the load at its ends. On 2026-09-30, every gate this
repository ran was marked unattributable, at load 10 to 20 on 10 cores at the end (BACKLOG, "A lead
for N2"). What a result cannot say is WHICH other heavy run it ran beside. So two sessions' gates
collide without either knowing, and nothing lets a run wait its turn.

## Goal

A participating heavy run names the participating runs it observed when its work started and when
it ended. Asked to wait, it starts only when no other participating run is running and none that
queued earlier is waiting, within a bound. Nothing is refused.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Session running a gate or campaign | human role | know which heavy runs its result ran beside, and optionally wait |
| Peer session | system | the same, from its side |

## Use Cases

### UC-1: A heavy run starts beside another

- **Trigger:** `qh-check`, or `node scripts/mutate.mjs` · **Preconditions:** another participating run holds a lease
- **Main flow:**
  1. The run publishes its lease.
  2. It names each other live lease, and each whose liveness is unknown, and records them.
  3. It runs; its exit and verdict are its own.
  4. It names the leases live at its end, and releases its lease once its work has ended.
- **Failure paths:** a. a lease's processes have all ended → it is removed, not named. b. a lease cannot be read, or its liveness cannot be probed → it is named as unknown, and kept. c. the lease directory cannot be used → the run says so and runs unleased.
- **Postconditions:** no lease of this run remains.

### UC-2: A heavy run waits its turn

- **Trigger:** the same, with `QUALITY_HARNESS_WAIT=1` or `--wait`
- **Main flow:**
  1. Its lease says it is waiting, with its ticket.
  2. It polls until no other lease is running and no waiting lease holds an earlier ticket.
  3. Its lease says it is running, and it runs as UC-1, saying how long it waited.
- **Failure paths:** a. the bound passes → it says it stopped waiting, and runs. b. it is stopped by a signal while waiting → it releases its lease, says so, and exits without running.
- **Postconditions:** as UC-1.

### UC-3: A campaign's lease covers its isolated child

- **Trigger:** `node scripts/mutate.mjs` · **Preconditions:** a git repository
- **Main flow:** the parent's lease records the isolated child's pid and group; it is live while any of them lives.
- **Failure paths:** a. the parent is killed while its child still works → the lease stays live until the child ends.
- **Postconditions:** as UC-1.

## Scenarios

### UC1-S1 [happy] A run beside others names them and records them, and its outcome is its own [@spec] → `tests/lease.test.mjs::a run beside others names and records them, and its exit and verdict are its own` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given two live leases held by other processes
When qh-check runs a failing check
Then it names both with their command, pid and root, records both as beside, and exits with the check's own code and verdict
```

### UC1-S2 [failure] A dead lease is removed, and an unreadable one is named as unknown [@spec] → `tests/lease.test.mjs::a dead lease is removed, and an unreadable one is named as unknown and kept` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given a lease whose process has ended, and a lease file that is not valid JSON
When a run starts
Then the first is gone and not named, and the second is named as unknown and kept
```

### UC1-S3 [failure] An unusable lease directory is said, and the run proceeds [@spec] → `tests/lease.test.mjs::a lease directory that cannot be used is said, and the run proceeds` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given a lease directory that is a file
When qh-check runs a check that exits 3
Then it says it could not use the lease, runs the check, and exits 3
```

### UC2-S1 [happy] A run asked to wait starts only after the other releases [@spec] → `tests/lease.test.mjs::a waiting run starts its check only after the running lease is released, and says how long it waited` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given a running lease that its holder releases after one second, recording when
When qh-check runs with QUALITY_HARNESS_WAIT=1
Then the check's start is after the release, and the run says how long it waited
```

### UC2-S2 [failure] A wait past its bound stops waiting and runs [@spec] → `tests/lease.test.mjs::a wait past its bound says so and runs, within the bound` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given a running lease that is never released
When qh-check runs with QUALITY_HARNESS_WAIT=1 and a one-second bound
Then it says it stopped waiting, names the lease, runs the check, and finishes within the bound plus the check
```

### UC2-S3 [failure] A signal while waiting releases the lease and runs nothing [@spec] → `tests/lease.test.mjs::a signal while waiting releases the lease and runs nothing` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given qh-check waiting behind a running lease
When it receives SIGTERM
Then it exits 143, its lease is gone, and the check never started
```

### UC2-S4 [happy] Two waiters are admitted in ticket order [@spec] → `tests/lease.test.mjs::two waiters are admitted in ticket order, one at a time` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given a running lease, and two qh-check runs waiting behind it
When the running lease is released
Then the waiter with the earlier ticket starts first, and the other starts only after it has ended
```

### UC3-S1 [happy] A campaign's lease names its child and is released at its end [@spec] → `tests/lease.test.mjs::a campaign holds a lease that records its isolated child, and releases it at its end` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given a campaign running in isolation over a fixture
When a qh-check starts during it
Then the qh-check names the campaign, the campaign's lease records its child, and no lease remains after it
```

### UC3-S2 [failure] A killed parent's lease stays while its child works [@spec] → `tests/lease.test.mjs::a killed campaign parent's lease stays live while its child works` cmd:`node --test tests/lease.test.mjs`

```gherkin
Given an isolated campaign whose parent is killed while its child still runs
When a run reads the leases
Then the campaign's lease is live, and it is removed only once the child has ended
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | While `qh-check` runs its check, and while a campaign runs, it holds a lease naming its pid, command, root, start and state. It is released only once its work has ended, after `qh-check`'s check has closed, or after a campaign's child group has ended. | `tests/lease.test.mjs::a run holds a lease while it runs and releases it at its end` | @spec | `node --test tests/lease.test.mjs` |
| F-2 | A run names, and `qh-check` records as `beside` and `besideAtEnd`, the other leases live or of unknown liveness when its work started and when it ended. The claim is those two observations, not every overlap. The exit code and verdict are unchanged. | `tests/lease.test.mjs::a run beside others names and records them, and its exit and verdict are its own` | @spec | `node --test tests/lease.test.mjs` |
| F-3 | A lease whose processes have all ended is removed and not named. A lease that cannot be read, or whose liveness cannot be probed (a probe error other than "no such process" or "not permitted"), is named as unknown and kept, unless it is over a day old. | `tests/lease.test.mjs::a dead lease is removed, and an unreadable one is named as unknown and kept` | @spec | `node --test tests/lease.test.mjs` |
| F-4 | With `QUALITY_HARNESS_WAIT=1` or `--wait`, a run publishes its lease as waiting, with the ticket (start, pid, lease name). It waits while any other lease is running, or waiting with an earlier ticket. It marks itself running before its work starts, and says how long it waited. | `tests/lease.test.mjs::a waiting run starts its check only after the running lease is released, and says how long it waited` | @spec | `node --test tests/lease.test.mjs` |
| F-5 | A wait is bounded by `QUALITY_HARNESS_WAIT_MAX_S` (default 1800). Past it, the run says it stopped waiting, names what it runs beside, and runs. On Windows, `qh-check`'s launcher timeout includes the bound. | `tests/lease.test.mjs::a wait past its bound says so and runs, within the bound` | @spec | `node --test tests/lease.test.mjs` |
| F-6 | A lease directory that cannot be read or written is said ("could not use the lease: <reason>"), and the run proceeds unleased with its own exit. | `tests/lease.test.mjs::a lease directory that cannot be used is said, and the run proceeds` | @spec | `node --test tests/lease.test.mjs` |
| F-7 | The lease directory is `$QUALITY_HARNESS_LEASE_DIR`, else `quality-harness-leases` under the OS temp directory. | `tests/lease.test.mjs::the lease directory is the environment's, else one under the temp directory` | @spec | `node --test tests/lease.test.mjs` |
| F-8 | A lease is published under a name unique to the run, written in full before it is visible, and a run removes only its own lease. | `tests/lease.test.mjs::a run holds a lease while it runs and releases it at its end` | @spec | `node --test tests/lease.test.mjs` |
| F-9 | A run stopped by SIGINT or SIGTERM while waiting releases its lease, says so, and exits 130 or 143 without starting its work. | `tests/lease.test.mjs::a signal while waiting releases the lease and runs nothing` | @spec | `node --test tests/lease.test.mjs` |
| F-10 | Two waiters are admitted one at a time, in ticket order. | `tests/lease.test.mjs::two waiters are admitted in ticket order, one at a time` | @spec | `node --test tests/lease.test.mjs` |
| F-11 | A campaign's lease records its isolated child's pid and group, and stays live while any of them lives, including after the parent is killed. | `tests/lease.test.mjs::a killed campaign parent's lease stays live while its child works` | @spec | `node --test tests/lease.test.mjs` |
| F-12 | A campaign's own test runs, and this repository's selftest, use a private lease directory, so a test never reads or writes the machine's leases. | `tests/lease.test.mjs::a campaign's tests and the selftest use a private lease directory` | @spec | `node --test tests/lease.test.mjs` |

## Domain

A **lease** is one participating run's announcement: pid, command, root, start, state and, for a
campaign, its child. It is **live** while any process it names lives. Its **ticket** orders waiters.
**Participating** runs are `qh-check` and mutation campaigns.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `qh-check` record | new optional `beside`, `besideAtEnd`, `waitedMs` | the completion and commit advisories (ignore them); N2's reader |
| `qh-check --wait`, `mutate.mjs --wait`, `QUALITY_HARNESS_WAIT`, `QUALITY_HARNESS_WAIT_MAX_S`, `QUALITY_HARNESS_LEASE_DIR` | new | sessions; tests |
| `plugin/bin/qh-check` (Windows launcher) | its timeout includes the wait bound | Windows sessions |

## Non-Goals

- Refusing or killing a run because another is running: CLAUDE.md §3 (advice only), and the owner's N3 choice (2026-09-30).
- `adr-verify` fences and arbitrary builds as participants: they join in their own record, once N2 has shown how often they collide.
- Coordinating across machines or users.
- Every overlap: the record holds two observations, at the work's start and end.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A pid is reused, so a dead run's lease reads as live | Low | Low | the bound ends a waiter; the line names the command, which is a claim the lease makes, not a check of the process |
| Waiting hides a slow run behind another | Med | Med | waiting is opt-in and bounded, and says how long it took |
| A lease written by an older or broken version is not valid | Low | Low | named as unknown, kept for a day, then swept |

## Open Questions

<!-- Empty: the grill closed with every checklist item mapped to a Fact. -->

## Verify

```bash
spec-verify --spec docs/specs/2026-09-30-a-heavy-run-knows-what-else-is-running.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | What may a run do when another heavy run holds the machine? | F-2 | owner, 2026-09-30: advise always, wait only when opted in; no new refusal |
| 2 | Which runs participate? | F-1 | defaulted by the session under the owner's goal of 2026-09-30: `qh-check` and campaigns; the rest wait for N2's data |
| 3 | How long may a waiter wait? | F-5 | defaulted: 1800 s, configurable |
| 4 | Where do leases live? | F-7 | defaulted: an environment override, else under the OS temp directory |
| 5 | Codex's cold review of ADR-077 (2026-09-30): what admits a waiter? | F-4, F-10 | a running lease blocks; an earlier ticket blocks; the ticket is (start, pid, name) |
| 6 | Same review: what does `beside` claim? | F-2 | the two observations, at the work's start and end, not every overlap |
| 7 | Same review: when is a lease released? | F-1, F-9, F-11 | after the work has ended, not on the signal; a campaign's covers its child |
