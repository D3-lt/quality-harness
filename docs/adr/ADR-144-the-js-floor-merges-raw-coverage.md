# ADR-144: The JavaScript floor is cut only once a merged raw-V8 measurement equals its serial twin on CI

**Status:** Withdrawn
**Date:** 2026-11-10
**Owner:** Zy
**Spec:** None — no spec stage; docs/BACKLOG.md §459 ("the JavaScript floor itself, whose cut needs a raw-V8 merge (c8 or similar) and recalibrated floors, as a record of its own") and the Outcome of the withdrawn ADR-139 are the inputs
**Cross-references:** docs/adr/ADR-139-the-landing-run-splits-its-longest-jobs.md, docs/adr/ADR-126-one-run-per-release.md, docs/adr/ADR-118-main-lands-only-a-sha-ci-passed.md, docs/adr/ADR-115-a-release-judges-the-load-the-run-did-not-bring.md, docs/adr/ADR-138-ci-runs-the-outside-run.md, scripts/coverage.sh, .github/workflows/selftest.yml, .github/rulesets/main.json, CLAUDE.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T1 and T2 each add a catalogue mutant on the mechanism they implement
**Invalidates:** none — checked: ADR-126 Decision item 2 ("each one pass of the suite") still holds, since a sharded pass is still one pass in one job; no accepted record mandates `--test-concurrency=1` (`git grep -l test-concurrency -- docs/adr` names ADR-006 and ADR-072, which cite the parent-process limit, and the withdrawn ADR-139)
**Served-path change:** None — this ADR changes only CI and repository tooling; nothing an adopter's session runs changes

## Context

A landing waits for its longest required check (ADR-118). Measured 2026-11-04 over the eight green landing runs 41592527973,
41632116030, 41636069045, 41653363871, 41690555178, 41696075531, 41708717802 and 41713618147 (docs/BACKLOG.md §459): a landing
took 26–32 minutes from run creation to its last required check (median 28), and `coverage floor` 19–26 of them. That job runs
the whole suite in one `node --test --test-concurrency=1 --experimental-test-coverage` process (scripts/coverage.sh:110). The
serial setting is there for determinism: on 2026-08-27, ten parallel runs measured 78.52–97.00 lines and ten serial ones
94.83–94.85 (scripts/coverage.sh:105-108), on node and a suite two months older than today's.

ADR-139 tried the cheap cut and was withdrawn (its Outcome). Its parallel probe ran node's own coverage at default concurrency
beside the serial job: on run 41872532283 it measured branches 88.88 against the serial 88.91, over the 0.02 it allowed, and on
run 41880608348 its measuring step ran 55 minutes and never concluded. The serial floor took 25 minutes on that run, so it
bounds every landing. Its review also showed two merges that do not work (ADR-139 Context, 2026-11-04): per-shard lcov loses
branch identity (two processes each running one arm of one `if` give 100% branches whole and 66.67% merged), and node's coverage
run reads only the raw V8 files its own processes wrote (probed on node 24.22.1). ADR-139 named the remaining route, a raw-V8
merge with c8, as the next step and as a record of its own, because it changes the measuring tool (its Alternatives and Outcome).

This record is that step, and it is not a re-proposal of what ADR-139 killed: it neither runs node's own coverage in parallel
nor merges lcov. It does change the tool, so its first task measures and decides nothing on prose.

