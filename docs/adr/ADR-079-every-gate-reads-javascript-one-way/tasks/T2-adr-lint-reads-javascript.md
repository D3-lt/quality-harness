# Task ADR-079-T2: adr-lint finds a JavaScript test on the lexer, and UNPROVEN withholds done

**Depends-on:** T1
**Covers:** F-5, F-6, F-7, F-9, F-10, F-11, F-12, UC2-S1, UC2-S2, UC2-S3, UC2-S5, UC2-S6, UC2-S7, UC2-S8
**Estimated scope:** L (every existence path, four callers, enforcement, the done rule and its exceptions, seven tests)
**Owner:** unassigned
**Produces:** `js_test_body` in `plugin/bin/adr-lint`
**Consumes:** `js_test_lookup` and `JS_FAMILY_SUFFIXES` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a call counts only where it is code`, `the body is bounded on the whole file's view`, `an unbounded body is unproven`, `unproven withholds done`, `history keeps the moved lock's exceptions`, `enforcement says unproven`, `no other language sees unproven`

## Goal

For a JavaScript-family file, every adr-lint existence path reads through the lexer; a body is bounded on the whole file's view or is UNPROVEN; UNPROVEN blocks `done` with a moved lock's exceptions and is advice otherwise; `test_body` keeps its contract for other languages (ADR-079 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `js_test_body`; `js_title_exists`, the file-name shortcut in `check_tests_exist` and `resolve_enforcement`'s arm on `js_test_lookup` with the shared suffix set; the callers at `:3772`, `:4699` and `:5408` branch to it for JavaScript-family files; `check_enforcement` reports unproven; UNPROVEN findings blocking on a done task except on a frozen record or below `strictFrom` |
| `tests/js-reading.test.mjs` | edit | remove `todo` from this task's seven tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the seven tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Add `js_test_body(text, name, suffix)`: `js_test_lookup`, then `bdd_callback_body(…, masked=)` on the whole file. A found call whose body cannot be bounded is `unproven`. There is no declaration, Ruby or last-resort fallback for these files.
3. [S3] Route `js_title_exists`, the file-name shortcut, `resolve_enforcement`'s arm and the callers at `:3772`, `:4699` and `:5408` through it for JavaScript-family files. `check_enforcement` says UNPROVEN for an unproven pointer, and `test_body` keeps answering a string or `None`.
4. [S4] Report `unproven` by name as UNPROVEN, never "not found". It blocks on a done task, except on a frozen record or below `strictFrom`, where it is advice as a moved lock's finding is; on a pending task it is advice.
5. [S5] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
T=$(mktemp)
node --test --test-reporter=tap tests/js-reading.test.mjs > "$T" 2>&1 \
  && for t in 'adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it' 'adr-lint says UNPROVEN for a JavaScript test whose body it cannot bound' 'adr-lint does not find a JavaScript test that exists only inside a string' 'adr-lint says UNPROVEN, and withholds done, for a JavaScript test it could not read to' 'UNPROVEN on a frozen record, or below strictFrom, is advice as a moved lock is' 'an enforcement pointer to a JavaScript test is resolved on the lexer' 'the other languages read as they did'; do test "$(grep -cxE "ok [0-9]+ - $t" "$T")" -eq 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it` | `tests/js-reading.test.mjs` | the real body, not the string's; a decoded title; a body before a later stop | F-5, UC2-S1 | S2 |
| `adr-lint says UNPROVEN for a JavaScript test whose body it cannot bound` | `tests/js-reading.test.mjs` | a `/` in an expression body; a stop inside the body | F-10, UC2-S6 | S2 |
| `adr-lint does not find a JavaScript test that exists only inside a string` | `tests/js-reading.test.mjs` | `missing`; through the CLI, beside a found control | F-6, UC2-S2 | S2, S3 |
| `adr-lint says UNPROVEN, and withholds done, for a JavaScript test it could not read to` | `tests/js-reading.test.mjs` | the CLI: blocking when done, advice when pending, never "not found"; a twin in a complete file not found | F-7, UC2-S3 | S3, S4 |
| `UNPROVEN on a frozen record, or below strictFrom, is advice as a moved lock is` | `tests/js-reading.test.mjs` | the CLI: advice in both | F-11, UC2-S7 | S4 |
| `an enforcement pointer to a JavaScript test is resolved on the lexer` | `tests/js-reading.test.mjs` | the CLI: real resolves, string-held points to nothing, past the stop UNPROVEN | F-12, UC2-S8 | S3 |
| `the other languages read as they did` | `tests/js-reading.test.mjs` | held: Python, Go, PHP; `test_body` answers a string or `None` | F-9, UC2-S5 | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seven tests |
| 2 — something selects it | `check_tests_exist`, `js_title_exists`, `resolve_enforcement` and the can-fail check for JavaScript-family files |
| 3 — the caller can discover it | the UNPROVEN finding naming the test |
| 4 — it is used | every `adr-lint` over a record whose tasks name JavaScript tests |

## Mutation Log

## Invariants

- `test_body` answers a string or `None` for every language.
- A moved lock's handling is unchanged.

## Risks

- A spaced title used to be advice when missing even on a done task; that stays as it is, and only UNPROVEN blocks.

## Stop Condition

Stop and ask if a non-JavaScript caller would have to change, or if the frozen and `strictFrom` exceptions cannot reach the existence check.

## Out of Scope

- Can-fail — T3.

## Verification Log
