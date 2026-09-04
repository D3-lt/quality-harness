# Task ADR-028-T3: Make the mutation path obey the same `--steps` rules as the plain one

**Depends-on:** ADR-028-T1
**Covers:** none — no spec
**Estimated scope:** S (one gate, two call sites and an ordering)
**Owner:** unassigned
**Produces:** none — T1's ` · steps:` field, now written and validated on the `--mutant` path too
**Consumes:** ` · steps:S1,S3` trailing Verification Log field, written by `adr-verify --steps` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the clean entry a --mutant run writes carries the steps it was given`, `an undeclared step id is refused on the --mutant path, before the mutant is applied`

## Goal

`--steps` behaves identically whether or not `--mutant` is also given: the entry carries the field,
and an id the task never declared is refused before anything is touched.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | forward `steps` into `run_mutant`, and lift the preflight above the branch that exits |
| `tests/evidence-chain.test.mjs` | edit | both mechanisms, driven through the real CLI |
| `tests/mutations.json` | edit | two catalogue entries, or the checks are unproven (ADR-003) |

## Ordered Steps

1. [S1] Write both tests first and confirm both RED: a `--mutant` run given `--steps S1` must write one Verification Log row carrying ` · steps:S1`, and `--steps S9 --mutant` must be refused without applying the mutant. (TDD red.) [proof: acceptance]
2. [S2] Forward `steps` through `run_mutant` to both of its `record_run` call sites — the UNPROVEN early return and the ADR-025 clean-run entry. [proof: acceptance]
3. [S3] Move the `--steps` preflight ABOVE the `if mutant is not None:` branch, so it is reachable on both paths, and restore the `MONOTONIC` comment the block had been inserted into the middle of. [proof: acceptance]
4. [S4] Correct the comment on T1's own test, which described the missing field as the design rather than as the defect. [proof: acceptance]
5. [S5] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/evidence-chain.test.mjs tests/gates.test.mjs 2>&1 | tee /tmp/adr028-t3.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr028-t3.out \
  && python3 plugin/bin/adr-lint docs/adr/ADR-025-a-clean-run-is-evidence-of-itself.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a mutation run's own clean entry carries the steps it was given` | `tests/evidence-chain.test.mjs` | the field is written on the mutation path, and absent there when unasked | — | S1, S2 |
| `--steps refuses an undeclared id on the --mutant path too` | `tests/evidence-chain.test.mjs` | the preflight is reachable, and lands before the mutant is applied | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `run_mutant` takes `steps` and both its `record_run` calls pass it |
| 2 — something selects it | `main()` forwards the parsed flag; the tests drive the real CLI with both flags together |
| 3 — the caller can discover it | no new surface — `--steps` is already in the usage text, and this is what it already promised |
| 4 — it is used | this repository's own next `--mutant --steps` run records it; corpus-wide adoption is T2's advisory to observe and a proxy here would read like evidence |

## Mutation Log

## Verification Log

## Invariants

- An entry written without `--steps` is byte-identical on both paths to what the tool emitted before.
- A step id not declared in the task's Ordered Steps is refused before the mutant is applied.
- The `--mutant` path writes exactly one Verification Log row, as it did before this task.
- The Mutation Log row's grammar is untouched: this task moves nothing into it.

## Risks

- Lifting the preflight changes what runs before `recover_mutant`'s tree repair. It does not: `recover_mutant(cwd)` stays first, and the preflight only reads the task text and may `fail()` — asserted by the test's check that no `MUTANT APPLIED` line precedes the refusal.
- The fence lints **ADR-025**, not this task's own record, and that is not arbitrary. A fence that lints the record it belongs to cannot go green until the task is finished, because `adr-lint` refuses a task carrying passing acceptance evidence with an empty Mutation Log — so the first verification run fails on the absence of the mutation the run exists to produce. Measured here on 2026-09-04, and it is why T1's fence lints ADR-022. ADR-025 is the apt target anyway: the entry this task threads `steps` onto is the one ADR-025 made the mutation path write.

## Stop Condition

Stop if carrying `steps` onto the mutation path would require a second grammar for the Mutation Log
row. The field belongs to the Verification Log entry ADR-025 already has this path write, and a
mutation row that grew a parallel spelling of the same idea would be the drift ADR-025's own
follow-up is watching for.

## Out of Scope

- Putting `steps:` on the Mutation Log row itself (permanent: boundary: the row names a mechanism via `covers:`, which is ADR-022's field; steps describe the fence run, which is the entry ADR-025 has this path write)
- `--human-mutant`, which executes nothing and so exercises no step (permanent: boundary: ADR-013's premise is that no run happened)
- Per-step file attribution (deferred: docs/BACKLOG.md §114)
