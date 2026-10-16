# Task ADR-106-T3: The main run and its verdict

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** L (an external run and, if allowed, one documentation edit)
**Owner:** Zy
**Produces:** the verdict, recorded as ADR-106 Decision 8 allows
**Consumes:** `prereg-main.json` (T2); the paired-rows format, the pre-registration's fields and the verdict words (T1)
**Data dependency:** needs the same as T2, on `⌈n / 0.9⌉` instances disjoint from the pilot's, at the pilot's `k`
**Proof map:** v1

## Goal

Run the pre-registered configuration, score it against `prereg-main.json`, and record its verdict as ADR-106 Decisions 8 and 9
allow.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/BENCHMARKS.md` | edit | the verdict word, both arms' cells, the configuration and the date, whatever the verdict is, only if Decision 8's exception is granted |

## Ordered Steps

1. [S1] Confirm the scorer refuses an unrun main run: with `prereg-main.json` committed and no rows yet, it prints
   INCONCLUSIVE with 0 of the pre-registered instances paired. [proof: human: the scorer's output]
2. [S2] Confirm `prereg-main.json`'s commit is older than the first row, and that `--disjoint-from` the pilot's list reports
   no overlap. [proof: human: the commit sha, the run's start time and the scorer's disjointness line]
3. [S3] Record the canary for both arms, as T2 S3 does. [proof: human: the canary output for each arm]
4. [S4] Run, adapt and score with `--prereg`, `--instances` and `--disjoint-from`.
   [proof: human: the scorer's printed cells and verdict]
5. [S5] Record the verdict as Decision 9 says: NOT SHOWN and GUARD NOT MET as plainly as SHOWN, INCONCLUSIVE as
   could-not-measure. [proof: human: the diff of what was recorded]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`. The line records the
`prereg-main.json` commit, the disjointness check and the canary's result. Where Decision 8's exception is granted it also
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
- The instances are disjoint from the pilot's.

## Risks

- A contended run's timings are not quoted; its verdict still stands, because the arms are paired per instance.

## Stop Condition

Stop if `prereg-main.json` is not committed before the run starts, or if the scorer reports INCONCLUSIVE: the cause is
reported before any re-run, and a re-run is a new pre-registration.

## Out of Scope

- A second dataset or a hooks-only arm (deferred: docs/BACKLOG.md §382).

## Verification Log
