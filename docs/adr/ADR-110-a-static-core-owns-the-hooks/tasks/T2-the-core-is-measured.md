# Task ADR-110-T2: The core is measured against the Node path

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (a measurement script, two runs, and the benchmark arm in another repository)
**Owner:** Zy
**Produces:** the numbers in ADR-110's Follow-ups
**Consumes:** `qh hook <event>` passing every golden (T1)
**Data dependency:** ADR-107 T4's benchmark stage in tool-multipathreadwrite, with an arm for the Go hooks beside the Node hooks
**Proof map:** v1

## Goal

Per event, the wall time and the output bytes of both implementations on this repository and on a corpus-less fixture;
per attempt, turns and cost in the benchmark arm; all in the record before T3 is started (ADR-110, Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/hook-cost.mjs` | add | replays this repository's own session log events through both implementations, N times each, under a load it records; prints per-event medians and the byte diff of their outputs |
| `docs/adr/ADR-110-a-static-core-owns-the-hooks.md` | edit | the Follow-ups line with the numbers (an append; the record is history) |

## Ordered Steps

1. [S1] Write the replay script with a fixture test (two implementations that differ in one event's output are reported as a byte diff; two that match are reported as matching) and record the red run.
2. [S2] Run it on this repository and on a fixture with no corpus, under load below the core count, and put the medians into Follow-ups. [proof: human: the medians, the load, the date]
3. [S3] Ask the benchmark's owner for the Go-hooks arm in ADR-107 T4's stage; record where its results are kept and the turns and cost per attempt against the Node arm. [proof: human: the arm's location and its figures, with no figure quoted that CLAUDE.md §6 keeps outside]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`, naming the per-event
medians, the load, the benchmark arm and its reading.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the replay reports a byte diff where the implementations differ and a match where they do not` | `scripts/hook-cost.test.mjs` | both arms on a fixture log | — | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the script |
| 2 — something selects it | the owner runs it |
| 3 — the caller can discover it | CLAUDE.md §2's command list |
| 4 — it is used | the numbers in Follow-ups, and T3's gate on them |

## Mutation Log

## Invariants

- Nothing measured in another repository is committed here.
- A number taken under contention is marked so and is not entered as the answer.

## Risks

- The benchmark arm waits on Stage 5's end; the per-event numbers do not, and T3 waits on both.

## Stop Condition

Stop and ask if the per-event outputs differ on a real session log after T1's goldens pass: that is a missing golden.

## Out of Scope

- Changing either implementation (permanent: boundary: a measurement)

## Verification Log
