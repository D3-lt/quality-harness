# Task ADR-147-T3: The skip and the next release are read from the forge

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the measured runner-minutes of a skipped landing
**Consumes:** `the released-version answer` (T1), `the tag made at the cleared sha` (T2)
**Data dependency:** needs the forge, the landing of T1, and the next release; not hermetic
**Proof map:** v1

## Goal

The landing that carries T1, which is of a released version and so the first to skip, and the next release are read from
the forge, and the record's claims are confirmed or withdrawn on what they show (ADR-147 Decisions 5 and 6).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/BACKLOG.md` | edit | §475 item 4 is closed with the measured figure and the run it was read from |

## Ordered Steps

1. [S1] Land T1 through `node scripts/land.mjs`. Read that run and its attempt with `gh run view --json jobs` and the
   jobs API, and the seed job's log with `gh run view --job <id> --log`: the seed job printed "skip" with the version
   it named and wrote `skip=1`, no shard ran, each required check concluded `success`, main fast-forwarded, and the
   sum of job durations is under 150 runner-minutes.
   [proof: human: the run id and attempt, the seed job's log line, each job's name and conclusion as listed, and the sum]
2. [S2] Run `node scripts/release-evidence.mjs <that sha>` once the run has completed and read that it answers FAILED,
   naming the shards as skipped or as missing, or the job `mutation cache` as skipped while the job list of S1 shows no
   shard for that attempt. [proof: human: the command's output and exit code]
3. [S3] At the next release, read its candidate's landing: the seed job printed "run", forty-eight shards concluded,
   `release-evidence` answered SUCCESS for that sha, the command pushed the tag and created the release, and
   `git ls-remote origin refs/tags/<tag>` names that sha.
   [proof: human: the run id, the seed job's log line, the shard count, the evidence line and the tag's line]
4. [S4] Close docs/BACKLOG.md §475 item 4 with the figure of S1. [proof: human: the section, read]

## Acceptance

Acceptance is human-observed: the owner, or the session that ran the landings, signs off with
`adr-verify <this file> --human "..."`, naming both run ids and attempts, what the seed job printed in each, the
conclusions of the campaign jobs, the sum of runner-minutes of the skipped landing, what `release-evidence` answered
for each sha, and the sha the release's tag names.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no test: a measurement on the forge | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two runs and the release |
| 2 — something selects it | `land.mjs` pushes `land/<sha>`, which starts the workflow; `release.mjs` publishes |
| 3 — the caller can discover it | the run's job list and the release's tag |
| 4 — it is used | every later landing of a released version, and every later release |

## Mutation Log

## Invariants

- No number is written that a run did not show.

## Risks

- The first landing shows the campaign ran: the forge did not honour the condition, and the task says so and stops.

## Stop Condition

Stop and revert T1 before anything else lands if a required check is skipped on the landing of S1, or if
`release-evidence` answers SUCCESS for its sha. Stop without signing if a shard ran on it, if its sum is 150
runner-minutes or more, if the release of S3 was refused for a skipped shard or stopped at its tag push, or if any
figure could not be read: the task stays pending and says which.

## Out of Scope

- Cutting the required jobs (deferred: docs/BACKLOG.md §475)

## Verification Log
