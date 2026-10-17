# Task ADR-107-T4: A later benchmark stage measures the batching cue

**Depends-on:** T1, T3
**Covers:** none — no spec
**Estimated scope:** M (a configuration in another repository's benchmark, and its reading)
**Owner:** Zy
**Produces:** the measured effect on turns per attempt of the plugin with `mrw` and of a one-line batching cue
**Consumes:** the section `## Read and edit in batches` (T1), the `mrw`-present line (T3)
**Data dependency:** a later stage of tool-multipathreadwrite's benchmark (after ADR-162's Stage 5), with arms for the plugin, the plugin with `mrw`, and the plugin with a one-line batching cue in its hook text
**Proof map:** v1

## Goal

Measure whether the plugin with `mrw`, and a one-line batching cue in every session's hook text, lower turns per attempt
against the plugin alone, without lowering resolve (ADR-107, Decision 4).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-107-the-plugin-works-the-mrw-way/tasks/T4-a-stage-measures-the-cue.md` | read | the sign-off is recorded here; the figures stay outside this repository |

## Ordered Steps

1. [S1] Agree the stage's arms and its target with the benchmark's owner: turns per attempt, resolve as a guard.
   [proof: human: the agreed arms and target]
2. [S2] Record where the stage's results are kept outside this repository, and its verdict word.
   [proof: human: the location and the verdict]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`, naming the stage, its arms,
where its results are kept, and whether the cue lowered turns per attempt. No figure is quoted (CLAUDE.md §6).

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no test here: the measurement is the benchmark's, in another repository | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the stage's results |
| 2 — something selects it | the owner's decision on a cue for every adopter |
| 3 — the caller can discover it | this task's sign-off |
| 4 — it is used | a new record for the cue, if it earned one |

## Mutation Log

## Invariants

- Nothing measured in another repository is committed here.

## Risks

- The stage is not run; the cue then stays unshipped, which is this record's default.

## Stop Condition

Stop and ask the owner if the benchmark's owner cannot add the arms.

## Out of Scope

- Shipping the cue for every adopter (deferred: a new record after this measurement)

## Verification Log
