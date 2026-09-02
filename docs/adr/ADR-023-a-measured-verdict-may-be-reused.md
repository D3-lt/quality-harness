# ADR-023: Reuse a mutation verdict only when nothing it rests on has changed

**Status:** Accepted
**Date:** 2026-09-02
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md, docs/adr/ADR-010-a-claim-is-re-checked-or-it-is-not-counted.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md
**Governs:** `scripts/mutate.mjs`, `.github/workflows/selftest.yml`
**Enforced-by:** `mutate: a reused verdict is refused when its subject or its tests changed`
**Invalidates:** none — checked, and the check is the reason this section is long. ADR-006 governs `scripts/mutate.mjs` and memoises a BASELINE per test-set; this adds a second reuse tier to the same tool and leaves every ADR-006 rule intact — `UNPROVEN` still excludes an entry from both sides of the ratio, and a reused entry can only ever be `RED`. ADR-010 is the record whose sentence sounds like a refusal — "a claim is re-checked or it is not counted" — but it governs `plugin/bin/adr-verify` and its subject is a claim RECORDED IN A TASK FILE, which is a different artifact with a different failure mode: that claim is prose a human typed and the tree moves underneath it. ADR-003 requires every shipped gate to carry a mutation and is untouched; the catalogue is unchanged and every entry still runs, on a schedule this record narrows rather than on every push.
**Served-path change:** None — this ADR changes only measurement and CI scheduling. A plugin user's agent behaves identically; what changes is how long a maintainer waits before a defect is reported to them.

## Context

Measured 2026-09-02 against `tests/mutations.json` at `00c7d99`, 430 entries.

The campaign is **~80 minutes of serial work**, sharded four ways, so a release waits on the
slowest shard. Nothing in it is waste: ADR-006's baselines are already memoised per test-set, and
each mutant runs only the suite it names. The cost is real.

| where the time goes | mutants | suite runtime | total |
|---|---|---|---|
| `tests/lifecycle.test.mjs` | 116 | 17.2s | 33.3 min |
| `tests/gates.test.mjs` | 96 | 14.1s | 22.6 min |
| `tests/evidence-chain.test.mjs` | 34 | 22.2s | 12.6 min |

Three suites are **86%** of the campaign. They are slow because they execute the real gates as
subprocesses — measured the same day, a whole `adr-lint` run is 0.17–0.24s while its stdlib
imports are ~15ms, its compile 15ms and its module body 8ms, so the cost is the work, not startup.
That subprocess shape is what catches the Windows defects, and this record does not trade it away.

