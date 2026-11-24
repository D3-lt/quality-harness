# Task ADR-145-T3: The gain is measured on this design before it ships

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** none
**Consumes:** `batchedAnswers` (T2)
**Data dependency:** needs this repository's own decision corpus at the measured commit, and a machine whose load stays at or below its core count for the whole measurement
**Proof map:** v1

## Goal

Show, on this repository, that `work-next` with T2 takes at most 0.70 of the time it takes without it and prints the same
bytes, or revert T2 (ADR-145 Decision 7).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-145-adr-next-answers-a-batch/tasks/T3-measured-gain.md` | edit | The tool-written sign-off; this task changes no code |

## Ordered Steps

1. [S1] There is no failing test to confirm red: this task changes no code, and its proof is a measurement. Load the
   `costly-runs` skill; wait for load at or below the core count. Add a clean worktree of T2's parent commit in a fresh
   scratch directory. It is the one corpus both builds read: every run below has it as its working directory, so the two
   builds see the same task files and print the same paths.
   [proof: human: the sign-off names both commits, says both trees were clean, and gives the load before and after]
2. [S2] Once, untimed, run T2's `plugin/scripts/work-next.mjs --json` there under `tests/helpers/count-spawns.mjs` and
   confirm it started `--batch` and no single call; a measurement of a batch that fell back measures nothing.
   [proof: human: the sign-off gives the spawn counts]
3. [S3] Run each build's `work-next.mjs --json` there once unmeasured, then five times each, alternating builds so a drift
   in load falls on both; keep each wall time, exit code and stdout.
   [proof: human: the sign-off lists all ten times and exits]
4. [S4] Require exit 0 and byte-equal stdout across all ten kept runs, and take the two medians and their ratio.
   [proof: human: the sign-off states the comparison's result, both medians and the ratio]
5. [S5] Ratio at most 0.70 and equal stdout: sign off. Otherwise revert T2's commit, say so in the sign-off with the
   numbers, and return ADR-145 to the owner as not meeting Decision 7. Remove the worktree either way.
   [proof: human: the sign-off states which branch was taken]

## Acceptance

Acceptance is human-observed: record with `adr-verify <this file> --human "<text>"` a sign-off naming the date, both commits, the platform, the count of task directories, the load before and after, the ten wall times, both medians, their ratio, and whether the two stdouts were equal; it is `approved` only when the ratio is at most 0.70 and they were equal.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | No test: a wall-clock ratio asserted in the suite would be a timing test on a shared runner; the mechanism (one process, not one per directory) is T2's `one adr-next process answers every task directory` | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | n/a: no code |
| 2 — something selects it | n/a: no code |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | this task is the observation of use: `work-next` run over this repository's corpus with and without T2 |

## Mutation Log

## Invariants

- Nothing is measured while a gate, a campaign or a peer's probe runs beside it (CLAUDE.md §18).
- The figure of the refused importer (13.0 s to 6.3 s, 2026-11-24, 4427b1af) is not this task's evidence.

## Risks

- One machine and one corpus: the ratio says nothing about a corpus of a few directories, where there is little to save, or
  about Windows, where a process start costs more and the gain is expected larger but is not measured here.
- none: no doubles

## Stop Condition

Stop if the machine cannot be held uncontended for the ten runs: a contended timing is unattributable, a passing one
included. The criterion can fail on this data: with the batch answering nothing, the ratio is above 1.

## Out of Scope

- The outside run before a release (ADR-145 Follow-ups).

## Verification Log
