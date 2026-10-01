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
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/lib/record.py` · a call head inside a string or comment counts as a registration · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · covers:a call counts only where it is code
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/adr-lint` · the body is bounded on a second masking instead of the whole file lexer view · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · covers:the body is bounded on the whole file's view
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/adr-lint` · a found call whose body cannot be bounded is reported found · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · covers:an unbounded body is unproven
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/adr-lint` · UNPROVEN on a done task is advice, so done stands on a test nobody could read · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · covers:unproven withholds done
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/adr-lint` · UNPROVEN on a frozen archived record blocks as if it were live work · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · covers:history keeps the moved lock's exceptions
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/adr-lint` · an enforcement pointer past the stop is silently taken as resolved · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · covers:enforcement says unproven
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/spec-verify` · a Python or Go file is read with the JavaScript reader · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · covers:no other language sees unproven

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
- 2026-10-01 · 031ffb6* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · ms:1461 · test-lock-sha256:883aab17a6975abf44e95a40f49255af5a6c56eff2dc88e9fd297ef93e6563eb · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlVTlBST1ZFTiBvbiBhIGZyb3plbiByZWNvcmQsIG9yIGJlbG93IHN0cmljdEZyb20sIGlzIGFkdmljZSBhcyBhIG1vdmVkIGxvY2sgaXMJNTJlNWYwMmFmNWQ0YzM2YzQ4NTY1ZGJlZTZmMGExNzMyODZlODMyZmJhMDAwMTViNTFjY2RiYTFmZTY5M2M4Zgpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgZG9lcyBub3QgZmluZCBhIEphdmFTY3JpcHQgdGVzdCB0aGF0IGV4aXN0cyBvbmx5IGluc2lkZSBhIHN0cmluZwk3OTBlNjRhZWQzZmI4YTllYTIyYTY4MDg4NWQ4Y2Y4NzNmZGNhMDQzYmNkZTRiNWQ3MzQyNmYxYjRjZWY2YjRhCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBqdWRnZXMgYSBKYXZhU2NyaXB0IGJvZHkgYW5kIGl0cyBoZWxwZXJzIG9uIHRoZSBjb2RlIHZpZXcJZWRhMTFjMzk4NmY2NGUwMDQwYmU1ZGQ3NTFjMDkzODgxYTRiNmE5ZjQ3ZmQ1MjAwZDI4YzM0ODVlZjRhZGEwZQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgcmVhZHMgYSBKYXZhU2NyaXB0IHRlc3Qgd2hlcmUgaXRzIGNhbGwgaXMgY29kZSwgYm91bmRlZCBhcyB0aGUgbG9jayBib3VuZHMgaXQJMTIzNDhlYTU0NTVlM2I2YzEyODk3MGQ1OTg2M2U5MWRkY2VmYWU4NDZmY2ViOTExNTEyNWQ4YTZmZDU2MDNmOQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSBKYXZhU2NyaXB0IHRlc3Qgd2hvc2UgYm9keSBpdCBjYW5ub3QgYm91bmQJNDQ1ZTM1MzdkOTIzZWMwNTVlNDBhM2Q2ZTNiNmExZTA4NmQxNzFlNDlhNGFiZWNmNDY4NjMyNTYyNjkwMDdhNQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiwgYW5kIHdpdGhob2xkcyBkb25lLCBmb3IgYSBKYXZhU2NyaXB0IHRlc3QgaXQgY291bGQgbm90IHJlYWQgdG8JYWFhNmE0ODIyMjVjODNjMTZhOWQwMTVkNTE5NTU3MzIxNGJlNDMwOWVmOTQzMjBhNzkxMzE4MmE4NzVlNGIzZQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYW4gZW5mb3JjZW1lbnQgcG9pbnRlciB0byBhIEphdmFTY3JpcHQgdGVzdCBpcyByZXNvbHZlZCBvbiB0aGUgbGV4ZXIJY2QwMzkwMDRkOGMzZmUwYmEzZTU5YTA4NzExZmUxZDM1MWM3YzBkMjdhZjE0OGZlZDAyM2ZhOWI0MmNmZGI5Ngpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJc3BlYy12ZXJpZnkgZmluZHMgYSBKYXZhU2NyaXB0IHRlc3Qgb25seSB3aGVyZSBpdHMgcmVnaXN0cmF0aW9uIGlzIGNvZGUsIGluIGV2ZXJ5IGZhbWlseSBzdWZmaXgJMGNkMTgwOTZkNjg4NzVkMWZkNmY0ZWI0MWIyZTBhNjcyMGI3ZTUzNWFjODE1YzliYzFlMmFlNzljMWYxNmQ4OApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJc3BlYy12ZXJpZnkgbWF0Y2hlcyBhIGRlY29kZWQgdGl0bGUsIGFuZCBuZXZlciBhIHN1YnN0cmluZwk1OWFiZDU4MzdjZWQ1NzRjYWIyNTJmMTIwYzU4ZmUxYWM0NGY5MTg2ZmNiOTc1ZWFjOGE0NTIwZWRkNTBkMGM5CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlzcGVjLXZlcmlmeSBzYXlzIGNvdWxkLW5vdC1jaGVjaywgZXhpdCA0LCBmb3IgYSBKYXZhU2NyaXB0IHRlc3QgaXQgY291bGQgbm90IHJlYWQgdG8JZGM5MzI4MzY5MDExYTY0NjdjMTZkZTQxMzJmNjIzZWU0MDhmNWUzNzE1N2RjYTNlYjgzMDI1ZGY1NGI1MzA2ZApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJdGhlIG90aGVyIGxhbmd1YWdlcyByZWFkIGFzIHRoZXkgZGlkCTYwNWU3MTgwZWQzOTdlOTlkODU3OTA1Y2JhNzQyYTNlYTlmZjA5OGVkZTUzNzJhMzU3ZWVjYzUwNjM5YjNiOWI
  ```
  ```
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · ms:2582
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · ms:2485
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · ms:2510
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · ms:2533
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · ms:2576
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · ms:2514
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:567d1b29f5f1b0286be12a30fd823154bfb93a8d8c94fb58f8f6f8eee390d961 · ms:2489
