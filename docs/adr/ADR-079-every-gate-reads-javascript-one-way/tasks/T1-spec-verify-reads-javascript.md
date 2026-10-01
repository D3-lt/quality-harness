# Task ADR-079-T1: One JavaScript reader, and spec-verify reads with it

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, UC1-S1, UC1-S2, UC1-S3
**Estimated scope:** M (the shared reader, spec-verify's existence check and its exit-4 plumbing, three tests)
**Owner:** unassigned
**Produces:** `js_test_lookup` and `JS_FAMILY_SUFFIXES` in `plugin/lib/record.py`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a registration counts only where it is code`, `not found past the stop is could-not-check`, `one family suffix set`

## Goal

`record.py` gains `JS_FAMILY_SUFFIXES` and `js_test_lookup`. `spec-verify` reads a JavaScript-family file with the lexer and exits 4 for a bound test it could not read to (ADR-079 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `JS_FAMILY_SUFFIXES`; `js_test_lookup(text, name, ts)` answering found / missing / unproven, with the masked view and the call offset |
| `plugin/bin/spec-verify` | edit | `test_definition_exists` reads the masked view and answers `None` for unproven; the three suffix tuples use the shared set; `test_exists` and `check_spec` carry `None` to the exit-4 class |
| `tests/js-reading.test.mjs` | edit | remove `todo` from this task's three tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the three tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Add `JS_FAMILY_SUFFIXES` and `js_test_lookup` to `record.py`: `_js_lex` once, call heads only at code offsets, titles decoded with `_parse_bdd_string`, and `unproven` only when not found and `stop` is before the end.
3. [S3] In `spec-verify`, read a JavaScript-family file's masked view for `registered_test_names`, answer `None` for unproven, and replace the three suffix tuples with the shared set.
4. [S4] Carry `None` from `test_exists` to `check_spec`'s exit-4 class, named "could not check".
5. [S5] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
T=$(mktemp)
node --test --test-reporter=tap tests/js-reading.test.mjs > "$T" 2>&1 \
  && for t in 'spec-verify finds a JavaScript test only where its registration is code, in every family suffix' 'spec-verify says could-not-check, exit 4, for a JavaScript test it could not read to' 'spec-verify matches a decoded title, and never a substring'; do test "$(grep -cxE "ok [0-9]+ - $t" "$T")" -eq 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `spec-verify finds a JavaScript test only where its registration is code, in every family suffix` | `tests/js-reading.test.mjs` | string-held missing; `.mjs`, `.mts`, `.cts` read | F-1, F-2, UC1-S1 | S2, S3 |
| `spec-verify says could-not-check, exit 4, for a JavaScript test it could not read to` | `tests/js-reading.test.mjs` | `None`; CLI exit 4; a test before the stop found | F-3, UC1-S2 | S2, S4 |
| `spec-verify matches a decoded title, and never a substring` | `tests/js-reading.test.mjs` | held: decoded title found, `ghost` missing | F-4, UC1-S3 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `test_definition_exists` for every JavaScript-family binding |
| 3 — the caller can discover it | the could-not-check line and exit 4 |
| 4 — it is used | every `spec-verify --spec` over a spec bound to JavaScript tests |

## Mutation Log
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/spec-verify` · a registration read on raw text counts a test() held in a string literal · acceptance-sha256:322eec611ebda3272e4fc43888be37f9d5a4e3c95d88a1d42424a8cd95896aac · covers:a registration counts only where it is code
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/bin/spec-verify` · a name not found past the lexer stop is reported missing instead of could-not-check · acceptance-sha256:322eec611ebda3272e4fc43888be37f9d5a4e3c95d88a1d42424a8cd95896aac · covers:not found past the stop is could-not-check
- 2026-10-01 · 031ffb6* · mutant killed · exit 1 · `plugin/lib/record.py` · a family suffix left out of the one set is not read as JavaScript · acceptance-sha256:322eec611ebda3272e4fc43888be37f9d5a4e3c95d88a1d42424a8cd95896aac · covers:one family suffix set

## Invariants

- Other languages' existence answers are unchanged.
- No lock or hasher changes.

## Risks

- The exit-4 class gains a second meaning beside "unrun"; its message names which.

## Stop Condition

Stop and ask if a verdict on this corpus changes in T4's diff before T4 runs.

## Out of Scope

- adr-lint — T2 and T3.

## Verification Log
- 2026-10-01 · 031ffb6* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:322eec611ebda3272e4fc43888be37f9d5a4e3c95d88a1d42424a8cd95896aac · ms:1196 · test-lock-sha256:883aab17a6975abf44e95a40f49255af5a6c56eff2dc88e9fd297ef93e6563eb · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlVTlBST1ZFTiBvbiBhIGZyb3plbiByZWNvcmQsIG9yIGJlbG93IHN0cmljdEZyb20sIGlzIGFkdmljZSBhcyBhIG1vdmVkIGxvY2sgaXMJNTJlNWYwMmFmNWQ0YzM2YzQ4NTY1ZGJlZTZmMGExNzMyODZlODMyZmJhMDAwMTViNTFjY2RiYTFmZTY5M2M4Zgpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgZG9lcyBub3QgZmluZCBhIEphdmFTY3JpcHQgdGVzdCB0aGF0IGV4aXN0cyBvbmx5IGluc2lkZSBhIHN0cmluZwk3OTBlNjRhZWQzZmI4YTllYTIyYTY4MDg4NWQ4Y2Y4NzNmZGNhMDQzYmNkZTRiNWQ3MzQyNmYxYjRjZWY2YjRhCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBqdWRnZXMgYSBKYXZhU2NyaXB0IGJvZHkgYW5kIGl0cyBoZWxwZXJzIG9uIHRoZSBjb2RlIHZpZXcJZWRhMTFjMzk4NmY2NGUwMDQwYmU1ZGQ3NTFjMDkzODgxYTRiNmE5ZjQ3ZmQ1MjAwZDI4YzM0ODVlZjRhZGEwZQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgcmVhZHMgYSBKYXZhU2NyaXB0IHRlc3Qgd2hlcmUgaXRzIGNhbGwgaXMgY29kZSwgYm91bmRlZCBhcyB0aGUgbG9jayBib3VuZHMgaXQJMTIzNDhlYTU0NTVlM2I2YzEyODk3MGQ1OTg2M2U5MWRkY2VmYWU4NDZmY2ViOTExNTEyNWQ4YTZmZDU2MDNmOQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSBKYXZhU2NyaXB0IHRlc3Qgd2hvc2UgYm9keSBpdCBjYW5ub3QgYm91bmQJNDQ1ZTM1MzdkOTIzZWMwNTVlNDBhM2Q2ZTNiNmExZTA4NmQxNzFlNDlhNGFiZWNmNDY4NjMyNTYyNjkwMDdhNQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiwgYW5kIHdpdGhob2xkcyBkb25lLCBmb3IgYSBKYXZhU2NyaXB0IHRlc3QgaXQgY291bGQgbm90IHJlYWQgdG8JYWFhNmE0ODIyMjVjODNjMTZhOWQwMTVkNTE5NTU3MzIxNGJlNDMwOWVmOTQzMjBhNzkxMzE4MmE4NzVlNGIzZQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYW4gZW5mb3JjZW1lbnQgcG9pbnRlciB0byBhIEphdmFTY3JpcHQgdGVzdCBpcyByZXNvbHZlZCBvbiB0aGUgbGV4ZXIJY2QwMzkwMDRkOGMzZmUwYmEzZTU5YTA4NzExZmUxZDM1MWM3YzBkMjdhZjE0OGZlZDAyM2ZhOWI0MmNmZGI5Ngpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJc3BlYy12ZXJpZnkgZmluZHMgYSBKYXZhU2NyaXB0IHRlc3Qgb25seSB3aGVyZSBpdHMgcmVnaXN0cmF0aW9uIGlzIGNvZGUsIGluIGV2ZXJ5IGZhbWlseSBzdWZmaXgJMGNkMTgwOTZkNjg4NzVkMWZkNmY0ZWI0MWIyZTBhNjcyMGI3ZTUzNWFjODE1YzliYzFlMmFlNzljMWYxNmQ4OApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJc3BlYy12ZXJpZnkgbWF0Y2hlcyBhIGRlY29kZWQgdGl0bGUsIGFuZCBuZXZlciBhIHN1YnN0cmluZwk1OWFiZDU4MzdjZWQ1NzRjYWIyNTJmMTIwYzU4ZmUxYWM0NGY5MTg2ZmNiOTc1ZWFjOGE0NTIwZWRkNTBkMGM5CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlzcGVjLXZlcmlmeSBzYXlzIGNvdWxkLW5vdC1jaGVjaywgZXhpdCA0LCBmb3IgYSBKYXZhU2NyaXB0IHRlc3QgaXQgY291bGQgbm90IHJlYWQgdG8JZGM5MzI4MzY5MDExYTY0NjdjMTZkZTQxMzJmNjIzZWU0MDhmNWUzNzE1N2RjYTNlYjgzMDI1ZGY1NGI1MzA2ZApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJdGhlIG90aGVyIGxhbmd1YWdlcyByZWFkIGFzIHRoZXkgZGlkCTYwNWU3MTgwZWQzOTdlOTlkODU3OTA1Y2JhNzQyYTNlYTlmZjA5OGVkZTUzNzJhMzU3ZWVjYzUwNjM5YjNiOWI
  ```
  ```
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:322eec611ebda3272e4fc43888be37f9d5a4e3c95d88a1d42424a8cd95896aac · ms:1778
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:322eec611ebda3272e4fc43888be37f9d5a4e3c95d88a1d42424a8cd95896aac · ms:1785
- 2026-10-01 · 031ffb6* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:322eec611ebda3272e4fc43888be37f9d5a4e3c95d88a1d42424a8cd95896aac · ms:1780
