# Task ADR-077-T2: A campaign holds the same lease, covering its child

**Depends-on:** T1
**Covers:** F-1, F-11, F-12, UC3-S1, UC3-S2
**Estimated scope:** M (one caller, its child, its tests' environment, three tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** `take`, `mark`, `observe`, `release`, `leaseDir` and `alive` in `plugin/scripts/lease.mjs` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a campaign holds a lease with its child`, `a killed parent's lease stays while its child works`, `a campaign waits when asked`, `a campaign's tests have a private lease directory`, `the suite has a private lease directory`

## Goal

A campaign run by `scripts/mutate.mjs` — isolated or in place — takes the same lease as `qh-check`. The lease records the isolated child and its group, so it is live while any of them lives. The campaign waits when asked, and its tests and fixtures use private lease directories (ADR-077 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | take the lease before the selection; add the child and group once spawned; release after ADR-075's group-ended wait; `--wait` in `KNOWN` and the usage; `childEnv` sets a private lease directory; import `alive` from the module |
| `tests/campaign-fixture.mjs` | edit | `campaignEnv` sets a private lease directory and clears `QUALITY_HARNESS_WAIT` |
| `tests/lease.test.mjs` | edit | remove `todo` from the campaign tests |
| `tests/mutations.json` | edit | this task's entries |

## Ordered Steps

1. [S1] Remove `todo` from the two campaign tests and the private-directory test, and record the red run (TDD red). [proof: acceptance]
2. [S2] Take the lease in the parent before the selection runs; skip it under `QUALITY_HARNESS_CAMPAIGN_CHILD`. Add the child's pid and, on POSIX, its group once spawned. Release only after ADR-075's group-ended wait confirms the end.
3. [S3] `--wait` and `QUALITY_HARNESS_WAIT`: wait under T1's admission before the selection runs; add `--wait` to `KNOWN` and the usage line.
4. [S4] `childEnv` sets `QUALITY_HARNESS_LEASE_DIR` inside the child's scratch; `campaignEnv` sets one per call and clears `QUALITY_HARNESS_WAIT`.
5. [S5] Replace `mutate.mjs`'s own `alive` with the module's, whose unknown answer the ownership lock treats as alive.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/lease.test.mjs tests/mutate-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a campaign holds a lease that records its isolated child, and releases it at its end|a campaign.s tests and the selftest use a private lease directory|a campaign asked to wait starts its suite only after the running lease is released|a campaign leaves the working tree byte-identical and its mutants never appear there)' "$T")" -eq 4 && test "$(grep -cxE 'ok [0-9]+ - a killed campaign parent.s lease stays live while its child works( # SKIP Windows ends the child with its parent \(ADR-075\))?' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a campaign holds a lease that records its isolated child, and releases it at its end` | `tests/lease.test.mjs` | one lease naming the parent and its child; none after | F-1, UC3-S1 | S2 |
| `a killed campaign parent's lease stays live while its child works` | `tests/lease.test.mjs` | named while the child works, gone once it ends (POSIX) | F-11, UC3-S2 | S2 |
| `a campaign's tests and the selftest use a private lease directory` | `tests/lease.test.mjs` | `childEnv`'s half | F-12 | S4 |
| `a campaign asked to wait starts its suite only after the running lease is released` | `tests/lease.test.mjs` | no suite runs while a neighbour's lease is running | — | S3 |
| `a campaign leaves the working tree byte-identical and its mutants never appear there` | `tests/mutate-isolation.test.mjs` | ADR-075 still holds | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the lease calls and the tests |
| 2 — something selects it | every campaign |
| 3 — the caller can discover it | the "running beside" lines |
| 4 — it is used | a `qh-check` beside a campaign names it |

## Mutation Log

## Invariants

- ADR-075's behaviour is unchanged.

## Risks

- A campaign killed by SIGKILL on Windows leaves its lease until its pid has ended; the next observer removes it then.

## Stop Condition

Stop and ask if the lease must be taken in the isolated child instead of the parent.

## Out of Scope

- None — the campaign's other behaviour is unchanged

## Verification Log
