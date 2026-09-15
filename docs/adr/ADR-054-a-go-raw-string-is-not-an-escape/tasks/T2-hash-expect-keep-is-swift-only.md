# Task ADR-054-T2: `#expect` keep is Swift-only

**Depends-on:** T1
**Covers:** F-2, UC2-S1, UC2-S2
**Estimated scope:** S
**Owner:** zy
**Produces:** Swift-only `#expect` keep
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the Swift-only #expect keep`, `the PHP hash-comment strip`

## Goal

`#expect` / `#require` stay code only for Swift. On other `hash_comments` languages they are comments. PHP `#expect a result here` is not a fail word. An empty Swift body still blocks. `tests/swift-expect.test.mjs` stays first-red locked.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | key the keep on `.swift` through `test_body` → `code_only` → `scan_code_only` (declaration/last-resort strip at `code_only` first) and the second `code_only` in `check_tests_can_fail`; default keep off |
| `tests/leftovers-after-adr053.test.mjs` | edit | PHP dirty case already bound |

## Ordered Steps

1. [S1] Confirm the PHP `#expect` test is red and the locked Swift `#expect` test is still green. [proof: acceptance]
2. [S2] Thread a Swift suffix/flag into `test_body` / `code_only` / `scan_code_only` so `#expect` / `#require` survive when stripping a `.swift` body. Keying only the second `code_only` in `check_tests_can_fail` is not enough: declaration and last-resort branches already strip via `code_only` first. On any other `hash_comments` language, `#` starts a comment. Do not edit `tests/swift-expect.test.mjs`. `#[` still does not start a hash comment. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a PHP #expect comment is not a fail word' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a PHP #expect comment is not a fail word` | `tests/leftovers-after-adr053.test.mjs` | PHP `#expect a result here` blocks as dead | F-2, UC2-S2 | S1, S2 |
| `Swift #expect is a failure call so an expect-only test is not dead` | `tests/swift-expect.test.mjs` | Swift macros still count; empty body still blocks | F-2, UC2-S1 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | keep gated on Swift suffix |
| 2 — something selects it | `check_tests_can_fail` → `code_only` |
| 3 — the caller can discover it | `python3 plugin/bin/adr-lint` on a done task |
| 4 — it is used | leftovers PHP test + locked Swift test |

## Mutation Log

## Invariants

- `tests/swift-expect.test.mjs` body is not edited.
- An empty Swift body still BLOCKS.
- `#expected` is not treated as `#expect`.
- Hasher `_mask_lock_noncode(..., swift=True)` is unchanged.

## Risks

- Threading keep through `scan_code_only` default-on rewrites the Swift lock. Mitigation: key on `.swift` at `check_tests_can_fail`; do not change the locked test file.

## Stop Condition

PHP `#expect` still counts as a fail word, or Swift `#expect`-only blocks again.

## Out of Scope

- `plugin/bin/arch-lint` `scan_code_only`
- Enabling JS `_js_regex_span_end` on `php=True`

## Verification Log