**Two statements kept apart.** Measured: a per-process summary merge loses branch identity (ADR-139's counterexample above).
Hypothesis H1, not a fact: the 0.03 gap of run 41872532283, like the 2026-08-27 swings, comes from how per-process coverage is
combined, not from the tests running different code, so a merge of raw V8 ranges over every process the suite starts is
independent of order and concurrency and gives the serial figure exactly. Nothing has tested H1; a local probe of c8 on the
two-arm counterexample was refused by this session's permission classifier on 2026-11-10, so the counterexample is T1's first
CI step. H1 is false if a test's timing changes which branches run under contention; T1's comparison shows that as a gap.

**The class**, enumerated 2026-11-10 with `git grep -n -e experimental-test-coverage -e NODE_V8_COVERAGE -e test-concurrency
-- scripts .github tests plugin`: one place measures JavaScript coverage (scripts/coverage.sh:110, called only by the
`coverage floor` job, .github/workflows/selftest.yml:112), and two test files read `NODE_V8_COVERAGE` to widen their budgets
under instrumentation (tests/corpus-lint.test.mjs:26, tests/publish-command.test.mjs:709 and :775). Node's coverage sets that
variable in its children, and so does the raw form, so both keep the widened budgets. Nothing else is a member.

## Existing Primitives Audit

- `scripts/coverage.sh` `--js`: the floor, its excludes (`**/tests/**`, `scripts/mutate.mjs`, coverage.sh:84), the floors
  (coverage.sh:40-58), the core build and `QUALITY_HARNESS_OBSERVE_BUDGET_MS` it exports, and the failing-test-versus-floor
  distinction (coverage.sh:115-131). Reused: the raw form is a mode of the same script, so the environment the suite sees is the
  same one; only the measuring command differs.
- `NODE_V8_COVERAGE`: node's own raw-profile output, inherited by every node process the suite starts. Reused as the collector.
- c8: reads a directory of raw V8 profiles and merges them by source range before it reports. Added, through `npx -y c8@<exact>`
  like knip in scripts/dead-code-scan.sh:92, since the repository ships no package.json (dead-code-scan.sh:10-11).
- ADR-139's withdrawn `scripts/test-slice.mjs` and `scripts/fan-in.mjs`: removed in its rollback and not revived. The raw form
  slices processes inside one job, so no fan-in is needed (Decision 2).

## Decision

1. **Measure first, on CI only (T1).** `bash scripts/coverage.sh --js --report --raw <n>` runs the suite as `<n>` concurrent
   `node --test --test-concurrency=1` processes on one runner, each over a deterministic slice of `tests/*.test.mjs` (every file in
   exactly one slice), all writing raw V8 profiles to one directory, then reports lines, branches and functions from one c8 merge
   of that directory with the floor's excludes. `--raw 1` is the same tool over the unsliced suite. `--root <dir>` (default: the
   repository) names the tree whose `tests/*.test.mjs` run and whose files are measured, so a fixture tree in a temporary
   directory goes through the same runner. The runner exits non-zero, naming the cause, when any slice fails (not only the last),
   when the merge fails, and when the merged report is unreadable or measured no file. Two non-required jobs in every landing
   run, `coverage raw probe (serial)` (`--raw 1`) and `coverage raw probe (sharded)` (`--raw 4`, the vCPU count of the standard
   Linux runner, recorded from `nproc`), run beside `coverage floor`, which additionally keeps node's lcov as an artifact (its
   command and verdict otherwise unchanged). Each probe keeps c8's per-file JSON summary as an artifact and prints one line naming
   its sha, slice count, three figures, file count, wall seconds and merge seconds; the sharded job first runs the two-arm
   counterexample and fails unless c8 reports 100% branches for it. A third non-required job, `coverage raw compare`, runs after
   all three with `if: always()` and applies Decision 4 to their artifacts through `scripts/coverage-compare.mjs`.
2. **One runner, process slices, no job fan-in for the gate.** A `needs:` fan-in can pass on a skipped shard (ADR-139 Decision 2),
   and its guard was removed with ADR-139. Slicing inside one job keeps the required check one job with one exit code. The
   compare job is a fan-in, but it is never required and gates nothing: a run whose compare job did not print a verdict is not
   counted.
