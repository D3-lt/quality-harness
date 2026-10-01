# Task ADR-079-T3: adr-lint judges a JavaScript body and its helpers on the code view

**Depends-on:** T2
**Covers:** F-8, UC2-S4
**Estimated scope:** S (the can-fail branch and its helper follow, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** `js_test_body` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `can-fail reads the whole file's code view`, `a helper is followed on the same view`, `an unbounded body is said in can-fail`

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
2. [S2] Add `js_body_can_fail`: `FAIL_CALLS` over the body's span of the whole file's masked view, then over the span of each same-file helper the body calls, bounded the same way; unproven as in T2. A found call whose body cannot be bounded is said UNPROVEN here and never skipped: since T2 the existence check accepts a spaced title on its call alone (`it('x', helper)` exists), and until this step the can-fail branch skips any status but `found`, so this check is the only place that body's UNPROVEN is said.
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
| `adr-lint says UNPROVEN for a spaced JavaScript title it found but whose body it cannot bound` | `tests/js-reading.test.mjs` | the CLI: blocking when done, advice when pending; a bounded twin silent | F-7 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | the can-fail check for JavaScript-family files |
| 3 — the caller can discover it | the asserts-nothing finding |
| 4 — it is used | every `adr-lint` over a done task naming a JavaScript test |

## Mutation Log
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/adr-lint` · can-fail reads the raw body, so a regex literal spelling assert reads as an assertion · acceptance-sha256:af11e4e9cc90f862e6ae61ac51a4fb728281639823e9f9993b9594a80ae9dc6d · covers:can-fail reads the whole file's code view
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/adr-lint` · a same-file helper that asserts is not followed · acceptance-sha256:af11e4e9cc90f862e6ae61ac51a4fb728281639823e9f9993b9594a80ae9dc6d · covers:a helper is followed on the same view
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/adr-lint` · a spaced title found with an unbounded body is skipped in silence · acceptance-sha256:af11e4e9cc90f862e6ae61ac51a4fb728281639823e9f9993b9594a80ae9dc6d · covers:an unbounded body is said in can-fail

## Invariants

- Other languages' can-fail reading is unchanged.

## Risks

- None beyond T2's.

## Stop Condition

Stop and ask if a helper's span cannot be taken from the whole file.

## Out of Scope

- The corpus bar — T4.

## Verification Log
- 2026-10-01 · 031ffb6* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:af11e4e9cc90f862e6ae61ac51a4fb728281639823e9f9993b9594a80ae9dc6d · ms:2133 · test-lock-sha256:883aab17a6975abf44e95a40f49255af5a6c56eff2dc88e9fd297ef93e6563eb · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlVTlBST1ZFTiBvbiBhIGZyb3plbiByZWNvcmQsIG9yIGJlbG93IHN0cmljdEZyb20sIGlzIGFkdmljZSBhcyBhIG1vdmVkIGxvY2sgaXMJNTJlNWYwMmFmNWQ0YzM2YzQ4NTY1ZGJlZTZmMGExNzMyODZlODMyZmJhMDAwMTViNTFjY2RiYTFmZTY5M2M4Zgpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgZG9lcyBub3QgZmluZCBhIEphdmFTY3JpcHQgdGVzdCB0aGF0IGV4aXN0cyBvbmx5IGluc2lkZSBhIHN0cmluZwk3OTBlNjRhZWQzZmI4YTllYTIyYTY4MDg4NWQ4Y2Y4NzNmZGNhMDQzYmNkZTRiNWQ3MzQyNmYxYjRjZWY2YjRhCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBqdWRnZXMgYSBKYXZhU2NyaXB0IGJvZHkgYW5kIGl0cyBoZWxwZXJzIG9uIHRoZSBjb2RlIHZpZXcJZWRhMTFjMzk4NmY2NGUwMDQwYmU1ZGQ3NTFjMDkzODgxYTRiNmE5ZjQ3ZmQ1MjAwZDI4YzM0ODVlZjRhZGEwZQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgcmVhZHMgYSBKYXZhU2NyaXB0IHRlc3Qgd2hlcmUgaXRzIGNhbGwgaXMgY29kZSwgYm91bmRlZCBhcyB0aGUgbG9jayBib3VuZHMgaXQJMTIzNDhlYTU0NTVlM2I2YzEyODk3MGQ1OTg2M2U5MWRkY2VmYWU4NDZmY2ViOTExNTEyNWQ4YTZmZDU2MDNmOQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSBKYXZhU2NyaXB0IHRlc3Qgd2hvc2UgYm9keSBpdCBjYW5ub3QgYm91bmQJNDQ1ZTM1MzdkOTIzZWMwNTVlNDBhM2Q2ZTNiNmExZTA4NmQxNzFlNDlhNGFiZWNmNDY4NjMyNTYyNjkwMDdhNQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiwgYW5kIHdpdGhob2xkcyBkb25lLCBmb3IgYSBKYXZhU2NyaXB0IHRlc3QgaXQgY291bGQgbm90IHJlYWQgdG8JYWFhNmE0ODIyMjVjODNjMTZhOWQwMTVkNTE5NTU3MzIxNGJlNDMwOWVmOTQzMjBhNzkxMzE4MmE4NzVlNGIzZQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYW4gZW5mb3JjZW1lbnQgcG9pbnRlciB0byBhIEphdmFTY3JpcHQgdGVzdCBpcyByZXNvbHZlZCBvbiB0aGUgbGV4ZXIJY2QwMzkwMDRkOGMzZmUwYmEzZTU5YTA4NzExZmUxZDM1MWM3YzBkMjdhZjE0OGZlZDAyM2ZhOWI0MmNmZGI5Ngpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJc3BlYy12ZXJpZnkgZmluZHMgYSBKYXZhU2NyaXB0IHRlc3Qgb25seSB3aGVyZSBpdHMgcmVnaXN0cmF0aW9uIGlzIGNvZGUsIGluIGV2ZXJ5IGZhbWlseSBzdWZmaXgJMGNkMTgwOTZkNjg4NzVkMWZkNmY0ZWI0MWIyZTBhNjcyMGI3ZTUzNWFjODE1YzliYzFlMmFlNzljMWYxNmQ4OApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJc3BlYy12ZXJpZnkgbWF0Y2hlcyBhIGRlY29kZWQgdGl0bGUsIGFuZCBuZXZlciBhIHN1YnN0cmluZwk1OWFiZDU4MzdjZWQ1NzRjYWIyNTJmMTIwYzU4ZmUxYWM0NGY5MTg2ZmNiOTc1ZWFjOGE0NTIwZWRkNTBkMGM5CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlzcGVjLXZlcmlmeSBzYXlzIGNvdWxkLW5vdC1jaGVjaywgZXhpdCA0LCBmb3IgYSBKYXZhU2NyaXB0IHRlc3QgaXQgY291bGQgbm90IHJlYWQgdG8JZGM5MzI4MzY5MDExYTY0NjdjMTZkZTQxMzJmNjIzZWU0MDhmNWUzNzE1N2RjYTNlYjgzMDI1ZGY1NGI1MzA2ZApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJdGhlIG90aGVyIGxhbmd1YWdlcyByZWFkIGFzIHRoZXkgZGlkCTYwNWU3MTgwZWQzOTdlOTlkODU3OTA1Y2JhNzQyYTNlYTlmZjA5OGVkZTUzNzJhMzU3ZWVjYzUwNjM5YjNiOWI
  ```
  ```
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:af11e4e9cc90f862e6ae61ac51a4fb728281639823e9f9993b9594a80ae9dc6d · ms:2809
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:af11e4e9cc90f862e6ae61ac51a4fb728281639823e9f9993b9594a80ae9dc6d · ms:2796
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:af11e4e9cc90f862e6ae61ac51a4fb728281639823e9f9993b9594a80ae9dc6d · ms:3280
