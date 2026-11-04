# ADR-139: The landing run shortens its three longest required jobs, proven beside the jobs they replace

**Status:** Accepted
**Date:** 2026-11-04
**Owner:** Zy
**Spec:** None — no spec stage; the owner's decisions of 2026-11-03 ("faster releases", "measure first") and 2026-11-04 ("split all three"; for the JavaScript floor, "re-measure parallel first") and docs/BACKLOG.md §459 are the inputs
**Cross-references:** docs/adr/ADR-118-main-lands-only-a-sha-ci-passed.md, docs/adr/ADR-126-one-run-per-release.md, docs/adr/ADR-115-a-release-judges-the-load-the-run-did-not-bring.md, docs/adr/ADR-113-the-go-core-takes-the-rules-and-side-doors-are-enumerated.md, docs/adr/ADR-138-ci-runs-the-outside-run.md, CLAUDE.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; each adds mutants on the mechanism it implements
**Invalidates:** ADR-126 — Decision item 2, "the coverage floor is two parallel jobs, each one pass of the suite": the Python half becomes shards and a fan-in under the same name, and the JavaScript half may run at default concurrency. ADR-113 T5's accounting ("every tracked test file is reached by this run") is kept, and taken over one row merged from the Windows shards
**Served-path change:** None — this ADR changes only CI and repository tooling; nothing an adopter's session runs changes

## Context

Measured 2026-11-04 over the eight green landing runs 41592527973, 41632116030, 41636069045, 41653363871, 41690555178,
41696075531, 41708717802 and 41713618147 (docs/BACKLOG.md §459). From the run's creation to its last required check, queueing
included, a landing took 26–32 minutes (median 28); to its last job, which a release waits for, 31–40 (median 34.5). Per job:
`windows` 22–32, `coverage floor` 19–26, `coverage floor (python)` 17–27, `selftest (macos-latest)` 14–18,
`selftest (ubuntu-latest)` 8–12. The top three trade places run to run, so shortening one alone saves a few minutes. Each is one
runner doing the whole suite:

- `coverage floor`: serially (`--test-concurrency=1`, scripts/coverage.sh:110), for a deterministic figure: ten parallel runs on
  2026-08-27 measured 78.52–97.00 lines, ten serial ones 94.83–94.85. That measurement predates node 24 and two months of suite
  changes.
- `coverage floor (python)`: the whole suite again at node's default concurrency under coverage.py (scripts/coverage.sh:173).
- `windows`: the whole selftest; about 21 of its 25 minutes are the check step, 4 the full-history checkout (run 41713618147).

The cold review of this record (Codex, 2026-11-04) showed that per-shard JavaScript coverage cannot be merged into node's figure:
node merges raw V8 ranges by source offset before it summarizes, and lcov keeps only the summary; separate processes running the
two arms of one `if` give 100% branches whole and 66.67% merged. Handing node the shards' raw V8 files does not work either: a
coverage run reads only the files its own processes wrote (probed 2026-11-04, node 24.22.1). So the JavaScript floor is not
sharded here.

## Existing Primitives Audit

- `tests/helpers/shard.mjs` and the `*.shard-N.test.mjs` files: cut one heavy test FILE into slices. Kept; this record splits the
  list of files, and a sliced file's parts are ordinary entries in that list.
- `scripts/mutate.mjs` `--shard i/n` (mutate.mjs:862): balances by measured cost from the mutation cache. The suite has no such
  costs on CI (the per-file times ledger lives in a local git directory), so T1 starts deterministic and T5 measures balance.
- The mutation cache seed / merge jobs (`.github/workflows/selftest.yml`): shard jobs uploading artifacts, one job merging them.
  Reused for the fan-ins.
- coverage.py's `parallel = True`, `[paths]` and `coverage combine` (scripts/coverage.sh:162, 187): combine per-process data;
  the Python fan-in combines per-shard data the same way.
- `scripts/suite-accounting.mjs --row` (ADR-113 T5): reads ONE per-file row, the file's last line (suite-accounting.mjs:89). The
  Windows fan-in merges the shards' rows into one row and hands that to it unchanged.

## Decision

1. **`windows` and `coverage floor (python)` each become three shard jobs and one fan-in job.** A shard runs its slice of
   `tests/*.test.mjs` (T1: deterministic, every file in exactly one slice, the slice named in the log) and uploads an artifact
   named for its slice. The fan-in keeps the job id and `name:` the ruleset requires, so `.github/rulesets/main.json` and
   `land.mjs` do not change.
2. **A fan-in passes only on every shard's own success.** A `needs:` job is skipped when a need fails, a skipped job satisfies a
   required check, and a matrix's aggregate result has been reported `success` with a leg cancelled before it started. So every
   fan-in runs `if: always()` and calls `scripts/fan-in.mjs` (T2), which lists this run's jobs through the API and passes only when
   exactly the expected shard jobs exist, by name, each concluded `success`, and each one's artifact is present, readable and
   non-empty. Anything else fails it, naming the shard.
3. **The Python floor is judged once, on the combined data** of the three shards, with `coverage report --fail-under`; a combine
   that skips an unreadable data file fails instead of being ignored (scripts/coverage.sh:187 ignores it today).
4. **Windows accounting is over the union.** A Windows shard runs its slice and keeps its row; selftest.sh removes its shard
   variables from the environment its tests inherit, so a test that runs selftest.sh itself runs it whole. The fan-in merges the
   shards' rows into one and runs `suite-accounting.mjs --row` on it, so a file no shard ran is a finding there, as today. The
   non-suite checks of selftest.sh run in shard 1 only.
