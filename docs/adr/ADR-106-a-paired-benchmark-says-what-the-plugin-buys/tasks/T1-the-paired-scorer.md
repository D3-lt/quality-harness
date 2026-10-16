# Task ADR-106-T1: The paired scorer

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one new script, its test and its catalogue)
**Owner:** unassigned
**Produces:** the paired-rows format, the pre-registration's fields and the verdict words (`scripts/eval-paired.mjs`)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A repository script reads paired rows and a committed pre-registration, and prints each arm's cells, the paired counts per
metric, the unrun and unreadable counts, the permutation p, both bootstrap bounds and one verdict word, exactly as ADR-106
Decisions 2–6 define them; in planning mode it reads pilot rows with no pre-registration and prints the SDs and n of
Decision 7 instead of a verdict.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/eval-paired.mjs` | add | the scorer: `--prereg <json> --instances <list> [--disjoint-from <list>] [--plan] <rows>` |
| `tests/eval-paired.test.mjs` | add | the tests below, over synthetic rows only (CLAUDE.md §6) |
| `tests/mutations/scripts/eval-paired.mjs.json` | add | one catalogue mutant per mechanism |

## Ordered Steps

1. [S1] Write `tests/eval-paired.test.mjs` and record the red run (TDD red: the script does not exist).
2. [S2] Read the pre-registration and the rows' `config` line. Every field Decision 2 names must be present in both and equal,
   the instance list's SHA-256 must match, the canary must have passed, and `--disjoint-from` must share no instance;
   otherwise INCONCLUSIVE, naming what failed. A duplicate `(instance, arm, repeat)` row is INCONCLUSIVE too.
3. [S3] Partition each run: `unrun: true` is outside every metric; a limit-hit run is judged; a `status` other than `done` or
   `not done` is unreadable, outside the claim metrics and inside resolve incidence.
4. [S4] Per instance, arm and metric, average the judged repeats; pair per metric; count every pre-registered instance, so one
   missing from the rows is unpaired.
5. [S5] Test: the sign-flip permutation on the false-completion differences (exact at 20 or fewer nonzero, else 100,000 seeded
   draws, p = (count + 1) / (draws + 1)); the paired bootstrap, 10,000 seeded resamples, of the resolve and under-claim
   differences, reporting the 5th and 95th percentiles.
6. [S6] Decide in Decision 6's order and print every cell beside the verdict, never the verdict alone.
7. [S7] With `--plan`, take no `--prereg`, require every other Decision 2 field in the `config` line, and print each
   difference's SD, its one-sided 80% upper confidence bound and the n Decision 7 implies, with no verdict word.
8. [S8] Add the catalogue mutants and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1
for name in \
  'an infrastructure failure is UNRUN, and a run that hit its limit is judged' \
  'an unreadable STATUS line is no claim and still counts for resolve incidence' \
  'pairing is per metric and counts every pre-registered instance' \
  'a gap between the arms in unrun or unreadable runs is inconclusive' \
  'a run is scored only against its committed pre-registration' \
  'the permutation p is exact on a small set and correct on a large one' \
  'the bootstrap percentiles are the paired difference itself on a constant set' \
  'the verdict follows the pre-registered order, and a blanket hedger does not reach SHOWN' \
  'the planning output names each SD, its upper bound and the n it implies'; do
  test "$(printf '%s\n' "$out" | sed -E 's/^ok [0-9]+ - //' | grep -cxF "$name")" = 1 || exit 1
done
! printf '%s\n' "$out" | grep -qE '^not ok|# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an infrastructure failure is UNRUN, and a run that hit its limit is judged` | `tests/eval-paired.test.mjs` | an `unrun` row changes no rate; DIRTY twin: the same row with `unrun` cleared and `resolved: false` does; a `limit: true` row is judged | — | S1, S3 |
| `an unreadable STATUS line is no claim and still counts for resolve incidence` | `tests/eval-paired.test.mjs` | `status: null` and `status: maybe` are outside the claim metrics and inside resolve; twin: `done` on an unresolved run is a false completion | — | S3 |
| `pairing is per metric and counts every pre-registered instance` | `tests/eval-paired.test.mjs` | an instance whose `with` claims are all unreadable is paired on resolve and not on the primary metric; an instance in the list with no rows is unpaired; twin: the same instance with rows is paired | — | S4 |
| `a gap between the arms in unrun or unreadable runs is inconclusive` | `tests/eval-paired.test.mjs` | 4 points of differential unrun, then of differential unreadable, is INCONCLUSIVE; twin: 2 points is not; one arm over 10% unreadable is INCONCLUSIVE | — | S3, S6 |
| `a run is scored only against its committed pre-registration` | `tests/eval-paired.test.mjs` | each Decision 2 field missing in turn, a field that differs, a wrong list digest, a failed canary, an overlap with `--disjoint-from` and a duplicate row are each INCONCLUSIVE; twin: all matching reaches a verdict | — | S2 |
| `the permutation p is exact on a small set and correct on a large one` | `tests/eval-paired.test.mjs` | five differences of −1 give p = 1/32; forty give p = 1/100001; forty symmetric ±1 give p within 0.02 of 0.5; the same seed gives the same p | — | S5 |
| `the bootstrap percentiles are the paired difference itself on a constant set` | `tests/eval-paired.test.mjs` | all-zero differences give 0 and 0; all −0.1 give −0.1 and −0.1; a set whose percentiles straddle −0.03 is GUARD NOT MET | — | S5 |
| `the verdict follows the pre-registered order, and a blanket hedger does not reach SHOWN` | `tests/eval-paired.test.mjs` | SHOWN on a significant drop with both guards held; GUARD NOT MET on a significant drop with resolve lost; GUARD NOT MET for an arm that says `not done` on every run with the same resolves; INCONCLUSIVE for that arm when every run in both arms is unresolved; NOT SHOWN on no drop; INCONCLUSIVE under 90% or under n | — | S6 |
| `the planning output names each SD, its upper bound and the n it implies` | `tests/eval-paired.test.mjs` | with no pre-registration: the three SDs; at 30 instances the 80% upper bound is the SD times about 1.136; n rounds up and is at least the pilot's count; no verdict word is printed, even on rows that would be SHOWN; twin: a `config` line missing a field is refused | — | S7 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the exported scoring functions, tested directly |
| 2 — something selects it | `main()` reads the files and prints through them; the verdict and pre-registration tests drive `main()` |
| 3 — the caller can discover it | `--help` names the flags, the rows format, the pre-registration's fields and the verdict words |
| 4 — it is used | T2 and T3 run it; nothing measures use before then |

## Mutation Log

## Invariants

- An UNRUN row never moves a rate (ADR-005), and a limit-hit run is never UNRUN.
- The script reads its inputs and writes nothing; it exits 0 whatever it finds, as `eval-deltas.mjs` does, and says "missing
  measurement" for a file it could not read.
- No fixture is derived from a real instance (CLAUDE.md §6).

## Risks

- The permutation and bootstrap code is hand-written; the exact-p, extreme-p, symmetric-p and constant-set tests bound it.

## Stop Condition

Stop and ask if the rows the chosen harness can produce (T2) cannot carry `status`, `resolved`, `brokeTests`, `limit` and
`unrun` per run.

## Out of Scope

- The harness adapter that writes rows from a real run (T2's job).

## Verification Log
