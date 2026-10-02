# Task ADR-083-T3: The gates read JSX, and the stop-gap is gone

**Depends-on:** T1
**Covers:** F-6, UC2-S3
**Estimated scope:** M (deletions across three files, tests rewritten, catalogue entries removed)
**Owner:** unassigned
**Produces:** none
**Consumes:** `_js_lex(…, jsx=)` and `JSX_SUFFIXES` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the gates read through JSX`, `a never-written name past JSX is missing`, `the stop-gap is gone`, `§337 is closed`

## Goal

`spec-verify` and `adr-lint` find a test past a JSX tag and miss a never-written one through the lexer alone, and 3.7.2's JSX stop-gap is gone, with its tests and catalogue entries (ADR-083 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | delete `js_stop_at_jsx`, `_JS_RAW_TITLE`, `js_raw_titles` |
| `plugin/bin/adr-lint` | edit | delete `jsx_stopped` and `unproven_test`'s JSX branch; `unproven_test` back to `(errors, inf, tid, name, rel, done, frozen)`, its three callers back to calling it and `continue`; drop the two imports |
| `plugin/bin/spec-verify` | edit | delete the JSX branch of `test_definition_exists`, the `"advise"` arm of `check_spec`, and the imports |
| `tests/js-reading.test.mjs` | edit | remove `todo` from this task's test; delete the three tests of the stop-gap's advice, which assert the behaviour this retires |
| `tests/mutations.json` | edit | delete every `§337:` entry whose code is gone; one entry per Rests-on name |
| `docs/BACKLOG.md` | edit | §337 closed with this record |

## Ordered Steps

1. [S1] Remove `todo` from the test in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Delete the stop-gap in `record.py`, `adr-lint` and `spec-verify`, and restore `unproven_test`'s ADR-079 signature and callers.
3. [S3] Delete the three tests of the JSX advice in tests/js-reading.test.mjs (unlocked, per `scripts/test-locks.py`), and every `§337:` catalogue entry whose `from` is gone. `mutate.mjs --stale` reads 0. [proof: acceptance]
4. [S4] Close BACKLOG §337 naming this record. Each residual closes with the T1 test that reads it. [proof: acceptance]
5. [S5] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
T=$(mktemp)
node --test --test-reporter=tap tests/js-reading.test.mjs > "$T" 2>&1 \
  && test "$(grep -cxE 'ok [0-9]+ - a test past a JSX tag is found by both gates, and a never-written one is missing' "$T")" -eq 1 \
  && ! git grep -q -E 'js_stop_at_jsx|js_raw_titles|_JS_RAW_TITLE|jsx_stopped|"advise"' -- plugin \
  && grep -q '^## 337\. CLOSED' docs/BACKLOG.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a test past a JSX tag is found by both gates, and a never-written one is missing` | `tests/js-reading.test.mjs` | found and silent; missing blocks; no JSX advice; spec-verify likewise | F-6, UC2-S3 | S2 |
| `past JSX, a stop the lexer still cannot read refuses, and comments read as comments` | `tests/js-reading.test.mjs` | a non-JSX stop and a tag in plain `.ts` refuse; a comment hides nothing; a commented-out call is not a test | F-6 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `js_reading`, which both gates call |
| 3 — the caller can discover it | the verdict on a React corpus |
| 4 — it is used | every `spec-verify` and `adr-lint` over a JSX file |