3. **The comparison is like for like, and accounts for the existing floor's whole surface.** The figures compared are the
   sharded raw figure and the serial raw figure of the same run: same tool, same sha. The raw figures will differ from today's
   native figure regardless of sharding, since every node process the suite spawns now writes a profile; that delta is recorded
   per run as T2's recalibration input, never as a pass or fail. The file sets are not left to the figures: every file in the
   native lcov (its `SF:` lines) must be in each raw report, or be named with its reason in `scripts/coverage-raw-unmeasured.txt`,
   one `path — reason` per line; a file the raw reports add is recorded, not a failure. So two probes that measured the same
   truncated surface, or nothing, cannot agree their way to a pass.
4. **The criterion, and what makes it fail.** `scripts/coverage-compare.mjs <native-lcov> <serial-summary> <sharded-summary>`
   exits 0 only when all three reports are readable and non-empty (at least one file, a non-zero line total), the native file set
   is accounted for in each raw report (Decision 3), the serial and sharded raw reports cover the same file set, and each of
   lines, branches and functions of the sharded report is within 0.02 of the serial one (0.02 is the spread ten serial native
   runs showed on 2026-08-27, what the floor tolerates today; H1 predicts 0.00, and any non-zero gap is printed with the files it
   is in). It exits 1 naming each failure, and 2 naming a missing or unreadable artifact: UNRUN, never a verdict (ADR-005). The
   cut-over is taken only when five counted landing runs (a run whose probe was cancelled for capacity, or whose compare job
   exited 2, is named and not counted) each exit 0, and the sharded job's own duration has a median at or under 14 minutes and
   none over 18 (14–18 is `selftest (macos-latest)`, §459, so the JavaScript floor stops being the longest required check). It
   fails on any compare exit 1 in a counted run, on a probe reaching its 30-minute timeout (run 41880608348's hang is the
   precedent), or on the duration. A run in which a probe fails a test that `coverage floor` passed on the same sha is not
   counted, and the test is fixed as its own change (T1 Stop Condition); if it cannot pass in the sharded form without being
   removed from it, the criterion fails. The data that can fail it exists: every landing run will carry both probes.
5. **Cut over only on that criterion (T2).** `coverage floor` keeps its job id and name, so the ruleset does not change
   (.github/rulesets/main.json:19); it runs the sharded raw form, enforcing through c8's threshold check, and the native serial
   form, the probes and the compare job are removed. Each
   floor is the integer part of the lowest of T1's five serial raw figures for its metric, written in coverage.sh with the run ids
   and the date: today's lines and functions floors are that rule (94 under 94.83, 95 under 95.59), and branches sits one lower
   for the noise coverage.sh:41-55 records, a correction the raw form is measured to need or not. If the criterion fails, the
   probes are removed, the floor stays serial, and §459 records why.

## Alternatives Considered

- **Node's own coverage at default concurrency.** Rejected: ADR-139 measured it, a 0.03 branch gap and a 55-minute hang
  (runs 41872532283, 41880608348).
- **Shard into jobs and merge lcov.** Rejected: lcov keeps summaries, and summaries cannot be merged (ADR-139's counterexample).
- **Shard into jobs and merge their raw V8 directories** through artifacts and a fan-in job. Not first: it brings back the
  fan-in that can pass on a skipped shard, and a runner's queue wait per job (ADR-139's fan-ins queued about ten minutes behind
  the mutation shards). It stays the next step if one runner's four processes cannot meet 14 minutes.
- **Hand node the merged raw directory.** Rejected: a node coverage run reads only the files its own processes wrote (ADR-139
  Context, probed 2026-11-04).
- **Cut first and recalibrate on the first red.** Rejected: a floor recalibrated against an unmeasured tool is a guess, and the
  owner asked to measure first (§459, 2026-11-03).
- **Lower the floor's cost by dropping files from it.** Rejected: a floor that measures less proves less.
- **Larger runners.** Rejected: a billing change outside this repository.

## Component / Boundary Impact

