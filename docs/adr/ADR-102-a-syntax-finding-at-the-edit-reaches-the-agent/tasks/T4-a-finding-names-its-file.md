# Task ADR-102-T4: a finding names the edited file and gives the error alone

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S (two checker lines, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** a finding is a syntax error from the file's own parser (T3)
**Data dependency:** hermetic; the rows run the real `jq` and `python3`, and the fence refuses a skip
**Proof map:** v1

## Goal

A JSON finding carries the edited file's path, and a Python finding is `<path>:<line>:<column>: SyntaxError: <message>` and
the offending line, with no traceback (ADR-102, Decision 6).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | prefix `jq`'s message with the path; the Python check prints the SyntaxError itself |
| `tests/post-edit-check.test.mjs` | edit | add the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entries below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the JSON line has no path; the Python finding carries `Traceback` and `<string>`).
2. [S2] Change the two checker lines.
3. [S3] Record killed mutants: the JSON path prefix removed; the Python check back to a raw traceback. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a finding names the edited file and gives the error alone")" = 1 \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a CommonJS finding is the error, not node's stack")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a finding names the edited file and gives the error alone` | `tests/post-edit-check.test.mjs` | a broken `.json` finding carries its path; a broken `.py` finding is one `path:line:col: SyntaxError:` line plus the source line, with no `Traceback` and no `<string>`; a file Python cannot decode is named, not a traceback | — | S1, S2 |
| `a CommonJS finding is the error, not node's stack` | `tests/post-edit-check.test.mjs` | a broken `.cjs` finding names the file and the SyntaxError, without node's `    at node:internal` frames, its `Node.js v` line or blank lines (an outside run, wcag-docs, 2026-10-14) | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · 8453076f* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a JSON finding stops naming the file the agent edited · acceptance-sha256:f66936dc0498bf866ea1b69c1978c0cc63473b42087b8645c631420155e13f4a
- 2026-10-14 · 8453076f* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a Python syntax error is a raw traceback through <string> and ast.py again · acceptance-sha256:f66936dc0498bf866ea1b69c1978c0cc63473b42087b8645c631420155e13f4a
- 2026-10-14 · 8453076f* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a JSON finding stops naming the file the agent edited · acceptance-sha256:1b68cb82e1ab618ee95fb0f2c6e3170aad2d90f0c1962cd219d779103235b921
- 2026-10-14 · 8453076f* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a Python syntax error is a raw traceback through <string> and ast.py again · acceptance-sha256:1b68cb82e1ab618ee95fb0f2c6e3170aad2d90f0c1962cd219d779103235b921
- 2026-10-14 · 8453076f* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a CommonJS finding carries node's stack frames, version line and blank lines again · acceptance-sha256:1b68cb82e1ab618ee95fb0f2c6e3170aad2d90f0c1962cd219d779103235b921

## Invariants

- A clean file still prints nothing (T1, T3); the hook exits 0.

## Risks

- None beyond T3's.

## Stop Condition

Stop and ask if a Python error other than a syntax or decode error reaches the check.

## Out of Scope

- The `.mjs`, `.cjs`, `.sh` and `.php` findings, which already name the file (the same outside run)

## Verification Log
- 2026-10-14 · 8453076f* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:f66936dc0498bf866ea1b69c1978c0cc63473b42087b8645c631420155e13f4a · ms:8736 · test-lock-sha256:4063e008eeed594fe964cf389185626fb82e18f705f0b6b1d51d5b28bb3c2a03 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZHlpbmcgY2hlY2tlciBjYW5ub3QgcGFzcyBpdHNlbGYgb2ZmIGFzIGNvbXBsZXRlIGJ5IHByaW50aW5nIHRoZSBtYXJrZXIJODhlMWNlM2NiNGQxYzQwYWU5ZDJkNWUwNTFlYjgwOWVlMWFjYjVjNGVjNTE5OWM3YjRmMjY3ZjViMTFkYjVmMQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbGUgdHlwZSB0aGUgaG9vayBkb2VzIG5vdCBoYW5kbGUgaXMgc2lsZW50LCBub3QgYW4gZXJyb3IJMWRiMDkyOTJlYjU5NWI5MzgxYmIxMWViNjRjODU1ODdhNWE3OGQyNzJkMDliZmU5ZTcwZjU5ZTgwMWQzYTRlZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgY29tZXMgb25seSBmcm9tIHRoZSBmaWxlJ3Mgb3duIHBhcnNlcgk5Y2M0NTRlNmE0YWNlYjUxNTNmY2ZjZjYzNzUyNjFkZjNjN2ViMzJiZjA2OTMyZmI3MTVhZjk0NjM1NTkxZjE0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmluZGluZyBuYW1lcyB0aGUgZWRpdGVkIGZpbGUgYW5kIGdpdmVzIHRoZSBlcnJvciBhbG9uZQlhNjRmZTM0YTI1ZjUxZWZlNmY2NzI5MjY0ZTQxNDQ5ZjVjYjMyYmRmNDQzOWM2ZWFjZDY4ZmFhMGUzYjI0NzY0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgc3ludGF4IGZpbmRpbmcgYXQgdGhlIGVkaXQgcmVhY2hlcyB0aGUgYWdlbnQsIGFuZCBhIGNsZWFuIGVkaXQgaGFuZHMgaXQgbm90aGluZwk4MTUzY2U4M2MyM2E4NTk2ZTc4NGIwMWI4NWZiNGY4MTYzODJjMWRkY2JmMjcxMmQ0ZTk1OTFkZDU1Y2Q4MGFhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZA
  ```
  ```
- 2026-10-14 · 8453076f* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:f66936dc0498bf866ea1b69c1978c0cc63473b42087b8645c631420155e13f4a · ms:7171
- 2026-10-14 · 8453076f* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:f66936dc0498bf866ea1b69c1978c0cc63473b42087b8645c631420155e13f4a · ms:5998
- 2026-10-14 · 8453076f* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:1b68cb82e1ab618ee95fb0f2c6e3170aad2d90f0c1962cd219d779103235b921 · ms:9612
  ```
  ```
- 2026-10-14 · 8453076f* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:1b68cb82e1ab618ee95fb0f2c6e3170aad2d90f0c1962cd219d779103235b921 · ms:4682
- 2026-10-14 · 8453076f* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:1b68cb82e1ab618ee95fb0f2c6e3170aad2d90f0c1962cd219d779103235b921 · ms:4007
- 2026-10-14 · 8453076f* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:1b68cb82e1ab618ee95fb0f2c6e3170aad2d90f0c1962cd219d779103235b921 · ms:4090