## Mutation Log
- 2026-10-02 · c454442* · mutant killed · exit 1 · `plugin/lib/record.py` · the gates read a JSX file without JSX · acceptance-sha256:7e55eec48c576cbe313eb7dc472da1c5919e7d6d216a562e29899f77dc3ef9dd · covers:the gates read through JSX
- 2026-10-02 · c454442* · mutant killed · exit 1 · `plugin/lib/record.py` · a never-written name in a file read to its end is UNPROVEN, not missing · acceptance-sha256:7e55eec48c576cbe313eb7dc472da1c5919e7d6d216a562e29899f77dc3ef9dd · covers:a never-written name past JSX is missing
- 2026-10-02 · c454442* · mutant killed · exit 1 · `plugin/bin/spec-verify` · a stop-gap name is back in the shipped gates · acceptance-sha256:7e55eec48c576cbe313eb7dc472da1c5919e7d6d216a562e29899f77dc3ef9dd · covers:the stop-gap is gone
- 2026-10-02 · c454442* · mutant killed · exit 1 · `plugin/lib/record.py` · the gates read a JSX file without JSX · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · covers:the gates read through JSX
- 2026-10-02 · c454442* · mutant killed · exit 1 · `plugin/lib/record.py` · a never-written name in a file read to its end is UNPROVEN, not missing · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · covers:a never-written name past JSX is missing
- 2026-10-02 · c454442* · mutant killed · exit 1 · `plugin/bin/spec-verify` · a stop-gap name is back in the shipped gates · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · covers:the stop-gap is gone
- 2026-10-02 · c454442* · mutant killed · exit 1 · `docs/BACKLOG.md` · the entry the record retires still reads open · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · covers:§337 is closed

## Invariants

- ADR-079's UNPROVEN for a non-JSX stop is unchanged.

## Risks

- A stop the lexer still makes inside JSX now blocks again, as any UNPROVEN does: T1's coverage of the corpora's shapes and the outside runs hold it.

## Stop Condition

Stop and ask if a stop-gap test is locked.

## Out of Scope

- The lock — T2.

