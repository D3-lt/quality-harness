# Task ADR-079-T2: adr-lint reads a JavaScript test file with the lexer

**Depends-on:** none
**Covers:** F-3, F-4, F-5, F-6, UC2-S1, UC2-S2, UC2-S3
**Estimated scope:** M (one function, its two JavaScript callers, four tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a BDD match counts only in code`, `the body is bounded on the lexer's view`, `past the stop is said UNPROVEN`

## Goal

`test_body` reads a JavaScript-family file with `_js_lex`, and the existence and can-fail checks say UNPROVEN for a test past the lexer's stop (ADR-079 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `test_body(…, suffix=)` and `UNPROVEN_BODY`; the existence check (`:4699`) and the can-fail check (`:5396`, `:5408`) pass the suffix and say UNPROVEN for that sentinel |
| `tests/js-reading.test.mjs` | edit | remove `todo` from this task's four tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the four tests in Covers and record the red run (TDD red). [proof: acceptance]
2. [S2] `test_body(text, name, …, suffix=None)`: for a JavaScript-family suffix, take a BDD match only where `_js_lex` says code, and bound its body with `bdd_callback_body` over the lexer's masked view.
3. [S3] When no match is in code and the name occurs past the lexer's stop, return `UNPROVEN_BODY`; the existence check advises it UNPROVEN, not "not found", and the can-fail check advises it UNPROVEN instead of `continue`.
4. [S4] Run `adr-lint` over every record in `docs/adr` before and after, and record both in the commit message; any change other than the spec's listed fixes stops the task. [proof: human: the session compares the two verdict lists]
5. [S5] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/js-reading.test.mjs tests/corpus-lint.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it|adr-lint says UNPROVEN for a JavaScript test past where the lexer stops|adr-lint does not find a JavaScript test that exists only inside a string|the other languages read as they did)' "$T")" -eq 4
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it` | `tests/js-reading.test.mjs` | the real declaration's body, not the string's | F-3, UC2-S1 | S2 |
| `adr-lint says UNPROVEN for a JavaScript test past where the lexer stops` | `tests/js-reading.test.mjs` | the sentinel, and the gate's own words | F-4, UC2-S2 | S3 |
| `adr-lint does not find a JavaScript test that exists only inside a string` | `tests/js-reading.test.mjs` | not found | F-5, UC2-S3 | S2 |
| `the other languages read as they did` | `tests/js-reading.test.mjs` | Python, Go and PHP | F-6 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | the existence and can-fail checks, run on every `adr-lint` |
| 3 — the caller can discover it | the advice line |
| 4 — it is used | `tests/corpus-lint.test.mjs` runs `adr-lint` over every active record |

## Mutation Log

## Invariants

- `test_body` without `suffix`, and with any non-JavaScript suffix, returns what it returns today.

## Risks

- A record in this repository names a test past an unplaceable `/`: S4's comparison finds it, and the task stops.

## Stop Condition

Stop and ask if any `adr-lint` verdict over `docs/adr` changes other than as the spec lists.

## Out of Scope

- `spec-verify` — T1.

## Verification Log