**What a commit actually invalidates.** For each of the last six commits, the mutants naming a file
that commit changed — its subject file, or any test file it names:

    HEAD    (v2.54.0 version bump)         0/430 mutants   0.0 min ( 0.0%)
    HEAD~1  (issue #8 fix)                84/430         20.7 min (25.9%)
    HEAD~2  (CI fetch-depth fix)           2/430          0.1 min ( 0.1%)
    HEAD~3  (mutation catalogue repoint)   0/430          0.0 min ( 0.0%)
    HEAD~4  (issue #7 follow-up)          10/430          0.7 min ( 0.9%)
    HEAD~5  (issue #7 fix)                94/430         21.5 min (26.8%)

**Three of six commits invalidate nothing**, and the release commit above re-runs all 430 mutants —
80 minutes of CPU — to test a one-line change to a JSON version field.

The shards are also sliced by index rather than by cost, so they came out 24.6 / 16.1 / 18.1 / 21.3
minutes: the slowest is 53% longer than the fastest and the campaign waits for it.

## Existing Primitives Audit

- **`baselineOf` / the per-test-set memo in `scripts/mutate.mjs` (ADR-006)** — the precedent, and
  the shape to follow: reuse keyed on the thing the result depends on, computed once. **Reuse**, do
  not reshape; this record adds a second tier beside it rather than touching it.
- **`--shard i/n` in `scripts/mutate.mjs`** — already exists and already slices by index. **Reuse**;
  T1 changes only the `n` the workflow passes.
- **`scripts/release-evidence.mjs`** — reads per-job conclusions for a sha. Related but not reused:
  it judges a finished run, and this record decides what a run does.
- No cache, journal or content-hash primitive exists for campaign verdicts. `mutate.mjs`'s on-disk
  journal (ADR-002) records an in-flight mutation for restore, not a verdict, and must not be
  overloaded — its whole guarantee is that it is written before the edit and cleared after.

## Decision

`mutate.mjs` gains a **verdict cache** keyed on content. A mutant is `(file, from, to, tests)`. Its
cache key is a SHA-256 over: the mutated file's bytes, the bytes of every test file it names, and
the `from`/`to` strings themselves. On a non-release run, a mutant whose key is present with a
`RED` verdict is **reused** rather than re-run.

**Why this is recomputation and not an unchecked claim, which is the whole argument.** ADR-010's
rule — a claim is re-checked or it is not counted — exists because a recorded claim is prose in a
task file while the tree moves underneath it; the claim and its subject are separate things and
drift apart silently. A mutation verdict is not that. It is a pure function of the mutated file,
the tests, and the edit; if all three are byte-identical the re-run is guaranteed to produce the
same answer, and "re-checking" it verifies nothing about the world. **The failure ADR-010 prevents
is a claim outliving its subject, and a content key makes that unrepresentable** — a changed
subject is a different key, and a different key is a miss.

That argument only holds while the key covers everything the verdict depends on, which is why the
key is content and never a timestamp, a run id, or a commit range. It is also why the cache is
local to a checkout: a verdict from another machine would import an assumption about that machine's
interpreter and toolchain that the key does not cover.

**Four rules the tasks enforce, each because its absence is a silent failure:**

1. **A release runs everything.** Skipping is for iteration. A tag must carry a fully measured
   artifact, and so must `main`. The pre-registered criterion: if a full campaign on a release sha
   ever reports a verdict a reused run had called `RED`, this record is wrong and comes out — and
   that is checkable, because releases keep running the full set.
2. **An absent or unreadable cache runs everything.** "I could not look" is not "nothing changed"
   (ADR-005, CLAUDE.md §3). This is the direction that ships quietly, so it is the one with a test.
3. **Only `RED` is reusable.** A `GREEN` mutant is an open finding about a test and must be re-run
   every time until it is fixed; caching it hides live work. `UNPROVEN` likewise — ADR-006 already
   says a verdict against a failing baseline is evidence of nothing, and a stored one is worse.
4. **The report says what it measured and what it reused.** A campaign printing `430/430 noticed`
   while running six is a report claiming more than happened, which is the defect this repository
   exists to demonstrate the absence of. Reused rows are counted separately and name the commit
   they were measured at.

Independently, the CI matrix goes from **4 shards to 8**. The total work is unchanged, so there is
no correctness question; it halves wall-clock.

## Alternatives Considered

- **Do nothing.** Rejected: 80 minutes of CPU per release, and the numbers above show three of six
  commits pay it for zero information. The cost is also paid in attention — a 40-minute wait is
  what made this session push during a release run twice, cancelling it (BACKLOG §104).
- **More shards only, no cache.** Rejected as insufficient, though it is taken as T1: it divides
  the wall-clock but not the work, and the work is what makes a maintainer batch changes instead of
  pushing them.
- **Cache keyed on the commit range since the last green campaign.** Rejected, and this is the one
  worth recording: it is what "incremental CI" usually means, and it is wrong here. A range is
  history, not content — a rebase, a force-push, a cherry-pick or a revert all produce a range that
  misdescribes what the files hold. The content key is strictly stronger and no harder to compute.
- **Cache keyed on the mutated file only, not the tests.** Rejected: a mutant's verdict depends on
  the assertions as much as on the subject, and this session produced two live examples of a test
  change flipping a verdict without the subject moving.
- **A shared remote cache across machines.** Rejected for now: a verdict depends on the interpreter
  and toolchain, which the key does not cover, so importing one from another machine imports an
  unstated assumption. Local-only keeps the key honest.
- **Make the three slow suites faster.** Rejected as a non-goal below — they are slow because they
  spawn real gates, which is the property that catches the Windows defects.

## Component / Boundary Impact

None — internal to the repository's own tooling. `scripts/mutate.mjs` keeps its single
responsibility (run the catalogue, judge each entry); the cache is a memo in front of the judging
step, in the same position as ADR-006's baseline memo. Nothing under `plugin/` changes, so the
plugin/repository boundary ADR-008 draws is untouched.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `mutate.mjs` CLI | `--no-cache` forces a full run; `--cache <path>` overrides the location | `scripts/mutate.mjs` | CI workflow, a maintainer |
| campaign summary | new counts: measured vs reused, reused rows naming their measured-at commit | `scripts/mutate.mjs` | CI log, a maintainer |
| `.github/workflows/selftest.yml` | matrix 4 → 8 shards; full campaign forced on tags and on `main` | workflow | CI |
| cache file | gitignored, per-checkout, JSON keyed by content hash | `scripts/mutate.mjs` | itself only |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `cacheKey()` and the reuse decision | T2 | T3 | No — T3 adds the scheduling rule that decides when T2's reuse is permitted |
| campaign summary counts (measured/reused) | T2 | T3 | No — T3 asserts a forced-full run reports zero reused |

## Implementation

See `tasks/README.md`. Three tasks.

## Consequences

- **Positive:** a typical iteration commit's campaign drops from ~25 minutes wall-clock to under a
  minute, and the 8-shard change halves what remains for a full run. Fewer maintainer pushes during
  a release run, which is what cancelled three of them this session.
- **Negative:** a second reuse mechanism in `mutate.mjs` beside ADR-006's baseline memo, and a
  cache is a thing that can be wrong. The mitigation is that it is unrepresentable-wrong rather than
  trusted: a changed input is a different key.
- **Neutral:** CI minutes consumed are roughly unchanged for releases and lower for iteration; the
  8-shard change trades wall-clock for concurrency, not for total compute.

## Out of Scope

- Making `lifecycle.test.mjs`, `gates.test.mjs` and `evidence-chain.test.mjs` faster (permanent: boundary: they are slow because they execute the real gates as subprocesses rather than importing them, which is the property that catches the Windows defects CLAUDE.md §7 records; wall-clock is not worth that trade)
- Cost-balanced shard slicing instead of by-index (deferred: docs/BACKLOG.md §106)
- A shared or remote verdict cache across machines (permanent: boundary: a verdict depends on the interpreter and toolchain, which the content key does not cover, so importing one from another machine imports an assumption nothing checks)
- Caching `GREEN` or `UNPROVEN` verdicts (permanent: boundary: both are open findings about a test, and reusing one hides work that is live)
- Detecting a vacuous assertion, which no mechanism here addresses (permanent: fact: ADR-006 states that coverage cannot detect it and a differential cannot either, since a vacuous assertion produces no difference; citation: file `docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md:1`)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A cache hit hides a defect a re-run would have caught | Low | High | The key covers every input the verdict depends on; a release always runs the full set, so a wrong reuse surfaces at the next tag rather than never |
| The cache silently reports everything as reused | Low | High | T2 asserts a campaign over an empty cache measures all entries, and that the summary distinguishes measured from reused; a run reporting more noticed than it measured is the failure mode with a test |
| Hashing 430 entries' files costs more than it saves on a full run | Low | Low | Hashes are computed per distinct file, not per mutant; T2's acceptance records the overhead against a measured full run |
| 8 shards exhausts runner concurrency and queues | Med | Low | Total work is unchanged; if shards queue, wall-clock reverts toward today's without any correctness effect |

## Rollback

Delete the cache file and pass `--no-cache`, or revert T2 — the catalogue, the entries and every
ADR-006 rule are unchanged, so a reverted campaign is byte-for-byte the one running today. The
8-shard change reverts by setting the matrix back to 4. No persistent state outside a gitignored
per-checkout file, and no contract a consumer depends on.

## Follow-ups

- [ ] After ten campaigns under this record, count how often a reused verdict was later contradicted by the full run a release forces. If that count is not zero, the key is missing an input and this record comes out — the pre-registered criterion in the Decision.