## Verification Log
- 2026-10-02 · c454442* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:7e55eec48c576cbe313eb7dc472da1c5919e7d6d216a562e29899f77dc3ef9dd · ms:5176 · test-lock-sha256:abd5a0d7e2de444a8af832228020e645858603c85b8099c118f1495de89952bd · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlVTlBST1ZFTiBvbiBhIGZyb3plbiByZWNvcmQsIG9yIGJlbG93IHN0cmljdEZyb20sIGlzIGFkdmljZSBhcyBhIG1vdmVkIGxvY2sgaXMJNTJlNWYwMmFmNWQ0YzM2YzQ4NTY1ZGJlZTZmMGExNzMyODZlODMyZmJhMDAwMTViNTFjY2RiYTFmZTY5M2M4Zgpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYSB0ZXN0IHBhc3QgYSBKU1ggdGFnIGlzIGZvdW5kIGJ5IGJvdGggZ2F0ZXMsIGFuZCBhIG5ldmVyLXdyaXR0ZW4gb25lIGlzIG1pc3NpbmcJOWU0M2IzYmY2NTY1YTdkYWFlYWU4OWQ3MmRiNzNiNGQ2Y2M2OThlYmM0NTQyZTY0OWUwZmFlYTRmNWNhMWVjZApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYSB0ZXN0IHBhc3QgYSBKU1ggdGFnIHRoZSBsZXhlciBjYW5ub3QgcmVhZCB5ZXQgaXMgYWR2aWNlLCBuZXZlciBhIHJlZnVzYWwJZjhkZmUwYmU2ODFlN2YwNzhmOTFhZGUwY2MwNjdlYWY4NjEzNmViMGVjYWVjNDg4ZjY1YzhhNzJlZGY0N2I3OApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgZG9lcyBub3QgZmluZCBhIEphdmFTY3JpcHQgdGVzdCB0aGF0IGV4aXN0cyBvbmx5IGluc2lkZSBhIHN0cmluZwk3OTBlNjRhZWQzZmI4YTllYTIyYTY4MDg4NWQ4Y2Y4NzNmZGNhMDQzYmNkZTRiNWQ3MzQyNmYxYjRjZWY2YjRhCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBmaW5kcyBhIEphdmFTY3JpcHQgdGVzdCB3aXRoIGEgY29tbWVudCBiZXNpZGUgaXRzIHRpdGxlLCBhbmQgbmV2ZXIgb25lIGluc2lkZSBhIGNvbW1lbnQJMmYxNmY1YTRkNThmMWM2YTM5OGVkZmZjNzg2ZDVlZjYxMWFjYWQ1YzRjNWViOTJkZDQxMTA4ZDVlNTBkMzY1Nwpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgZm9sbG93cyBhIGhlbHBlciBvbmx5IGludG8gaXRzIG93biBmdW5jdGlvbgk4MWFmMzYzNDJkODZiMmZmOTQyZGRkYzc4Yjc5NjhhOTk3NTJjN2E2YzgzNWVmNDVmMGIxMjcxNzM2ODY5OWYzCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBqdWRnZXMgYSBKYXZhU2NyaXB0IGJvZHkgYW5kIGl0cyBoZWxwZXJzIG9uIHRoZSBjb2RlIHZpZXcJZWRhMTFjMzk4NmY2NGUwMDQwYmU1ZGQ3NTFjMDkzODgxYTRiNmE5ZjQ3ZmQ1MjAwZDI4YzM0ODVlZjRhZGEwZQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgcmVhZHMgYSBKYXZhU2NyaXB0IHRlc3Qgd2hlcmUgaXRzIGNhbGwgaXMgY29kZSwgYm91bmRlZCBhcyB0aGUgbG9jayBib3VuZHMgaXQJMTIzNDhlYTU0NTVlM2I2YzEyODk3MGQ1OTg2M2U5MWRkY2VmYWU4NDZmY2ViOTExNTEyNWQ4YTZmZDU2MDNmOQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSBKYXZhU2NyaXB0IHRlc3Qgd2hvc2UgYm9keSBpdCBjYW5ub3QgYm91bmQJNDQ1ZTM1MzdkOTIzZWMwNTVlNDBhM2Q2ZTNiNmExZTA4NmQxNzFlNDlhNGFiZWNmNDY4NjMyNTYyNjkwMDdhNQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSBzcGFjZWQgSmF2YVNjcmlwdCB0aXRsZSBpdCBmb3VuZCBidXQgd2hvc2UgYm9keSBpdCBjYW5ub3QgYm91bmQJNjEyNWJhNzFlYTQ3Yjk0Mzc3NGUxMTdjMmJjMGVkMzY4NjMwY2MzZmJjM2Y5ZmUwZGRjN2UyMTI1MjJiNmJlYQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSB0ZXN0IG5hbWVkIGJ5IGl0cyBvd24gZmlsZSB3aG9zZSBib2R5IGl0IGNhbm5vdCBib3VuZAk5NDk4Njk5YmZkOTQxZDFlOTZhODgyM2U2ZDZlNjMwZDBkNzM1ZGI1MjRhNGI2OGJhZmRjMGU2NGQ3MWQ5ZTBkCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBzYXlzIFVOUFJPVkVOLCBhbmQgd2l0aGhvbGRzIGRvbmUsIGZvciBhIEphdmFTY3JpcHQgdGVzdCBpdCBjb3VsZCBub3QgcmVhZCB0bwlhYWE2YTQ4MjIyNWM4M2MxNmE5ZDAxNWQ1MTk1NTczMjE0YmU0MzA5ZWY5NDMyMGE3OTEzMTgyYTg3NWU0YjNlCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhbiBlbmZvcmNlbWVudCBwb2ludGVyIHRvIGEgSmF2YVNjcmlwdCB0ZXN0IGlzIHJlc29sdmVkIG9uIHRoZSBsZXhlcgljZDAzOTAwNGQ4YzNmZTBiYTNlNTlhMDg3MTFmZTFkMzUxYzdjMGQyN2FmMTQ4ZmVkMDIzZmE5YjQyY2ZkYjk2CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlwYXN0IGEgSlNYIHRhZywgYSBjb21tZW50IGlzIG5vdCBhIHRlc3QgYW5kIGRvZXMgbm90IGhpZGUgb25lCTJlMWFkMWVlNzFlOWJiYjBmYTgwNTBmZWY1ZGFmNzRkM2JmYzMxMzMwYjgzMzczNmYwOGM5Njc0NzhmYjk0NDcKYm9keQl0ZXN0cy9qcy1yZWFkaW5nLnRlc3QubWpzCXBhc3QgYSBKU1ggdGFnLCBhIHRlc3Qgbm8gcmVhZGluZyBmaW5kcyBpcyBzdGlsbCBtaXNzaW5nCTFlOWJhNDY1YmRhMmE2MjUyNTM5ZjgzN2ExMTU0MDljODc0Zjc5MjRmNTc3OTc5NDk2OGEzMGUzZmNlZGIwN2IKYm9keQl0ZXN0cy9qcy1yZWFkaW5nLnRlc3QubWpzCXNwZWMtdmVyaWZ5IGZpbmRzIGEgSmF2YVNjcmlwdCB0ZXN0IG9ubHkgd2hlcmUgaXRzIHJlZ2lzdHJhdGlvbiBpcyBjb2RlLCBpbiBldmVyeSBmYW1pbHkgc3VmZml4CTBjZDE4MDk2ZDY4ODc1ZDFmZDZmNGViNDFiMmUwYTY3MjBiN2U1MzVhYzgxNWM5YmMxZTJhZTc5YzFmMTZkODgKYm9keQl0ZXN0cy9qcy1yZWFkaW5nLnRlc3QubWpzCXNwZWMtdmVyaWZ5IG1hdGNoZXMgYSBkZWNvZGVkIHRpdGxlLCBhbmQgbmV2ZXIgYSBzdWJzdHJpbmcJNTlhYmQ1ODM3Y2VkNTc0Y2FiMjUyZjEyMGM1OGZlMWFjNDRmOTE4NmZjYjk3NWVhYzhhNDUyMGVkZDUwZDBjOQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJc3BlYy12ZXJpZnkgc2F5cyBjb3VsZC1ub3QtY2hlY2ssIGV4aXQgNCwgZm9yIGEgSmF2YVNjcmlwdCB0ZXN0IGl0IGNvdWxkIG5vdCByZWFkIHRvCWRjOTMyODM2OTAxMWE2NDY3YzE2ZGU0MTMyZjYyM2VlNDA4ZjVlMzcxNTdkY2EzZWI4MzAyNWRmNTRiNTMwNmQKYm9keQl0ZXN0cy9qcy1yZWFkaW5nLnRlc3QubWpzCXRoZSBvdGhlciBsYW5ndWFnZXMgcmVhZCBhcyB0aGV5IGRpZAk2MDVlNzE4MGVkMzk3ZTk5ZDg1NzkwNWNiYTc0MmEzZWE5ZmYwOThlZGU1MzcyYTM1N2VlY2M1MDYzOWIzYjli
  ```
  ```
