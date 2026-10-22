# Task ADR-123-T2: Outcome, the four risks and the twelve concerns in every spec

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the spec template's new sections
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The spec template asks for the outcome (goal, signal, metric, guardrails, success and kill thresholds), the four risks with typed
assumptions, and the twelve product concerns; spec-verify advises what is missing, names thresholds committed after a result, and
turns the advice into findings where a project opts in.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/spec-product-sections.test.mjs` | create | fixtures for each section, its absence, a bare N/A, late and changed thresholds (0 locks: new) |
| `plugin/templates/spec-template.md` | edit | `## Outcome`, the four-risk `## Risks`, `## Product Concerns` with the twelve rows |
| `plugin/bin/spec-verify` | edit | read the three sections; advise; the opt-in; the pre-registration check against git |
| `plugin/scripts/project-config.mjs` | edit | `productConcerns` (`advise` or `required`), validated as the other keys are |
| `tests/mutations/plugin/bin/spec-verify.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a spec with all three sections passes; one missing `## Product Concerns`
   is advised; a concern marked `N/A` with no reason is advised; with `"productConcerns": "required"` the same are findings; in a
   fixture repository, thresholds first committed after the first Results row are named; thresholds A committed, then a Results
   row, then A changed to B, are named; thresholds committed before the first row and unchanged are clean; a spec with no Results
   row is not judged on it; an ordinary spec with none of the sections still passes.
2. [S2] The template, with the Results table (date, metric, value, commit) under `## Outcome`.
3. [S3] spec-verify reads the sections and the opt-in.
4. [S4] The pre-registration check: the thresholds as they stood in the last commit before the one that added the first Results
   row, against the thresholds now; any difference is named, as ADR-112 compares a pre-registration with its data.
5. [S5] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/spec-product-sections.test.mjs 2>&1) \
  && for n in "a spec states its outcome, its four risks and its twelve concerns, or is advised" \
      "a bare not-applicable concern is advised, and a finding where the project requires it" \
      "thresholds committed after the result are named"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a spec states its outcome, its four risks and its twelve concerns, or is advised` | `tests/spec-product-sections.test.mjs` | the sections and the advice; an ordinary spec unchanged | — | S1, S2, S3 |
| `a bare not-applicable concern is advised, and a finding where the project requires it` | `tests/spec-product-sections.test.mjs` | the N/A reason and the opt-in | — | S1, S3 |
| `thresholds committed after the result are named` | `tests/spec-product-sections.test.mjs` | pre-registration | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | spec-verify reads every spec |
| 3 — the caller can discover it | the template and the advice text |
| 4 — it is used | every spec spec-write writes after T1 |

## Mutation Log

## Invariants

- An existing spec without the sections keeps passing unless its project opts in.

## Risks

- What the test doubles do not model: fixture specs are small; T7 meets a real one.

## Stop Condition

Stop if the pre-registration check cannot tell a result row's commit apart from the spec's own: the owner decides whether results
need a recorded home first.

## Out of Scope

- The model and the delta (T3, T4).

## Verification Log
