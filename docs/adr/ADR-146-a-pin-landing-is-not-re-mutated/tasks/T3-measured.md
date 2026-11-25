# Task ADR-146-T3: The saving is read from a live pin landing

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the measured runner-minutes of a pin landing
**Consumes:** `the seed job's skip output` (T2), `the skipped campaign` (T2)
**Data dependency:** needs the forge, the landing of T1 and T2, and the pin landing of the next release; not hermetic
**Proof map:** v1

## Goal

The landing that carries T1 and T2, and the first pin landing after it, are read from the forge, and the record's claim is
confirmed or withdrawn on what they show (ADR-146 Decision 5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/BACKLOG.md` | edit | §475 item 3 gains the measured remainder and the run it was read from |

## Ordered Steps

1. [S1] Land T1 and T2 through `node scripts/land.mjs`. Read that run: the seed job printed "run" and wrote `skip=0`, and
   forty-eight shards concluded. [proof: human: the run id, the seed job's line and the shard count]
2. [S2] At the next release's pin landing, read its run with `gh run view --json jobs` and the jobs API: the seed job
   wrote `skip=1`, no shard ran, each required check concluded `success`, and the sum of job durations is under 150
   runner-minutes. [proof: human: the run id, each job's name and conclusion as listed, and the sum]
3. [S3] Run `node scripts/release-evidence.mjs <the pin's sha>` and read that it does not answer SUCCESS. [proof: human: the command's output and exit code]
4. [S4] Add the measured remainder to docs/BACKLOG.md §475 item 3. [proof: human: the section, read]

## Acceptance

Acceptance is human-observed: the owner, or the session that ran the two landings, signs off with
`adr-verify <this file> --human "..."`, naming both run ids, what the seed job wrote in each, the conclusions of the
campaign jobs and the two sums of runner-minutes.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no test: a measurement on the forge | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two runs |
| 2 — something selects it | `land.mjs` pushes `land/<sha>`, which starts the workflow |
| 3 — the caller can discover it | the run's job list |
| 4 — it is used | every later pin landing |

## Mutation Log

## Invariants

- No number is written that a run did not show.

## Risks

- The first pin landing shows the campaign ran: Decision 3's condition is then wrong, and the task says so and stops.

## Stop Condition

Stop and revert T2 before anything else lands if a shard is skipped on the landing of S1, if a required check is skipped
on either landing, or if `release-evidence` answers SUCCESS for the pin's sha. Stop without signing if the pin landing's
sum is 150 runner-minutes or more, or if any figure of S2 could not be read: the task stays pending and says which.

## Out of Scope

- Cutting the required jobs (deferred: docs/BACKLOG.md §475)

## Verification Log
