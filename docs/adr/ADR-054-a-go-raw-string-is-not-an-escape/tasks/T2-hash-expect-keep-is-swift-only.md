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
- 2026-09-15 · bd4daaa* · mutant killed · exit 1 · `plugin/bin/adr-lint` · global #expect keep leaves PHP #expect as a fail word · acceptance-sha256:03378b1cb4ebb74413279d788f78ae221dfdab888623a4c276db7fdbc184a806 · covers:the Swift-only #expect keep
- 2026-09-15 · bd4daaa* · mutant killed · exit 1 · `plugin/bin/adr-lint` · dropping hash comments leaves PHP #expect as a fail word · acceptance-sha256:03378b1cb4ebb74413279d788f78ae221dfdab888623a4c276db7fdbc184a806 · covers:the PHP hash-comment strip

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
- 2026-09-15 · bd4daaa* · exit 1 · `node --test --test-name-pattern 'a PHP #expect comment is not a fail word' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs` · acceptance-sha256:03378b1cb4ebb74413279d788f78ae221dfdab888623a4c276db7fdbc184a806 · ms:121 · test-lock-sha256:e409dd63c258a0ad1afcc71002d92ee66d5cd9fc4fb1594fe8be88d33b13efc9 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJQy1lc2NhcGluZyBHbyBiYWNrdGlja3MgbGVhdmVzIGxhdGVyIHRlc3RzIFVOUFJPVkVOOyBKUyB0ZW1wbGF0ZXMgc3RpbGwgZXNjYXBlCWFjYTU1OTMxYTMzNDAxMWFlNWI0MzZiZDE2YWFkYjgyZTJiYTgxNmI1MTcyMWY5NGZiNzc2YTQ3ZGIxMmI0MzEKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWEgR28gcmF3IHN0cmluZyBlbmRpbmcgaW4gYmFja3NsYXNoIHN0aWxsIGhhc2hlcyBsYXRlciB0ZXN0cwk0YWJjZmJjMGNlYTAwNTgxOGE0MTNkMTk2ZDNlMzY4NTFkMzZhNDcxNWQ3YzhkOTlhNWZkZThmYWRlNGRhODZmCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlhIFBIUCAjZXhwZWN0IGNvbW1lbnQgaXMgbm90IGEgZmFpbCB3b3JkCTViNzQ4MGI3MzlkOWYyMWNiYzkyMTliNmUwZDI0NWZiZTFmNGQxMTZmZGZmNmNjODczZWU5ODc4YThlMDdiYTAKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWNvbW1hbmQgLXYgaXMgbm90IGEgcHVibGlzaDsgbG91ZCBqb2luZXJzIHN0aWxsIGFkdmlzZQkzNDBjZjIwOTc1NDM4M2Q2NGFjMjZjNWYwZGRkNTJkODkyNDZlYWU0NGE0NjNiMWYyNzVhNGJmMmZhODBhZTJiCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlzdWRvIC1uIGFmdGVyIGEgY2hlY2sgc3RpbGwgc3RyaXBzCTEyNGFmZWZkMmM0YjFmMTY2M2FmYzdmYzg1ZWQwZTg2YTdmZmVmZWIwMjNkNGU0YTY3NDBhZmEzZTcxMDY0MjMKYm9keQl0ZXN0cy9zd2lmdC1leHBlY3QudGVzdC5tanMJU3dpZnQgI2V4cGVjdCBpcyBhIGZhaWx1cmUgY2FsbCBzbyBhbiBleHBlY3Qtb25seSB0ZXN0IGlzIG5vdCBkZWFkCTk3NWE0ZGY3OWNlOGE3ZTBmYjQzZWFkNDQ0ZGI4MGYwMDNjNTJjOTczZWUwNDY1OWRmZTZkZDFhNDZjY2NiMjY
  ```
  --- last 10 line(s) of stdout (of 27 after folding 27 raw)
        at Test.run (node:internal/test_runner/test:1106:25)
        at Test.start (node:internal/test_runner/test:1003:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: false,
      expected: true,
      operator: '==',
      diff: 'simple'
    }
  ```
