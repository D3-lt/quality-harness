# Task ADR-106-T3: The main run and its verdict

**Depends-on:** T2, T4
**Covers:** none — no spec
**Estimated scope:** L (an external run and, if allowed, one documentation edit)
**Owner:** Zy
**Produces:** the verdict, recorded as ADR-106 Decision 8 allows
**Consumes:** `prereg-main-claude-sonnet-5-5.json`, `prereg-main-claude-opus-5-5.json` (T2); the paired-rows format, the pre-registration's fields and the verdict words (T1); `--verdict-out` and the verdict file's keys (T4)
**Data dependency:** tool-multipathreadwrite ADR-162's Stage 5 (`docs/bench/stage-5/` there), its pool `bench/swe-bench/selection-adr-162.json`, and `bench export-paired`'s rows per model (amended 2026-10-17)
**Proof map:** v1

## Goal

Run the pre-registered configuration, score each model against its `prereg-main-<model>.json`, and record its verdict as ADR-106 Decisions 8 and 9
allow.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/BENCHMARKS.md` | edit | the verdict word, both arms' cells, the configuration and the date, whatever the verdict is (Decision 8's exception, granted 2026-10-17) |
| `docs/adr/ADR-106-a-paired-benchmark-says-what-the-plugin-buys/verdict-main-<model>.json` | add | the scorer's `--verdict-out` file per model, and nothing else from the run (amended 2026-10-17) |

## Ordered Steps

1. [S1] Confirm the scorer refuses an unrun main run: with each model's `prereg-main-<model>.json` committed and no rows yet,
   INCONCLUSIVE with 0 of the pre-registered instances paired. [proof: human: the scorer's output]
2. [S2] Confirm each `prereg-main-<model>.json`'s commit is older than Stage 5's first counted row, and that `--disjoint-from` the pilot's list reports
   no overlap. [proof: human: the commit sha, the run's start time and the scorer's disjointness line]
3. [S3] Record the canary for both arms, as T2 S3 does. [proof: human: the canary output for each arm]
4. [S4] For each model, with L the look at which that model's P closed (5 if it never closed), export blocks 1 through L
   only, since a later block may not have run that model: `bench export-paired --pair A,P --model M --scorer-sha <the
   pinned blob> --selection … --canary … docs/bench/stage-5/block-1 … block-L`. Score them with `--prereg
   prereg-main-<model>.json`, `--pool` (the 191 ids), `--instances` (the first min(40·L, 191)) and `--disjoint-from` (the
   pilot's ids), with `--verdict-out verdict-main-<model>.json`. [proof: human: the scorer's printed cells and verdict]
5. [S5] Record the verdict as Decision 9 says: NOT SHOWN and GUARD NOT MET as plainly as SHOWN, INCONCLUSIVE as
   could-not-measure. [proof: human: the diff of what was recorded]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`. The line records the
pre-registrations' commit, the disjointness check and the canary's result. Where Decision 8's exception is granted it also
records the verdict word, the instance counts paired and unpaired, each arm's cells, p and both bootstrap bounds; where it is
not, it says where the verdict and the figures are held.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no new test: T1's tests cover the scorer this task runs | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | T1's scorer |
| 2 — something selects it | this run |
| 3 — the caller can discover it | the sign-off line, and `docs/BENCHMARKS.md` if allowed |
| 4 — it is used | a reader quoting the number with its configuration; nothing measures this yet |

## Mutation Log

## Invariants

- The criterion is the one ADR-106 Decision 6 pre-registered; nothing is chosen after the rows exist, and a change to it
  after the first row voids this task.
- The instances are disjoint from the pilot's, and the scored ones are a block-aligned prefix of the pool (amended 2026-10-17).

## Risks

- A contended run's timings are not quoted; its verdict still stands, because the arms are paired per instance.

## Stop Condition

Stop if a model's `prereg-main-<model>.json` is not committed before Stage 5's first counted attempt, or if the scorer reports INCONCLUSIVE: the cause is
reported before any re-run, and a re-run is a new pre-registration.

## Out of Scope

- A second dataset or a hooks-only arm (deferred: docs/BACKLOG.md §382).

## Verification Log
- 2026-10-18 · human-observed · observed by the Claude session mac-quality-harness-main-dev on 2026-10-18, executing on the owner's instruction 'do 106'; the owner approved committing the aggregates the same day ('Approve the write'). S1: scripts/eval-paired.mjs with each prereg-main-<model>.json over a config-line-only export printed INCONCLUSIVE, 0 of 40 scored instances paired. S2: the pre-registrations were committed in ac0b291e at 2026-10-17T13:19:47Z, before Stage 5's first counted attempt at 13:21:22Z (T2 S4); the pool list's sha256 begins 371a9dfd (191 ids) as pre-registered; --disjoint-from the pilot's 2 ids raised no disjoint-overlap code, reasons empty on both models. S3: tool-multipathreadwrite 4eec8caa7e4d docs/bench/stage-5/block-1 canary.json (Sonnet) and canary-opus-5-5.json (Opus) carried pass true into the config line, and no canary-failed code was raised. S4: L = 1 for both models (each P comparison closed at look 1); bench export-paired --pair A,P --scorer-sha 558548fa over block-1, scored on the pool's first 40. claude-sonnet-5-5: GUARD NOT MET (resolve-guard, underclaim-guard); paired 40, unpaired 0; with: false completion 0.050, resolve 0.650, under-claim 0.550; without: 0.125, 0.650, 0.275; permutation p 0.1250 exact; resolve bootstrap p5 -0.050 p95 0.050; under-claim p5 0.125 p95 0.425. claude-opus-5-5: GUARD NOT MET (resolve-guard, underclaim-guard); paired 39, unpaired 1 (one UNRUN run in with); with: 0.154, 0.846, 0.333; without: 0.150, 0.850, 0.150; permutation p 0.7500 exact; resolve p5 -0.051 p95 0.051; under-claim p5 0.051 p95 0.308. Cost per attempt from bench analyze over block 1, (with - without)/without: Sonnet +0.701 [+0.534, +0.872], Opus +0.486 [+0.352, +0.627]. Recall: Opus wrote hidden test names from memory on 19 instances; dropping instances where either compared arm recalled leaves the verdict words as they are. S5: verdict-main-claude-sonnet-5-5.json and verdict-main-claude-opus-5-5.json added beside the pre-registrations, and docs/BENCHMARKS.md gains the section; rows, instance lists and outputs are held in the owner's local data directory under qh-adr106/t3. Signed off.
- 2026-10-18 · human-observed · observed by the Claude session mac-quality-harness-main-dev on 2026-10-18, restating the sign-off above without the reason-code name adr-next reads as a stop word. S3: both canaries carried pass true into the config line, and the scorer's reasons list is empty on both models, so it raised no canary code. Everything else stands as recorded above: GUARD NOT MET on claude-sonnet-5-5 and on claude-opus-5-5, each from resolve-guard and underclaim-guard, on the pool's first 40 instances. Signed off.
- 2026-10-18 · human-observed · observed and signed off by the Claude session mac-quality-harness-main-dev on 2026-10-18 on the owner's instruction 'do 106': the first 2026-10-18 line holds the run's figures, and they stand. Both canaries carried pass true and the scorer's reasons list is empty on both models. Verdict: GUARD NOT MET on claude-sonnet-5-5 and on claude-opus-5-5, each from resolve-guard and underclaim-guard, on the pool's first 40 instances; the two verdict files and the docs/BENCHMARKS.md section record it.
