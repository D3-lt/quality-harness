# Task ADR-123-T5: Quality scenarios and a context map in the architecture

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** quality scenarios and the context map
**Consumes:** the Living model and its spec-verify judgement (T3)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The architecture template carries `## Quality Scenarios` (six fields each) and `## Context Map`; arch-lint checks every scenario
has all six fields and a measure, and every context the model names exists here.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/arch-quality.test.mjs` | create | fixtures (0 locks: new) |
| `plugin/templates/architecture-template.md` | edit | the two sections |
| `plugin/bin/arch-lint` | edit | the two checks, advised when the sections are absent |
| `tests/mutations/plugin/bin/arch-lint.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a scenario with six fields and a measure passes; one missing its response
   measure fails; a context the model names and the map lacks is named; an architecture document without the sections is
   advised, not refused.
2. [S2] The template.
3. [S3] arch-lint.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/arch-quality.test.mjs 2>&1) \
  && for n in "a quality scenario has all six fields and a measure" \
      "a context the model names must be on the map"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a quality scenario has all six fields and a measure` | `tests/arch-quality.test.mjs` | the scenario check | — | S1, S2, S3 |
| `a context the model names must be on the map` | `tests/arch-quality.test.mjs` | the map check | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | arch-lint on `docs/architecture.md` |
| 3 — the caller can discover it | the template |
| 4 — it is used | this repository's own architecture document, and T7 |

## Mutation Log

## Invariants

- An architecture document without the sections keeps passing, advised.

## Risks

- What the test doubles do not model: whether a measure is the right one; a review owns that.

## Stop Condition

Stop if the six fields cannot be read without a new table grammar arch-lint does not have.

## Out of Scope

- Generating diagrams.

## Verification Log
