# Task ADR-112-T3: The stage's looks, its verdicts and what they decide

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** L (an external run, four verdict files, one documentation edit, and the record the verdict calls for)
**Owner:** Zy
**Produces:** the verdicts, and the follow-on record Decision 6 names
**Consumes:** `prereg-<pair>-<model>.json` (T2)
**Data dependency:** needs tool-multipathreadwrite's stage rows per model, exported with `bench export-paired`
**Proof map:** v1

## Goal

Score each pair and model against its pre-registration, record the verdicts as ADR-106 Decision 8's exception allows, and
open the record ADR-112 Decision 6 calls for (ADR-112, Decisions 5 to 7).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work/verdict-<pair>-<model>.json` | add | the scorer's verdict file per pair and model, aggregates only |
| `docs/BENCHMARKS.md` | edit | each verdict with its configuration and date |

## Ordered Steps

1. [S1] Confirm the scorer refuses the unrun stage: each pre-registration over a config-line-only export is INCONCLUSIVE with 0 paired. [proof: human: the scorer's output]
2. [S2] Export and score each pair and model; write the verdict files. [proof: human: the printed cells, p and percentiles]
3. [S3] Apply Decision 6: name which branch the verdicts select, or that none does and the owner decides, and draft any record it names as Proposed. [proof: human: the branch and the draft's path]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`, naming each verdict, the
branch of Decision 6 it selects, and the follow-on record.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no new test: T1's tests cover the scorer this task runs | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the verdict files |
| 2 — something selects it | this run |
| 3 — the caller can discover it | `docs/BENCHMARKS.md` |
| 4 — it is used | the follow-on record |

## Mutation Log

## Invariants

- The criterion is the one Decisions 3 to 5 pre-registered; nothing is chosen after the rows exist.

## Risks

- A contended run's timings are not quoted; the verdict stands, since arms are paired per instance.

## Stop Condition

Stop if a pre-registration was committed after the first counted attempt, or the scorer reports INCONCLUSIVE; a re-run is a
new pre-registration.

## Out of Scope

- Carrying out the follow-on record (deferred: the record Decision 6 names)

## Verification Log
