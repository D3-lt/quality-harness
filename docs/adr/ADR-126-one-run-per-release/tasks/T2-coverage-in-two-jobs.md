# Task ADR-126-T2: The coverage floor is two parallel jobs

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `coverage floor (python)` as a required context
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`scripts/coverage.sh --js` measures only the JavaScript surface and `--python` only the Python gates; the workflow runs them
as two jobs, `coverage floor` and `coverage floor (python)`, and the ruleset file requires both.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/coverage-split.test.mjs` | create | the cases (0 locks: new) |
| `scripts/coverage.sh` | edit | a surface argument; each half skips the other |
| `.github/workflows/selftest.yml` | edit | the `coverage` job (:71-99) and a second one |
| `.github/rulesets/main.json` | edit | the new required context |

## Ordered Steps

1. [S1] Write the failing test and record the red run: the workflow declares both jobs, each calling `coverage.sh` with its
   surface; the ruleset requires both contexts; `coverage.sh --js` never starts the Python measurement and `--python` never
   runs the JavaScript coverage pass (asserted on the script's text and on a dry run).
2. [S2] Split the script and the job; add the context to the ruleset file.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]
4. [S4] After the landing that carries this, PUT the ruleset. [proof: human: the forge is changed by hand under ADR-118]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/coverage-split.test.mjs 2>&1) \
  && for n in "the coverage floor is two jobs, each measuring one surface, and main requires both" \
      "coverage.sh measures only the surface it is asked for"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the coverage floor is two jobs, each measuring one surface, and main requires both` | `tests/coverage-split.test.mjs` | the workflow and ruleset | — | S1, S2 |
| `coverage.sh measures only the surface it is asked for` | `tests/coverage-split.test.mjs` | the script | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the workflow jobs |
| 3 — the caller can discover it | the job names on the run |
| 4 — it is used | main's required checks |

## Mutation Log

## Invariants

- Neither floor is lowered; each surface is measured exactly once per run.

## Risks

- The forge requires a context no landing produces until the workflow lands: the context is added to the file here and PUT
  only after the landing.

## Stop Condition

Stop if the two halves cannot run independently (the Python measurement needs the JavaScript pass's output).

## Out of Scope

- Sharding the Windows job (re-measured after this lands).

## Verification Log