- 2026-09-15 · bd4daaa* · exit 0 · `node --test --test-name-pattern 'a PHP #expect comment is not a fail word' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs` · acceptance-sha256:03378b1cb4ebb74413279d788f78ae221dfdab888623a4c276db7fdbc184a806 · ms:256
- 2026-09-15 · bd4daaa* · exit 0 · `node --test --test-name-pattern 'a PHP #expect comment is not a fail word' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs` · acceptance-sha256:03378b1cb4ebb74413279d788f78ae221dfdab888623a4c276db7fdbc184a806 · ms:314
- 2026-09-15 · 140d87f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:03378b1cb4ebb74413279d788f78ae221dfdab888623a4c276db7fdbc184a806 · ms:0 · test-lock-sha256:8623d5aa44991ad920512d81e940ce9c8dfb6e2fc7d79ef52f3ddf5c2f3eabdf · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJQy1lc2NhcGluZyBHbyBiYWNrdGlja3MgbGVhdmVzIGxhdGVyIHRlc3RzIFVOUFJPVkVOOyBKUyB0ZW1wbGF0ZXMgc3RpbGwgZXNjYXBlCWFjYTU1OTMxYTMzNDAxMWFlNWI0MzZiZDE2YWFkYjgyZTJiYTgxNmI1MTcyMWY5NGZiNzc2YTQ3ZGIxMmI0MzEKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWEgR28gcmF3IHN0cmluZyBlbmRpbmcgaW4gYmFja3NsYXNoIHN0aWxsIGhhc2hlcyBsYXRlciB0ZXN0cwk0YWJjZmJjMGNlYTAwNTgxOGE0MTNkMTk2ZDNlMzY4NTFkMzZhNDcxNWQ3YzhkOTlhNWZkZThmYWRlNGRhODZmCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlhIFBIUCAjZXhwZWN0IGNvbW1lbnQgaXMgbm90IGEgZmFpbCB3b3JkCTViNzQ4MGI3MzlkOWYyMWNiYzkyMTliNmUwZDI0NWZiZTFmNGQxMTZmZGZmNmNjODczZWU5ODc4YThlMDdiYTAKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWNvbW1hbmQgLXYgaXMgbm90IGEgcHVibGlzaDsgbG91ZCBqb2luZXJzIHN0aWxsIGFkdmlzZQkzNDBjZjIwOTc1NDM4M2Q2NGFjMjZjNWYwZGRkNTJkODkyNDZlYWU0NGE0NjNiMWYyNzVhNGJmMmZhODBhZTJiCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlzdWRvIC1uIGFmdGVyIGEgY2hlY2sgc3RpbGwgc3RyaXBzCTMwZTZiNTM2YjIyM2UwMmVjMDkzMDY3YmNhOTc4NDU3ZjE4N2EzZGE4ODYyNDVmYjcyYTlhYjUyMTg3MWQ5ZjYKYm9keQl0ZXN0cy9zd2lmdC1leHBlY3QudGVzdC5tanMJU3dpZnQgI2V4cGVjdCBpcyBhIGZhaWx1cmUgY2FsbCBzbyBhbiBleHBlY3Qtb25seSB0ZXN0IGlzIG5vdCBkZWFkCTk3NWE0ZGY3OWNlOGE3ZTBmYjQzZWFkNDQ0ZGI4MGYwMDNjNTJjOTczZWUwNDY1OWRmZTZkZDFhNDZjY2NiMjY · test-lock-kind:replace
- 2026-09-15 · 140d87f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:03378b1cb4ebb74413279d788f78ae221dfdab888623a4c276db7fdbc184a806 · ms:0 · test-lock-sha256:a33a76f584f2c3584addd1d64dd8eb6c698787b55220b3ebe9abb091ef39b441 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJQy1lc2NhcGluZyBHbyBiYWNrdGlja3MgbGVhdmVzIGxhdGVyIHRlc3RzIFVOUFJPVkVOOyBKUyB0ZW1wbGF0ZXMgc3RpbGwgZXNjYXBlCWFjYTU1OTMxYTMzNDAxMWFlNWI0MzZiZDE2YWFkYjgyZTJiYTgxNmI1MTcyMWY5NGZiNzc2YTQ3ZGIxMmI0MzEKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWEgR28gcmF3IHN0cmluZyBlbmRpbmcgaW4gYmFja3NsYXNoIHN0aWxsIGhhc2hlcyBsYXRlciB0ZXN0cwk0YWJjZmJjMGNlYTAwNTgxOGE0MTNkMTk2ZDNlMzY4NTFkMzZhNDcxNWQ3YzhkOTlhNWZkZThmYWRlNGRhODZmCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlhIFBIUCAjZXhwZWN0IGNvbW1lbnQgaXMgbm90IGEgZmFpbCB3b3JkCTViNzQ4MGI3MzlkOWYyMWNiYzkyMTliNmUwZDI0NWZiZTFmNGQxMTZmZGZmNmNjODczZWU5ODc4YThlMDdiYTAKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWNvbW1hbmQgLXYgaXMgbm90IGEgcHVibGlzaDsgbG91ZCBqb2luZXJzIHN0aWxsIGFkdmlzZQk2OTkxOWY4YWY4ZWUzYmUyNWEzODI0ZDU5OWUyNTBkOGUzODBjOTRhN2UzMjkwMTc0NjYyNGM4ZGI0MTVjYzc1CmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlzdWRvIC1uIGFmdGVyIGEgY2hlY2sgc3RpbGwgc3RyaXBzCTMwZTZiNTM2YjIyM2UwMmVjMDkzMDY3YmNhOTc4NDU3ZjE4N2EzZGE4ODYyNDVmYjcyYTlhYjUyMTg3MWQ5ZjYKYm9keQl0ZXN0cy9zd2lmdC1leHBlY3QudGVzdC5tanMJU3dpZnQgI2V4cGVjdCBpcyBhIGZhaWx1cmUgY2FsbCBzbyBhbiBleHBlY3Qtb25seSB0ZXN0IGlzIG5vdCBkZWFkCTk3NWE0ZGY3OWNlOGE3ZTBmYjQzZWFkNDQ0ZGI4MGYwMDNjNTJjOTczZWUwNDY1OWRmZTZkZDFhNDZjY2NiMjY · test-lock-kind:replace
- 2026-09-15 · 1606a88* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:03378b1cb4ebb74413279d788f78ae221dfdab888623a4c276db7fdbc184a806 · ms:0 · test-lock-sha256:ac4ffcdb3ed755741feb3242a098a7acd72fcef3385de5b1a63967626f800b77 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJQy1lc2NhcGluZyBHbyBiYWNrdGlja3MgbGVhdmVzIGxhdGVyIHRlc3RzIFVOUFJPVkVOOyBKUyB0ZW1wbGF0ZXMgc3RpbGwgZXNjYXBlCWFjYTU1OTMxYTMzNDAxMWFlNWI0MzZiZDE2YWFkYjgyZTJiYTgxNmI1MTcyMWY5NGZiNzc2YTQ3ZGIxMmI0MzEKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWEgR28gcmF3IHN0cmluZyBlbmRpbmcgaW4gYmFja3NsYXNoIGRvZXMgbm90IGtlZXAgdGhlIGhhc2ggYWZ0ZXIgdGhlIGFzc2VydGlvbiBtb3Zlcwk4NGVmNWU4ZGE5MzgwMzQyYWMxMTg0OGRhMmFkMTM0ZjAwMjVlZTNkZTEzY2QxYmJkMzVjMWQ5ZTc1MDhmZDZlCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlhIEdvIHJhdyBzdHJpbmcgZW5kaW5nIGluIGJhY2tzbGFzaCBzdGlsbCBoYXNoZXMgbGF0ZXIgdGVzdHMJNGFiY2ZiYzBjZWEwMDU4MThhNDEzZDE5NmQzZTM2ODUxZDM2YTQ3MTVkN2M4ZDk5YTVmZGU4ZmFkZTRkYTg2Zgpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJYSBQSFAgI2V4cGVjdCBjb21tZW50IGlzIG5vdCBhIGZhaWwgd29yZAk1Yjc0ODBiNzM5ZDlmMjFjYmM5MjE5YjZlMGQyNDVmYmUxZjRkMTE2ZmRmZjZjYzg3M2VlOTg3OGE4ZTA3YmEwCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlhIG11dGFudCB0aGF0IHJlc3RvcmVzIHRvZGF5J3MgaG9sZXMgc3Vydml2ZXMgb25seSBpZiB0aGUgc3VpdGUgaXMgYmxpbmQJM2E3OWIwODJkZDliZTRhNTM1YTM1YzliNDM1NmVhNjMwZWM1YTZjYzk2OWQ2NWQ5Yjk1Y2ZjMGU1ZjRhNzUwYQpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJY29tbWFuZCAtdiBpcyBub3QgYSBwdWJsaXNoOyBsb3VkIGpvaW5lcnMgc3RpbGwgYWR2aXNlCTc1OGYyZjMyMjQ0MzYzZGVjODY1YmQ3NDAxYTE3MGI4ZmUzZGMwMzk3YzM5YzNiODhiOTY4YmU4YWY5MzEzMGUKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCXN1ZG8gLW4gYWZ0ZXIgYSBjaGVjayBzdGlsbCBzdHJpcHMJMzBlNmI1MzZiMjIzZTAyZWMwOTMwNjdiY2E5Nzg0NTdmMTg3YTNkYTg4NjI0NWZiNzJhOWFiNTIxODcxZDlmNgpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJdW5tdXRhdGVkIGxlZnRvdmVyIHN0cmVzcyBpcyBncmVlbiBhbmQgbGVmdG92ZXIgcG9vbHMgYXJlIGdlbmVyYWJsZQk3MGFlZjYxMmQzNTU0ODM4NzY5ZDU2NDVjZWZjY2EwNmYxYTk1ODU0YWYyMTZmZTEzOGY1MzYxOWE5YzI0OGFiCmJvZHkJdGVzdHMvc3dpZnQtZXhwZWN0LnRlc3QubWpzCVN3aWZ0ICNleHBlY3QgaXMgYSBmYWlsdXJlIGNhbGwgc28gYW4gZXhwZWN0LW9ubHkgdGVzdCBpcyBub3QgZGVhZAk5NzVhNGRmNzljZThhN2UwZmI0M2VhZDQ0NGRiODBmMDAzYzUyYzk3M2VlMDQ2NTlkZmU2ZGQxYTQ2Y2NjYjI2 · test-lock-kind:replace
