# Task ADR-079-T3: adr-lint judges a JavaScript body and its helpers on the code view

**Depends-on:** T2
**Covers:** F-8, UC2-S4
**Estimated scope:** S (the can-fail branch and its helper follow, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** `js_test_body` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `can-fail reads the whole file's code view`, `a helper is followed on the same view`

## Goal

For a JavaScript-family file, the can-fail check searches the whole file's masked view over the body's span and each same-file helper's span, so an assertion inside `${…}` counts and a regex literal never does (ADR-079 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `js_body_can_fail(text, name, suffix)`; the can-fail check and its helper follow branch to it for JavaScript-family files instead of re-scanning with `code_only` |
| `tests/js-reading.test.mjs` | edit | remove `todo` from this task's test |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the test in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Add `js_body_can_fail`: `FAIL_CALLS` over the body's span of the whole file's masked view, then over the span of each same-file helper the body calls, bounded the same way; unproven as in T2.
3. [S3] Route the can-fail check and its helper follow to it for JavaScript-family files.
4. [S4] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
T=$(mktemp)
node --test --test-reporter=tap tests/js-reading.test.mjs > "$T" 2>&1 \
  && test "$(grep -cxE 'ok [0-9]+ - adr-lint judges a JavaScript body and its helpers on the code view' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-lint judges a JavaScript body and its helpers on the code view` | `tests/js-reading.test.mjs` | `${assert…}` can fail; `/assert/` cannot; a helper that asserts; the same through the CLI | F-8, UC2-S4 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | the can-fail check for JavaScript-family files |
| 3 — the caller can discover it | the asserts-nothing finding |
| 4 — it is used | every `adr-lint` over a done task naming a JavaScript test |

## Mutation Log

## Invariants

- Other languages' can-fail reading is unchanged.

## Risks

- None beyond T2's.

## Stop Condition

Stop and ask if a helper's span cannot be taken from the whole file.

## Out of Scope

- The corpus bar — T4.

## Verification Log
