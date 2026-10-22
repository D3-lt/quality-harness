# Task ADR-123-T4: A spec is a delta, merged and validated

**Depends-on:** T2, T3
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `--merge`
**Consumes:** the spec template's new sections (T2); the Living model and its spec-verify judgement (T3)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A spec in a repository with a model carries `## Model Delta`; `spec-verify --merge <spec>` validates it against the model and
writes the merged model through a temporary file and a rename, or writes nothing and says why.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/model-merge.test.mjs` | create | deltas that merge and deltas that must not (0 locks: new) |
| `plugin/templates/spec-template.md` | edit | `## Model Delta`: added, modified and retired capabilities and rules, by id |
| `plugin/bin/spec-verify` | edit | `--merge` |
| `tests/mutations/plugin/bin/spec-verify.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: an added capability and rule merge, and the merged model passes T3's
   checks; an added id that exists, a modified or retired id that does not, and a modified rule whose base text differs from the
   model's each refuse and leave the model byte-identical; retiring a capability a journey still uses builds a model that fails
   T3's checks, so it refuses and leaves the model byte-identical; a delta naming a rule that is still `@spec`, or whose test
   fails, does not merge; a merge interrupted after the temporary file is written leaves the model whole.
2. [S2] The template section.
3. [S3] `--merge`: validate the delta, build the whole candidate, run T3's checks over it, then rename.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/model-merge.test.mjs 2>&1) \
  && for n in "a valid delta merges into a model that still passes" \
      "an invalid delta writes nothing and says why"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a valid delta merges into a model that still passes` | `tests/model-merge.test.mjs` | the merge | — | S1, S2, S3 |
| `an invalid delta writes nothing and says why` | `tests/model-merge.test.mjs` | every refusal; an invalid candidate; an interrupted merge | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `--merge` |
| 3 — the caller can discover it | spec-verify's help; spec-write's closing step |
| 4 — it is used | T7 |

## Mutation Log

## Invariants

- A failed merge changes nothing.

## Risks

- What the test doubles do not model: concurrent merges; the rename makes the last one win whole.

## Stop Condition

Stop if a modified rule cannot be matched to its base text without a stable rule id.

## Out of Scope

- Merging specs written before the model existed.

## Verification Log
