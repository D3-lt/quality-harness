# Task ADR-112-T1: The scorer reads broken tests as an endpoint, and says PAYS

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (the scorer, its verdict file and its tests)
**Owner:** Zy
**Produces:** the broken-tests endpoint and PAYS
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`eval-paired.mjs` computes broken-tests incidence as a paired endpoint with its one-sided permutation p and bootstrap
percentiles, and says PAYS when either primary is shown and no guard fails, under a pre-registration that names both
endpoints (ADR-112, Decisions 3 and 4); a pre-registration without them scores exactly as ADR-106's did.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/eval-paired.mjs` | edit | the endpoint, the word, the pre-registration fields that switch them on, the verdict file's keys and codes |
| `tests/eval-paired.test.mjs` | edit | new tests beside the locked ones |
| `tests/mutations/scripts/eval-paired.mjs.json` | edit | a mutant per decision point |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/eval-paired.test.mjs`; write the failing tests beside the locked ones: a synthetic row set where broken tests fall and false completion does not reads PAYS under a two-endpoint pre-registration; the same rows under ADR-106's pre-registration read as they did; a guard failure keeps PAYS from being said; the verdict file writes only the new keys and codes. Record the red run.
2. [S2] Implement, keeping ADR-106's output byte-identical when the pre-registration does not name the endpoint.
3. [S3] Record a killed mutant per decision point. [proof: mutation]

## Acceptance

```bash
node --test tests/eval-paired.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `broken tests is a paired endpoint, and PAYS needs a shown primary and no failed guard` | `tests/eval-paired.test.mjs` | the endpoint and the word, with twins | — | S1, S2 |
| `a pre-registration without the endpoint scores exactly as ADR-106's` | `tests/eval-paired.test.mjs` | backward identity | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the endpoint |
| 2 — something selects it | the pre-registration fields; the mutants |
| 3 — the caller can discover it | `eval-paired.mjs --help` |
| 4 — it is used | T3 |

## Mutation Log

## Invariants

- ADR-106's verdicts and verdict files are unchanged for its pre-registrations.

## Risks

- Two primaries need a stricter level; Decision 3 pre-registers it.

## Stop Condition

Stop if the endpoint needs any per-instance field the export does not carry.

## Out of Scope

- Pooling arms or models (permanent: boundary: ADR-106 Decision 1 as amended)

## Verification Log
