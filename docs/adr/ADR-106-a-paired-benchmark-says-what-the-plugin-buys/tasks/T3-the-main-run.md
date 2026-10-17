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