Repository tooling only: `scripts/coverage.sh` (T1, T2), `scripts/coverage-compare.mjs` (T1), `.github/workflows/selftest.yml`
(T1, T2), fixture trees and new test files per task.
Nothing under `plugin/` changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `coverage.sh --js --raw <n>`, `--root <dir>`, `--plan` | new | T1 | the probe jobs (T1), `coverage floor` (T2), the runner tests |
| `QUALITY_HARNESS_JS_LCOV=<file>` for `coverage.sh --js` | new: node's lcov kept beside the unchanged verdict | T1 | `coverage floor`'s artifact, the compare job |
| `scripts/coverage-compare.mjs <native-lcov> <serial-summary> <sharded-summary>`; `scripts/coverage-raw-unmeasured.txt` | new | T1 | `coverage raw compare` |
| c8, pinned to an exact version in coverage.sh | new dependency, fetched by `npx` | T1 | coverage.sh |
| `coverage raw probe (serial)`, `coverage raw probe (sharded)`, `coverage raw compare` | new non-required jobs, removed by T2 | T1 | the release's wait for every job (CLAUDE.md §13 step 4) |
| `coverage floor` | runs the raw sharded form, recalibrated floors | T2 | the ruleset (name unchanged), `land.mjs` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `coverage.sh --js --raw <n>` | T1 | T2 | No — new |
| the five runs' figures in docs/BACKLOG.md §459 | T1 | T2 | No |

## Implementation

See `ADR-144-the-js-floor-merges-raw-coverage/tasks/README.md`.

## Consequences

- **Positive:** if the criterion holds, a landing stops waiting on a 19–26 minute serial pass, and the floor counts code the
  suite reaches through child processes, which node's parent-process view could not (coverage.sh:99-103).
- **Negative:** three more runner jobs per landing while T1 measures, two of them a full pass of the suite, in the pool the 48 mutation
  shards queue in; the release waits for them (CLAUDE.md §13 step 4). A network fetch of a pinned tool in a required job after
  T2. Floors move once, by measurement, which reads like a lowered bar unless the record and the script say why.
- **Neutral:** local `bash scripts/coverage.sh --js` is unchanged until T2.

## Out of Scope

- The mutation shards' queueing, which sets the release's wall rather than the landing's (deferred: docs/BACKLOG.md §459)
- The Python floor and the Windows selftest (permanent: boundary: ADR-139 measured both; their split was rolled back with it and is not this record's)
- Larger or self-hosted runners (permanent: boundary: a billing and infrastructure choice outside this repository)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| H1 is false: tests take timing-dependent branches under contention, so sharded and serial differ | Med | Med | T1 records the gap and its files; the floor stays serial (Decision 5) |
| One profile per spawned node process makes the c8 merge slow or the directory large | Med | Med | each line records merge seconds apart from wall; a 30-minute job timeout ends a hang |
| A budgeted test fails under the raw form's instrumentation or contention | Med | Low | it is named, the run is not counted, and the test's budget is fixed as a separate change (T1 Stop Condition) |
| The raw figure includes files node's view did not, or misses some (copied plugin trees in temp directories) | High | Med | the compare script requires every native file in each raw report or a named reason for it; added files are recorded |
| Both probes measure the same incomplete or empty surface and agree | Med | High | Decision 3 and 4: non-empty reports and the native file set accounted for; tests feed the compare script an empty and a commonly truncated pair |
| A pinned c8 cannot be fetched on a runner | Low | High | after T2 the required job fails, naming the fetch, which is red, not a pass |
| The probes lengthen the release | Med | Low | they run in parallel with the existing jobs; T1 records their queue time |

## Rollback

Before T2: delete the three probe jobs, the lcov artifact, the compare script and the `--raw` mode; nothing required changed. After T2: revert T2's commit; the serial
native form and its floors return, and the ruleset, never changed, needs nothing.

## Follow-ups


## Outcome

Withdrawn 2026-11-11 before any task ran: the owner stopped development of quality-harness and froze the repository
(docs/BACKLOG.md §473). No code changed under this record; its tasks stay as written, unexecuted.
