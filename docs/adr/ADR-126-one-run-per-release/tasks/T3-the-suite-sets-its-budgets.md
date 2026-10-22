# Task ADR-126-T3: Every runner of the suite sets the budgets its tests depend on

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `QUALITY_HARNESS_OBSERVE_BUDGET_MS` in the suite's environment
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`selftest.sh`, `coverage.sh`, the workflow and a mutation campaign's children all set `QUALITY_HARNESS_OBSERVE_BUDGET_MS`, so
no hook-spawning test inherits the product's 5 s; corpus-lint's per-record bound doubles under coverage; `observe-racy`'s
assertion prints the observation's reason.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/suite-budgets.test.mjs` | create | the cases (0 locks: new) |
| `scripts/selftest.sh` | edit | the export block (:29-51) |
| `scripts/coverage.sh` | edit | the same export |
| `.github/workflows/selftest.yml` | edit | top-level `env` |
| `scripts/mutate.mjs` | edit | the children's environment (:666-676) |
| `tests/corpus-lint.test.mjs` | edit | `LINT_TIMEOUT_MS` (:24), a helper outside every test body |
| `tests/observe-racy.test.mjs` | edit if unlocked; else a helper | the reason in the message |

## Ordered Steps

1. [S1] Write the failing test and record the red run: each of the four runners names the variable with a value; a planted
   runner without it is found.
2. [S2] Add the exports; scale corpus-lint's bound; print observe's reason.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/suite-budgets.test.mjs 2>&1) \
  && for n in "every runner of the suite sets the observe budget the tests depend on"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every runner of the suite sets the observe budget the tests depend on` | `tests/suite-budgets.test.mjs` | the four runners | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new test |
| 2 — something selects it | each runner exports before it starts the suite |
| 3 — the caller can discover it | the variable in the runner's text |
| 4 — it is used | `tree-facts.mjs` `observeBudget` reads it |

## Mutation Log

## Invariants

- A test of the budget's own default passes its own environment and is unaffected.

## Risks

- A slow hook is no longer caught by a test's timing: hook cost is measured by `scripts/hook-cost.mjs`, not by the suite.

## Stop Condition

Stop if a test asserts the default by reading the ambient environment.

## Out of Scope

- `observe-racy`'s Windows cause (ADR-126 Out of Scope).

## Verification Log
