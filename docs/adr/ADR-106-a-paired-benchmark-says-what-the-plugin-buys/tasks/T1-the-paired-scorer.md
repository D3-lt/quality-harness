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

Amended 2026-10-17 (ADR-106, "Amendment, 2026-10-17"). The rows come from tool-multipathreadwrite's `bench export-paired`,
not from an adapter here. The pre-registration also carries `alpha`, `arms` and `block_size`, which are never compared with
the config line. `--pool <list>` names the frozen pool. `--instances` must be a prefix of it, of length
min(`block_size`·L, pool length), and every denominator counts the `--instances` list. "Fewer than n paired" applies only
when the pre-registration carries an `n`. `--plan` still prints the SDs and the n of the original Decision 7, but nothing
plans from them: the pilot it reads checks the plumbing.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/eval-paired.mjs` | add | the scorer: `--prereg <json> --pool <list> --instances <list> [--disjoint-from <list>] [--plan] <rows>` |
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
| `the permutation p is exact on a small set and correct on a large one` | `tests/eval-paired.test.mjs` | five differences of −1 give p = 1/32; forty give p = 1/100001; forty symmetric ±1 give p within 0.01 of the exact 0.5627, above one half because a zero sum ties the observed one; distinct magnitudes sit near one half; the same seed gives the same p | — | S5 |
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
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · unrun excluded: an UNRUN row is judged as a run, so it moves resolve and the claim metrics · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · limit judged: a run that hit its limit is dropped as UNRUN instead of judged · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · unreadable partition: a resolved run with an unreadable claim no longer counts for resolve incidence · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · per-metric pairing: an instance one arm cannot judge on a metric is paired on it anyway · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · prereg field check: a Decision 2 field that differs from the pre-registration is accepted · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · permutation exactness: a small set takes seeded draws instead of the exact enumeration · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · bootstrap percentile: the resolve guard reads the bootstrap median instead of the 5th percentile · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · verdict order: SHOWN wins over a breached guard · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · prefix rule: a scored list that is a prefix but ends off a block boundary short of the pool is accepted · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1
- 2026-10-17 · a1e356ca* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · prereg field check: a Decision 2 field that differs from the pre-registration is accepted · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1

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

- The harness adapter that writes rows from a real run (permanent: boundary: tool-multipathreadwrite's `bench export-paired` writes them, amended 2026-10-17)

## Verification Log
- 2026-10-17 · a1e356ca* · exit 1 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:196 · test-lock-sha256:84867310e6eead9340299f1aa23c02d008836b0aec7a690e75a936a7d4431e31 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYSBnYXAgYmV0d2VlbiB0aGUgYXJtcyBpbiB1bnJ1biBvciB1bnJlYWRhYmxlIHJ1bnMgaXMgaW5jb25jbHVzaXZlCTVmMDI5N2Q1MWE4NDE2YzI0MmYzNmViMzU4NmI5Y2JkNDRkMjk2ZGI4ODBkNmJkNTUyMzg4MjUxZjIwNmM1ZDEKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwlhIHJ1biBpcyBzY29yZWQgb25seSBhZ2FpbnN0IGl0cyBjb21taXR0ZWQgcHJlLXJlZ2lzdHJhdGlvbgljYmFhMmRjOTQ4YjA3NzE0MTM3NDZmNTk5ZTI2YTkwZmRkYTA2NDU3ZmI2YmFiMGFiNDM1OWU1N2Q0MTZkYmY2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYW4gaW5mcmFzdHJ1Y3R1cmUgZmFpbHVyZSBpcyBVTlJVTiwgYW5kIGEgcnVuIHRoYXQgaGl0IGl0cyBsaW1pdCBpcyBqdWRnZWQJMWYyNmY0OTYzYmI5YWEwYzFjOGI5M2YwY2IzYTJiMzMxYmU1MzMxMzNiNDRhYWE1MTgyYWRkNWMxNGI3OWViNApib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCWFuIHVucmVhZGFibGUgU1RBVFVTIGxpbmUgaXMgbm8gY2xhaW0gYW5kIHN0aWxsIGNvdW50cyBmb3IgcmVzb2x2ZSBpbmNpZGVuY2UJYmJiNmQ5MDRiNDM3NTdhYjUwNjlkYWEyM2U4ZTA0MjlhMTlhYmQzYjNjMmU2MGZkZDNjZWY3ZGIzZDdiNGEyNgpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXBhaXJpbmcgaXMgcGVyIG1ldHJpYyBhbmQgY291bnRzIGV2ZXJ5IHByZS1yZWdpc3RlcmVkIGluc3RhbmNlCWNlNjdlYTc3N2ZjOGFiMzMzMjVhMmI0OGM1YTkzMmRlNWI5OThiN2JkYTRmNmZmYzAwZjNhNTI1NTY2NTIzNzUKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgYm9vdHN0cmFwIHBlcmNlbnRpbGVzIGFyZSB0aGUgcGFpcmVkIGRpZmZlcmVuY2UgaXRzZWxmIG9uIGEgY29uc3RhbnQgc2V0CTYxYzg1ZmQwNmQyOTMwY2U3YTNhNmQ1Mzk3YjEzYjBkOTcyZDI3NzU1NzRmMTI1MTZlMDM1OWU2NWFlMjlmYjQKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgcGVybXV0YXRpb24gcCBpcyBleGFjdCBvbiBhIHNtYWxsIHNldCBhbmQgY29ycmVjdCBvbiBhIGxhcmdlIG9uZQkxZDExY2ZjN2QxNmU0NTQ2Njk0MTQ1MjI0MjQ4MmQ3MmNkMTFlMWM1YjU5ZTQ4OTBiMWJkNGNmZWU4NzNlZWY2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJdGhlIHBsYW5uaW5nIG91dHB1dCBuYW1lcyBlYWNoIFNELCBpdHMgdXBwZXIgYm91bmQgYW5kIHRoZSBuIGl0IGltcGxpZXMJYjRlYWQ2ZjY2NzBkN2MwMGUyYzcxZjNhYTA0ZjBmN2RkYjdkN2I1NTRmYjczM2VhYTlkODczOTRhNjBkZTA5Nwpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXRoZSB2ZXJkaWN0IGZvbGxvd3MgdGhlIHByZS1yZWdpc3RlcmVkIG9yZGVyLCBhbmQgYSBibGFua2V0IGhlZGdlciBkb2VzIG5vdCByZWFjaCBTSE9XTgk4NjE0MjY1YjM0ZTBmNjhlMWExMmJiOGQwNWQ1ODhhZWRkOWM0MDMwMWQ1ZjU2MmUwODRjNTFkZTk3ZjJlZjc4
  ```
  ```
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:963
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1006
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1003
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1013
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1000
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1001
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1011
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1010
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1009
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1597
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1653
- 2026-10-17 · a1e356ca* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:1652
- 2026-10-17 · human-observed · Test change reviewed and approved by the coordinator, 2026-10-17: 'a run is scored only against its committed pre-registration' gained the amendment's cases (pool prefixes 40, 160 and 191 pass, 30 and 170 are INCONCLUSIVE; a pool-less matching list; no n with 39 of 40 paired passes, 35 of 40 is INCONCLUSIVE; block_size default and zero). No assertion was weakened.
- 2026-10-17 · a1e356ca* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:5d379e959c0d88d7a0d427388f19e8cd904aeaf27fe91c3d0ccc52d89971a0b1 · ms:0 · test-lock-sha256:cc3b0d3c073d6887a83d7ef7869424757e926513730e0252f73c34ed21d35ff2 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYSBnYXAgYmV0d2VlbiB0aGUgYXJtcyBpbiB1bnJ1biBvciB1bnJlYWRhYmxlIHJ1bnMgaXMgaW5jb25jbHVzaXZlCTVmMDI5N2Q1MWE4NDE2YzI0MmYzNmViMzU4NmI5Y2JkNDRkMjk2ZGI4ODBkNmJkNTUyMzg4MjUxZjIwNmM1ZDEKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwlhIHJ1biBpcyBzY29yZWQgb25seSBhZ2FpbnN0IGl0cyBjb21taXR0ZWQgcHJlLXJlZ2lzdHJhdGlvbgkxOTdkZDgzNDc2MGU0Njc1MWQ0YzdjNmZkNDc1MTc3OTE4ZTIyN2Y2M2I1ZWRkODAxYmNlOTQwZDI4N2YwODY0CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYW4gaW5mcmFzdHJ1Y3R1cmUgZmFpbHVyZSBpcyBVTlJVTiwgYW5kIGEgcnVuIHRoYXQgaGl0IGl0cyBsaW1pdCBpcyBqdWRnZWQJMWYyNmY0OTYzYmI5YWEwYzFjOGI5M2YwY2IzYTJiMzMxYmU1MzMxMzNiNDRhYWE1MTgyYWRkNWMxNGI3OWViNApib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCWFuIHVucmVhZGFibGUgU1RBVFVTIGxpbmUgaXMgbm8gY2xhaW0gYW5kIHN0aWxsIGNvdW50cyBmb3IgcmVzb2x2ZSBpbmNpZGVuY2UJYmJiNmQ5MDRiNDM3NTdhYjUwNjlkYWEyM2U4ZTA0MjlhMTlhYmQzYjNjMmU2MGZkZDNjZWY3ZGIzZDdiNGEyNgpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXBhaXJpbmcgaXMgcGVyIG1ldHJpYyBhbmQgY291bnRzIGV2ZXJ5IHByZS1yZWdpc3RlcmVkIGluc3RhbmNlCWNlNjdlYTc3N2ZjOGFiMzMzMjVhMmI0OGM1YTkzMmRlNWI5OThiN2JkYTRmNmZmYzAwZjNhNTI1NTY2NTIzNzUKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgYm9vdHN0cmFwIHBlcmNlbnRpbGVzIGFyZSB0aGUgcGFpcmVkIGRpZmZlcmVuY2UgaXRzZWxmIG9uIGEgY29uc3RhbnQgc2V0CTYxYzg1ZmQwNmQyOTMwY2U3YTNhNmQ1Mzk3YjEzYjBkOTcyZDI3NzU1NzRmMTI1MTZlMDM1OWU2NWFlMjlmYjQKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgcGVybXV0YXRpb24gcCBpcyBleGFjdCBvbiBhIHNtYWxsIHNldCBhbmQgY29ycmVjdCBvbiBhIGxhcmdlIG9uZQkxZDExY2ZjN2QxNmU0NTQ2Njk0MTQ1MjI0MjQ4MmQ3MmNkMTFlMWM1YjU5ZTQ4OTBiMWJkNGNmZWU4NzNlZWY2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJdGhlIHBsYW5uaW5nIG91dHB1dCBuYW1lcyBlYWNoIFNELCBpdHMgdXBwZXIgYm91bmQgYW5kIHRoZSBuIGl0IGltcGxpZXMJYjRlYWQ2ZjY2NzBkN2MwMGUyYzcxZjNhYTA0ZjBmN2RkYjdkN2I1NTRmYjczM2VhYTlkODczOTRhNjBkZTA5Nwpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXRoZSB2ZXJkaWN0IGZvbGxvd3MgdGhlIHByZS1yZWdpc3RlcmVkIG9yZGVyLCBhbmQgYSBibGFua2V0IGhlZGdlciBkb2VzIG5vdCByZWFjaCBTSE9XTgk4NjE0MjY1YjM0ZTBmNjhlMWExMmJiOGQwNWQ1ODhhZWRkOWM0MDMwMWQ1ZjU2MmUwODRjNTFkZTk3ZjJlZjc4 · test-lock-kind:replace
