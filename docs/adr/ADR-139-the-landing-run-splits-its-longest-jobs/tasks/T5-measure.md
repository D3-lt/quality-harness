# Task ADR-139-T5: The new layout's landing time is measured, and kept or reverted

**Status:** withdrawn — nothing to measure once ADR-139 was rolled back (its Outcome)
**Depends-on:** T3, T4
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** none
**Consumes:** the switched layouts (T2, T3, T4)
**Data dependency:** needs five landing runs after the switch
**Proof map:** v1

## Goal

Record, with run ids, for the first five landing runs after the switch: minutes from the run's creation to its last required
check (the landing) and to its last job (the release), and each shard's minutes; keep the layout when the median landing is below
20 minutes, otherwise revert it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/BACKLOG.md` | edit | §459's measurement after the change, and its disposition |

## Ordered Steps

1. [S1] Confirm the failing check first (TDD red): the same query over the eight baseline runs §459 names gives a median landing
   at or above 20 minutes (28, measured 2026-11-04). [proof: human: the owner reads the table and the run ids]
2. [S2] Run the query over the five runs after the switch; record the table. [proof: human: §459 holds the table]
3. [S3] Keep or revert, and record which. [proof: human: §459 names the decision and its numbers]

## Acceptance

Acceptance is human-observed: the owner signs off on §459's table of five landing runs (run ids, landing and release minutes from
creation, each shard's minutes) and on the keep-or-revert decision those numbers give.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | Measurement, signed off | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | n/a: a measurement |
| 2 — selected | n/a |
| 3 — discoverable | n/a |
| 4 — used | the decision it records |

## Mutation Log

## Invariants

A run with a shard cancelled for capacity is named and not counted.

## Risks

Five runs may span a GitHub capacity incident: the table names it.

## Stop Condition

Stop if the runs cannot be read (`gh` absent or the API failing): UNRUN, not a measurement.

## Out of Scope

- Any change beyond keep or revert (permanent: boundary: a further cut is a new decision)

## Verification Log
