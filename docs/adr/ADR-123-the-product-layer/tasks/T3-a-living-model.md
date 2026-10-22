# Task ADR-123-T3: A living product model, judged by spec-verify and reported by work-next

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the Living model and its spec-verify judgement
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`docs/product/model.md` with Status `Living` is accepted by spec-verify, which checks its structure and runs every `@implemented`
rule on evidence; work-next names an uncovered capability and a model not run since its rules changed.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/product-model.test.mjs` | create | fixture models, valid and broken, with stub runners (0 locks: new) |
| `plugin/templates/product-model-template.md` | create | Goals, Actors, Capabilities, Journeys, Glossary, Rules (with a Capability column), Context, Open Questions; it joins ADR-123's `Governs:` in the same commit, since a pointer to a file not yet tracked fails the corpus's own check |
| `docs/adr/ADR-123-the-product-layer.md` | edit | `Governs:` gains the template |
| `plugin/bin/spec-verify` | edit | the `Living` status (it reads none today, :734 requires use cases); the model's structure checks; Living rule tags |
| `plugin/bin/spec-verify` (receipt) | edit | on a passing `--implemented` run over a Living model, append the Rules digest, commit and verdict to `model-runs.jsonl` in the repository's state directory |
| `plugin/scripts/work-next.mjs` | edit | `specStatus` (:309) knows `Living`; discovery reads `docs/product/`; the two reports |
| `tests/mutations/plugin/bin/spec-verify.json` | edit | one entry per mechanism |
| `tests/mutations/plugin/scripts/work-next.mjs.json` | edit | the same |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a valid model passes `--spec`; a capability with no rule, a journey naming a
   missing capability, a goal with no metric, a term defined twice, and a rule naming a missing capability each fail; a `@spec` or
   `@draft` rule in a Living model fails; a model with no use cases is not asked for them; under `--implemented` a rule whose stub
   runner reports a pass passes, one whose stub selects nothing is UNRUN, one that fails fails, and a Cmd override is UNRUN unless
   its output carries a runner's ran-evidence (`true`, `test 1 = 1` and `true; true` each UNRUN; a stub printing a runner
   summary passes); work-next reports a model never run, one whose receipt matches its Rules (clean), one whose Rules changed
   after its receipt, and one whose last run failed; an ordinary spec and a model in one repository are each judged by their own
   rules; a repository with only a model is read.
2. [S2] The template.
3. [S3] spec-verify: the status, the structure checks, the tags, the override evidence, the receipt.
4. [S4] work-next: the status, discovery, the reports from the receipt.
5. [S5] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/product-model.test.mjs 2>&1) \
  && for n in "a living model passes when every part is linked, and each broken link fails" \
      "every implemented rule runs, and one that did not run is not a pass" \
      "work-next names an uncovered capability and a model not run since its rules changed"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a living model passes when every part is linked, and each broken link fails` | `tests/product-model.test.mjs` | the structure checks, the tags, no use cases required | — | S1, S2, S3 |
| `every implemented rule runs, and one that did not run is not a pass` | `tests/product-model.test.mjs` | execution on evidence | — | S1, S3 |
| `work-next names an uncovered capability and a model not run since its rules changed` | `tests/product-model.test.mjs` | the reports; a model beside an ordinary spec; a model alone | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | spec-verify on `docs/product/model.md`; work-next's discovery |
| 3 — the caller can discover it | the template; spec-write's map mode (T6) |
| 4 — it is used | T7 |

## Mutation Log

## Invariants

- A rule passes only on evidence its test ran.
- An ordinary spec is judged as before.

## Risks

- What the test doubles do not model: stub runners print measured output; T7 meets real runners.

## Stop Condition

Stop if spec-verify cannot read `Living` without changing an ordinary spec's verdict.

## Out of Scope

- The delta and its merge (T4).

## Verification Log
