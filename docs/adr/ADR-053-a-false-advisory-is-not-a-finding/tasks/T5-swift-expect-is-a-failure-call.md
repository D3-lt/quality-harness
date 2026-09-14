# Task ADR-053-T5: Swift #expect is a failure call so an expect-only test is not dead

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the #expect keep in scan_code_only`

## Goal

For Swift, `scan_code_only(..., hash_comments=True)` does not treat `#expect` / `#require` as line comments. An `#expect`-only or `#require`-only `@Test` body is not "calls nothing and asserts nothing". An empty `@Test` body still blocks that sentence. Hasher `_mask_lock_noncode(..., swift=True)` is unchanged.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `scan_code_only` keeps `#expect` / `#require` when `hash_comments` |
| `tests/swift-expect.test.mjs` | add | expect-only and require-only clean; empty body still blocks |

## Ordered Steps

1. [S1] Confirm the failing test for this task exists and is red. [proof: acceptance]
2. [S2] When `hash_comments` would open a `#` line-comment, keep the token if it is `#expect` or `#require` followed by a non-identifier continuation. `#expected` is not a keep. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `Swift #expect is a failure call so an expect-only test is not dead` | `tests/swift-expect.test.mjs` | `#expect` / `#require` bodies are not dead; empty body still blocks | none — no spec | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | keep in `scan_code_only` |
| 2 — something selects it | `code_only` → `check_tests_can_fail` |
| 3 — the caller can discover it | `python3 plugin/bin/adr-lint` on a done Swift task |
| 4 — it is used | the swift-expect test |

## Invariants

- Hasher Swift lock tests are not edited.
- An empty Swift body still BLOCKS.
- `#expected` is not treated as `#expect`.

## Risks

- Keeping every `#` token. Mitigation: only `expect` / `require` with a word boundary.

## Stop Condition

`#expect`-only still BLOCKS, or an empty body goes silent.

## Out of Scope

- `tests/test-lock.test.mjs` locked bodies
- Enabling JS `_js_regex_span_end` on `php=True`
- Pest arrow `{`

## Verification Log
- 2026-09-14 · a5c21a2* · exit 1 · `node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs` · acceptance-sha256:67326d7f95b9079c028ef0558d52dc3ce97d70e0e4ab58ed2266eabdeb7e7a96 · ms:160 · test-lock-sha256:fba17d3ddcf11ccc5cf9bef673bf7123b4364be2605989993a26fcfb50d11fac · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3N3aWZ0LWV4cGVjdC50ZXN0Lm1qcwlTd2lmdCAjZXhwZWN0IGlzIGEgZmFpbHVyZSBjYWxsIHNvIGFuIGV4cGVjdC1vbmx5IHRlc3QgaXMgbm90IGRlYWQJOTc1YTRkZjc5Y2U4YTdlMGZiNDNlYWQ0NDRkYjgwZjAwM2M1MmM5NzNlZTA0NjU5ZGZlNmRkMWE0NmNjY2IyNg
  ```
  --- last 10 line(s) of stdout (of 34 after folding 34 raw)
        at Test.run (node:internal/test_runner/test:1106:25)
        at Test.start (node:internal/test_runner/test:1003:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: [ 'T1.md: T1 is marked done and names `expectOnly`, and its body calls nothing and asserts nothing — there is no path by which it can go red, so a green run of it proves nothing' ],
      expected: [],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs` · acceptance-sha256:67326d7f95b9079c028ef0558d52dc3ce97d70e0e4ab58ed2266eabdeb7e7a96 · ms:223
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs` · acceptance-sha256:67326d7f95b9079c028ef0558d52dc3ce97d70e0e4ab58ed2266eabdeb7e7a96 · ms:180

## Mutation Log
- 2026-09-14 · a5c21a2* · mutant killed · exit 1 · `plugin/bin/adr-lint` · emptying the Swift keep list strips #expect as a hash comment so an expect-only test looks dead · acceptance-sha256:67326d7f95b9079c028ef0558d52dc3ce97d70e0e4ab58ed2266eabdeb7e7a96 · covers:the #expect keep in scan_code_only
