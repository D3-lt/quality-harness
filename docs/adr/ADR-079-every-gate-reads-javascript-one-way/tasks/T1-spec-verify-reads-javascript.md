# Task ADR-079-T1: spec-verify reads a JavaScript test file with the lexer

**Depends-on:** none
**Covers:** F-1, F-2, UC1-S1, UC1-S2
**Estimated scope:** S (one function, two tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a registration counts only in code`, `past the stop is could-not-check`

## Goal

`test_definition_exists` reads a JavaScript-family file with `_js_lex`, and answers could-not-check for a name past the lexer's stop (ADR-079 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/spec-verify` | edit | the JavaScript-family suffix list with `.mts`/`.cts`; `_js_lex`'s masked view for that branch; `None` past the stop; the caller reports `None` in its exit-4 class |
| `tests/js-reading.test.mjs` | edit | remove `todo` from this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the two tests in Covers and record the red run (TDD red). [proof: acceptance]
2. [S2] For a JavaScript-family suffix, read `registered_test_names` over `_js_lex(text, ts)[0]`; add `.mts` and `.cts`.
3. [S3] When the name is not registered and occurs in the raw text at or after the lexer's stop, return `(None, "UNPROVEN — …")`; make the caller (`:442`) report `None` as could-not-check.
4. [S4] Run `spec-verify --spec` over every spec in `docs/specs` before and after, and record both in the commit message; any change stops the task. [proof: human: the session compares the two verdict lists]
5. [S5] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/js-reading.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (spec-verify finds a JavaScript test only where its registration is code|spec-verify cannot check a JavaScript test past where the lexer stops)' "$T")" -eq 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `spec-verify finds a JavaScript test only where its registration is code` | `tests/js-reading.test.mjs` | code counts, a string does not, `.mts` is read | F-1, UC1-S1 | S2 |
| `spec-verify cannot check a JavaScript test past where the lexer stops` | `tests/js-reading.test.mjs` | `None`, said as UNPROVEN | F-2, UC1-S2 | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `test_definition_exists` is what `spec-verify --spec` calls for every binding |
| 3 — the caller can discover it | the exit-4 class `spec-verify --help` already documents |
| 4 — it is used | every `spec-verify --spec` over a JavaScript binding |

## Mutation Log

## Invariants

- Every other suffix's branch of `test_definition_exists` is unchanged.

## Risks

- A spec in this repository binds a test past an unplaceable `/`: S4's comparison finds it, and the task stops.

## Stop Condition

Stop and ask if any `spec-verify --spec` verdict over `docs/specs` changes.

## Out of Scope

- `adr-lint` — T2.

## Verification Log