5. **The JavaScript floor runs at default concurrency only if that is now deterministic** (T3): a non-required probe job in the
   landing run measures it at default concurrency beside the serial job; after five landings, when every probe's lines, branches
   and functions are within 0.02 of the serial figure of the same run, `coverage floor` switches to default concurrency.
   Otherwise it stays serial, and its split is deferred.
6. **Each replacement is proven beside the job it replaces.** Each new layout first runs under a non-required name next to the
   unchanged required job; the required name moves to it only after one landing in which both agree (the Python totals, the
   Windows accounting) and the old job is removed in the same commit.

**What would make it fail, and the data that can show it.** T5 measures, from run creation to the last required check, the first
five landings after the switch, with their run ids. If the median is not below 20 minutes (against 28 today), the layout is
reverted (Rollback). If the JavaScript floor stays serial, its 19–26 minutes stay the floor, and T5 says so; so does
`selftest (macos-latest)` (14–18), which this record does not split.

## Alternatives Considered

- **Shard the JavaScript floor and merge lcov.** Rejected: the merge cannot reproduce node's figure (Context, the review's
  executed counterexample).
- **Shard it and merge raw V8 coverage with c8.** Rejected for now: it changes the measuring tool, so the floors would need
  recalibrating, and adds a dependency. Named as the next step if T3 finds parallel still unstable.
- **Split only the longest job.** Rejected by measurement: the three trade the lead run to run.
- **Larger runners.** Rejected: a billing change outside this repository.
- **Rename the jobs and PUT a new ruleset (as ADR-126 T2 did).** Rejected: a fan-in under the old name needs no ruleset change.

## Component / Boundary Impact

Repository tooling only: `scripts/test-slice.mjs` (new, T1), `scripts/fan-in.mjs` (new, T2), `scripts/coverage.sh` (T2, T3),
`scripts/selftest.sh` (T4), `.github/workflows/selftest.yml` (T2–T4). Nothing under `plugin/` changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `scripts/test-slice.mjs <i>/<n> <files…>` | new | T1 | coverage.sh, selftest.sh (T2, T4) |
| `scripts/fan-in.mjs --prefix <name> --count <n>` | new | T2 | the fan-in jobs (T2, T4) |
| `coverage.sh --python --shard <i>/<n> --out <dir>`; `QUALITY_HARNESS_COVERAGE_SHARDS=<dir>` | new | T2 | the workflow |
| `QUALITY_HARNESS_JS_CONCURRENCY` for `coverage.sh --js` | new | T3 | the probe job, then `coverage floor` |
| `QH_SELFTEST_SHARD=<i>/<n>`, `QH_SELFTEST_ROWS_OUT=<file>`; `scripts/merge-rows.mjs` | new | T4 | the workflow |
| Required checks on main | unchanged names | the workflow | the ruleset, `land.mjs` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `sliceFiles(files, i, n)` | T1 | T2, T4 | No — new |
| `fanIn(jobs, artifacts, prefix, count)` | T2 | T4 | No — new |
| the switched layouts on a landing run | T2, T3, T4 | T5 | No |

## Implementation

See `ADR-139-the-landing-run-splits-its-longest-jobs/tasks/README.md`.

## Consequences

- **Positive:** a landing waits for the longest of the macOS selftest, the JavaScript floor and the new shards instead of the
  slowest of three whole-suite jobs.
- **Negative:** six shard jobs and two fan-ins replace two jobs: eight more runner jobs per landing (nine while T3's probe runs),
  each paying checkout and setup (2–4 minutes; Windows 4), in the pool the 48 mutation shards already queue in. During each
  shadow landing, the old and new layouts both run.
- **Neutral:** local `bash scripts/selftest.sh` and `bash scripts/coverage.sh` are unchanged; the ruleset is unchanged.

## Out of Scope

- Splitting `selftest (macos-latest)` (deferred: docs/BACKLOG.md §459)
- Sharding the JavaScript floor with a raw-V8 merge tool (deferred: docs/BACKLOG.md §459)
- Cost-balanced slices from measured per-file times (deferred: docs/BACKLOG.md §459)
- The mutation shards' queueing, which sets the release's wall, not the landing's (deferred: docs/BACKLOG.md §459)
- Larger or self-hosted runners (permanent: boundary: a billing and infrastructure choice outside this repository)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A fan-in passes on a shard that failed, was skipped or cancelled, never ran, or left no artifact | Med | High | Decision item 2; T2 tests each case and mutates the check |
| A test running selftest.sh inherits a shard variable | High | Med | Decision item 4; T4 tests the nested run (tests/package.test.mjs:1108 is locked) |
| Python data files name different absolute paths per runner | Low | Med | T2 tests a combine from two checkout roots, with `[paths]` |
| Parallel JS coverage is still unstable | Med | Low | T3 keeps it serial; the split is deferred, not forced |
| The new shards queue behind the mutation shards | Med | Med | T5 measures queue-inclusive; revert if the median is not below 20 minutes |
| Uneven slices leave one shard as long as today's job | Med | Low | T5 records each shard; cost-balanced slices are the next step |

## Rollback

Revert the workflow to one job per name and drop the new flags; the ruleset never changed, so nothing outside the repository has
to be undone.

## Follow-ups

- [ ] Split `selftest (macos-latest)` if T5 shows it as the floor (docs/BACKLOG.md §459)