- 2026-10-02 · c454442* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:7e55eec48c576cbe313eb7dc472da1c5919e7d6d216a562e29899f77dc3ef9dd · ms:5296
- 2026-10-02 · c454442* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:7e55eec48c576cbe313eb7dc472da1c5919e7d6d216a562e29899f77dc3ef9dd · ms:6256
- 2026-10-02 · c454442* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:7e55eec48c576cbe313eb7dc472da1c5919e7d6d216a562e29899f77dc3ef9dd · ms:5461
- 2026-10-02 · c454442* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · ms:4226
  ```
  ```
- 2026-10-02 · c454442* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · ms:6124
- 2026-10-02 · c454442* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · ms:5821
- 2026-10-02 · c454442* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · ms:5831
- 2026-10-02 · c454442* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · ms:5810
- 2026-10-02 · c454442* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:3fd36576d2c40ce92ecd12bbd70fb9611fcbbcde682bd99947459112c50d5950 · ms:0 · test-lock-sha256:25bd98da01b5b76f52a7e56e0172f056e46825f2e1baa864d017aa996d2b3906 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlVTlBST1ZFTiBvbiBhIGZyb3plbiByZWNvcmQsIG9yIGJlbG93IHN0cmljdEZyb20sIGlzIGFkdmljZSBhcyBhIG1vdmVkIGxvY2sgaXMJNTJlNWYwMmFmNWQ0YzM2YzQ4NTY1ZGJlZTZmMGExNzMyODZlODMyZmJhMDAwMTViNTFjY2RiYTFmZTY5M2M4Zgpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYSB0ZXN0IHBhc3QgYSBKU1ggdGFnIGlzIGZvdW5kIGJ5IGJvdGggZ2F0ZXMsIGFuZCBhIG5ldmVyLXdyaXR0ZW4gb25lIGlzIG1pc3NpbmcJOWU0M2IzYmY2NTY1YTdkYWFlYWU4OWQ3MmRiNzNiNGQ2Y2M2OThlYmM0NTQyZTY0OWUwZmFlYTRmNWNhMWVjZApib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgZG9lcyBub3QgZmluZCBhIEphdmFTY3JpcHQgdGVzdCB0aGF0IGV4aXN0cyBvbmx5IGluc2lkZSBhIHN0cmluZwk3OTBlNjRhZWQzZmI4YTllYTIyYTY4MDg4NWQ4Y2Y4NzNmZGNhMDQzYmNkZTRiNWQ3MzQyNmYxYjRjZWY2YjRhCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBmaW5kcyBhIEphdmFTY3JpcHQgdGVzdCB3aXRoIGEgY29tbWVudCBiZXNpZGUgaXRzIHRpdGxlLCBhbmQgbmV2ZXIgb25lIGluc2lkZSBhIGNvbW1lbnQJMmYxNmY1YTRkNThmMWM2YTM5OGVkZmZjNzg2ZDVlZjYxMWFjYWQ1YzRjNWViOTJkZDQxMTA4ZDVlNTBkMzY1Nwpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgZm9sbG93cyBhIGhlbHBlciBvbmx5IGludG8gaXRzIG93biBmdW5jdGlvbgk4MWFmMzYzNDJkODZiMmZmOTQyZGRkYzc4Yjc5NjhhOTk3NTJjN2E2YzgzNWVmNDVmMGIxMjcxNzM2ODY5OWYzCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBqdWRnZXMgYSBKYXZhU2NyaXB0IGJvZHkgYW5kIGl0cyBoZWxwZXJzIG9uIHRoZSBjb2RlIHZpZXcJZWRhMTFjMzk4NmY2NGUwMDQwYmU1ZGQ3NTFjMDkzODgxYTRiNmE5ZjQ3ZmQ1MjAwZDI4YzM0ODVlZjRhZGEwZQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgcmVhZHMgYSBKYXZhU2NyaXB0IHRlc3Qgd2hlcmUgaXRzIGNhbGwgaXMgY29kZSwgYm91bmRlZCBhcyB0aGUgbG9jayBib3VuZHMgaXQJMTIzNDhlYTU0NTVlM2I2YzEyODk3MGQ1OTg2M2U5MWRkY2VmYWU4NDZmY2ViOTExNTEyNWQ4YTZmZDU2MDNmOQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSBKYXZhU2NyaXB0IHRlc3Qgd2hvc2UgYm9keSBpdCBjYW5ub3QgYm91bmQJNDQ1ZTM1MzdkOTIzZWMwNTVlNDBhM2Q2ZTNiNmExZTA4NmQxNzFlNDlhNGFiZWNmNDY4NjMyNTYyNjkwMDdhNQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSBzcGFjZWQgSmF2YVNjcmlwdCB0aXRsZSBpdCBmb3VuZCBidXQgd2hvc2UgYm9keSBpdCBjYW5ub3QgYm91bmQJNjEyNWJhNzFlYTQ3Yjk0Mzc3NGUxMTdjMmJjMGVkMzY4NjMwY2MzZmJjM2Y5ZmUwZGRjN2UyMTI1MjJiNmJlYQpib2R5CXRlc3RzL2pzLXJlYWRpbmcudGVzdC5tanMJYWRyLWxpbnQgc2F5cyBVTlBST1ZFTiBmb3IgYSB0ZXN0IG5hbWVkIGJ5IGl0cyBvd24gZmlsZSB3aG9zZSBib2R5IGl0IGNhbm5vdCBib3VuZAk5NDk4Njk5YmZkOTQxZDFlOTZhODgyM2U2ZDZlNjMwZDBkNzM1ZGI1MjRhNGI2OGJhZmRjMGU2NGQ3MWQ5ZTBkCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhZHItbGludCBzYXlzIFVOUFJPVkVOLCBhbmQgd2l0aGhvbGRzIGRvbmUsIGZvciBhIEphdmFTY3JpcHQgdGVzdCBpdCBjb3VsZCBub3QgcmVhZCB0bwlhYWE2YTQ4MjIyNWM4M2MxNmE5ZDAxNWQ1MTk1NTczMjE0YmU0MzA5ZWY5NDMyMGE3OTEzMTgyYTg3NWU0YjNlCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlhbiBlbmZvcmNlbWVudCBwb2ludGVyIHRvIGEgSmF2YVNjcmlwdCB0ZXN0IGlzIHJlc29sdmVkIG9uIHRoZSBsZXhlcgljZDAzOTAwNGQ4YzNmZTBiYTNlNTlhMDg3MTFmZTFkMzUxYzdjMGQyN2FmMTQ4ZmVkMDIzZmE5YjQyY2ZkYjk2CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlwYXN0IEpTWCwgYSBzdG9wIHRoZSBsZXhlciBzdGlsbCBjYW5ub3QgcmVhZCByZWZ1c2VzLCBhbmQgY29tbWVudHMgcmVhZCBhcyBjb21tZW50cwk1MTlhMjY1NWI2YmU3ZmU3NjBjNWU5NWUwMThlMmRjMjkyZTc4NGUxNzJjODI4ODM1MjI4OTY2NzM3MzUwMDJkCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlzcGVjLXZlcmlmeSBmaW5kcyBhIEphdmFTY3JpcHQgdGVzdCBvbmx5IHdoZXJlIGl0cyByZWdpc3RyYXRpb24gaXMgY29kZSwgaW4gZXZlcnkgZmFtaWx5IHN1ZmZpeAkwY2QxODA5NmQ2ODg3NWQxZmQ2ZjRlYjQxYjJlMGE2NzIwYjdlNTM1YWM4MTVjOWJjMWUyYWU3OWMxZjE2ZDg4CmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwlzcGVjLXZlcmlmeSBtYXRjaGVzIGEgZGVjb2RlZCB0aXRsZSwgYW5kIG5ldmVyIGEgc3Vic3RyaW5nCTU5YWJkNTgzN2NlZDU3NGNhYjI1MmYxMjBjNThmZTFhYzQ0ZjkxODZmY2I5NzVlYWM4YTQ1MjBlZGQ1MGQwYzkKYm9keQl0ZXN0cy9qcy1yZWFkaW5nLnRlc3QubWpzCXNwZWMtdmVyaWZ5IHNheXMgY291bGQtbm90LWNoZWNrLCBleGl0IDQsIGZvciBhIEphdmFTY3JpcHQgdGVzdCBpdCBjb3VsZCBub3QgcmVhZCB0bwlkYzkzMjgzNjkwMTFhNjQ2N2MxNmRlNDEzMmY2MjNlZTQwOGY1ZTM3MTU3ZGNhM2ViODMwMjVkZjU0YjUzMDZkCmJvZHkJdGVzdHMvanMtcmVhZGluZy50ZXN0Lm1qcwl0aGUgb3RoZXIgbGFuZ3VhZ2VzIHJlYWQgYXMgdGhleSBkaWQJNjA1ZTcxODBlZDM5N2U5OWQ4NTc5MDVjYmE3NDJhM2VhOWZmMDk4ZWRlNTM3MmEzNTdlZWNjNTA2MzliM2I5Yg · test-lock-kind:replace
