# Task ADR-102-T5: a PHP finding is said once

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one checker line, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** stdout is empty for a clean file (T1)
**Data dependency:** hermetic; the row runs the real `php`, and the fence refuses a skip
**Proof map:** v1

## Goal

`php -l`'s parse error reaches the agent once, as `Parse error: … in <file> on line N` and `Errors parsing <file>`, whatever
the host's `display_errors` and `log_errors` are (ADR-102, Decision 7).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | `php -d display_errors=1 -d log_errors=0 -l`, blank lines dropped (measured 2026-10-14: the default printed `PHP Parse error:` and `Parse error:`) |
| `tests/post-edit-check.test.mjs` | edit | add the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entry below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the error appears twice).
2. [S2] Change the checker line.
3. [S3] Record a killed mutant: the two settings removed. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a PHP finding is said once")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a PHP finding is said once` | `tests/post-edit-check.test.mjs` | a broken `.php` yields exactly one `Parse error:` line, naming the file, no blank line, and the same under `PHP_INI_SCAN_DIR` pointing at an ini that turns `display_errors` off and `log_errors` on | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · cff776c2* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a PHP parse error reaches the agent twice again, or not at all, as the host php.ini decides · acceptance-sha256:17548771e67eaaafc8bd23b6ecbf18b1b2bb35684fec7e026229d0cdb208800e

## Invariants

- A clean `.php` file still prints nothing (T1).

## Risks

- None beyond T1's.

## Stop Condition

Stop and ask if a host's `php` ignores `-d` for these two settings.

## Out of Scope

- The other checkers (T4)

## Verification Log
- 2026-10-14 · cff776c2* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:17548771e67eaaafc8bd23b6ecbf18b1b2bb35684fec7e026229d0cdb208800e · ms:3867 · test-lock-sha256:14a1afeceebae82cec5ec2fe86fef6a7eb8e3b47338b38a9c896197220b469f5 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWVkYTNiMTQ5YzM3NjlmODI4YTM3MDAzYTQ5OWExMDY2ZDM4MDQ1YzdiYTUxMWNhOWYwYmJiNDllNzJkNTVmN2UKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZHlpbmcgY2hlY2tlciBjYW5ub3QgcGFzcyBpdHNlbGYgb2ZmIGFzIGNvbXBsZXRlIGJ5IHByaW50aW5nIHRoZSBtYXJrZXIJODhlMWNlM2NiNGQxYzQwYWU5ZDJkNWUwNTFlYjgwOWVlMWFjYjVjNGVjNTE5OWM3YjRmMjY3ZjViMTFkYjVmMQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbGUgdHlwZSB0aGUgaG9vayBkb2VzIG5vdCBoYW5kbGUgaXMgc2lsZW50LCBub3QgYW4gZXJyb3IJMWRiMDkyOTJlYjU5NWI5MzgxYmIxMWViNjRjODU1ODdhNWE3OGQyNzJkMDliZmU5ZTcwZjU5ZTgwMWQzYTRlZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgY29tZXMgb25seSBmcm9tIHRoZSBmaWxlJ3Mgb3duIHBhcnNlcgk5Y2M0NTRlNmE0YWNlYjUxNTNmY2ZjZjYzNzUyNjFkZjNjN2ViMzJiZjA2OTMyZmI3MTVhZjk0NjM1NTkxZjE0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmluZGluZyBuYW1lcyB0aGUgZWRpdGVkIGZpbGUgYW5kIGdpdmVzIHRoZSBlcnJvciBhbG9uZQlhNjRmZTM0YTI1ZjUxZWZlNmY2NzI5MjY0ZTQxNDQ5ZjVjYjMyYmRmNDQzOWM2ZWFjZDY4ZmFhMGUzYjI0NzY0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgc3ludGF4IGZpbmRpbmcgYXQgdGhlIGVkaXQgcmVhY2hlcyB0aGUgYWdlbnQsIGFuZCBhIGNsZWFuIGVkaXQgaGFuZHMgaXQgbm90aGluZwk4MTUzY2U4M2MyM2E4NTk2ZTc4NGIwMWI4NWZiNGY4MTYzODJjMWRkY2JmMjcxMmQ0ZTk1OTFkZDU1Y2Q4MGFhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZA
  ```
  ```
- 2026-10-14 · cff776c2* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:17548771e67eaaafc8bd23b6ecbf18b1b2bb35684fec7e026229d0cdb208800e · ms:3460
