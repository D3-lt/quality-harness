# Task ADR-102-T8: a finding survives the host's console and php.ini

**Depends-on:** T4, T5
**Covers:** none — no spec
**Estimated scope:** S (one checker line, one test, one locked test relocked)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic; both rows run the real `python3` and `php`, and the fence refuses a skip
**Proof map:** v1

## Goal

What CI showed at `380e40c` (2026-10-14), each reproduced on this machine before it was fixed (ADR-102, Decision 10):

- Windows: Python's console is cp1252, so printing the source line of an undecodable `.py` raised `UnicodeEncodeError`
  inside the handler, and the agent was handed two tracebacks. The source line is printed with its unencodable characters
  escaped.
- macOS: the runner has no `php`, and `a PHP finding is said once` failed rather than skipped.
- Linux: the T5 mutant (`php -l` with neither setting) survived. Ubuntu's `php.ini` turns the display off, so both runs of
  the test saw one line, the log's; counting could not tell the display (`Parse error:`) from the log (`PHP Parse error:`).
  The test now refuses the log's line.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | `sys.stdout.reconfigure(errors="backslashreplace")` in the Python check |
| `tests/post-edit-check.test.mjs` | edit | the new test below; `a PHP finding is said once` skips without `php` and refuses `PHP Parse error` (a locked test, relocked in T5, T6 and T7) |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entry below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: a traceback under `PYTHONIOENCODING=cp1252`).
2. [S2] Escape what the console cannot encode.
3. [S3] Record a killed mutant: the reconfigure line removed. [proof: mutation]
4. [S4] Give `a PHP finding is said once` its skip and the log-line refusal, and relock T5, T6 and T7 with
   `adr-verify --relock --replace-hashes`. [proof: acceptance]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - (a Python finding survives a console that cannot encode its line|a PHP finding is said once)")" = 2 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a Python finding survives a console that cannot encode its line` | `tests/post-edit-check.test.mjs` | under `PYTHONIOENCODING=cp1252` an undecodable `.py` is named as `path:1:`, in two lines at most, with no traceback | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · 380e40c5* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · the console encoding is left strict, so a cp1252 console turns the finding into a traceback again · acceptance-sha256:b6e2e8c3f8b6e0e1553ea82dd6f8f8e61439b6012e5a33ef661bdebae2858a95

## Invariants

- A clean file stays silent (T1); a finding still names its file (T4).

## Risks

- `backslashreplace` shows an unencodable character as `�`, not as the character. The line is context; the
  position and message carry the finding.

## Stop Condition

Stop and ask if a supported Python lacks `TextIOWrapper.reconfigure` (added in 3.7).

## Out of Scope

- Other output this hook prints through a console (`bash -n`, `jq`, `php`, `node`): their text is the checker's own and
  is not re-encoded by Python (permanent: boundary: only the Python check prints source text through Python's console)

## Verification Log
- 2026-10-14 · 380e40c5* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:b6e2e8c3f8b6e0e1553ea82dd6f8f8e61439b6012e5a33ef661bdebae2858a95 · ms:5045 · test-lock-sha256:538de28fba81a24c1e8cb2167474e9fe78d7c38bd2107e2248135e0616872e49 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWVkYTNiMTQ5YzM3NjlmODI4YTM3MDAzYTQ5OWExMDY2ZDM4MDQ1YzdiYTUxMWNhOWYwYmJiNDllNzJkNTVmN2UKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBQeXRob24gZmluZGluZyBzdXJ2aXZlcyBhIGNvbnNvbGUgdGhhdCBjYW5ub3QgZW5jb2RlIGl0cyBsaW5lCTg3Njg2Mzc0NjFjZDljN2UwNTgwMzMxZTUyNDJkMzljZWQ1ZTM1YzFhY2VmZTBjNTIwZGNmMWM4YjBkMzBkNDcKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgZmFpbHMgd2l0aG91dCBhIHdvcmQgaXMgVU5SVU4sIGFuZCB0aGUgaG9vayBleGl0cyAwCTMwYWE3OWI1MjgwZjdmNTZkNzcyMjI2NmM0ZTE1YmE5YjU4MDU2MzljMzc1MjRkMjk3YmE4YzNhYmI2OTNkZWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY29tbWEgd2l0aCBubyB2YWx1ZSBiZWZvcmUgaXQgaXMgbm90IGEgdHJhaWxpbmcgY29tbWEJN2E0ZjJlZjZmZjc3OWJmNzIyZTJiZjI1ZjQwNjU2MDA2MjliMDdlMmFhODU3OTJjMjRlZDk1ZGNlYmJhZDQ2Zgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGR5aW5nIGNoZWNrZXIgY2Fubm90IHBhc3MgaXRzZWxmIG9mZiBhcyBjb21wbGV0ZSBieSBwcmludGluZyB0aGUgbWFya2VyCTg4ZTFjZTNjYjRkMWM0MGFlOWQyZDVlMDUxZWI4MDllZTFhY2I1YzRlYzUxOTljN2I0ZjI2N2Y1YjExZGI1ZjEKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaWxlIHR5cGUgdGhlIGhvb2sgZG9lcyBub3QgaGFuZGxlIGlzIHNpbGVudCwgbm90IGFuIGVycm9yCTFkYjA5MjkyZWI1OTViOTM4MWJiMTFlYjY0Yzg1NTg3YTVhNzhkMjcyZDA5YmZlOWU3MGY1OWU4MDFkM2E0ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIGNvbWVzIG9ubHkgZnJvbSB0aGUgZmlsZSdzIG93biBwYXJzZXIJOWNjNDU0ZTZhNGFjZWI1MTUzZmNmY2Y2Mzc1MjYxZGYzYzdlYjMyYmYwNjkzMmZiNzE1YWY5NDYzNTU5MWYxNApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgbmFtZXMgdGhlIGVkaXRlZCBmaWxlIGFuZCBnaXZlcyB0aGUgZXJyb3IgYWxvbmUJYTY0ZmUzNGEyNWY1MWVmZTZmNjcyOTI2NGU0MTQ0OWY1Y2IzMmJkZjQ0MzljNmVhY2Q2OGZhYTBlM2IyNDc2NApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHN5bnRheCBmaW5kaW5nIGF0IHRoZSBlZGl0IHJlYWNoZXMgdGhlIGFnZW50LCBhbmQgYSBjbGVhbiBlZGl0IGhhbmRzIGl0IG5vdGhpbmcJODE1M2NlODNjMjNhODU5NmU3ODRiMDFiODVmYjRmODE2MzgyYzFkZGNiZjI3MTJkNGU5NTkxZGQ1NWNkODBhYQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBvbmx5IGFjdHMgb24gdGhlIHRvb2xzIGl0IGlzIGZvciwgYW5kIG9uIGZpbGVzIHRoYXQgZXhpc3QJMDNmMjZkYWQ0ZjQ4NWUwNmM0MGQ0YjQ0MjZhNzAxMDNkMGI4MDZmOTZlMGU5MWI1Zjk1MTg2OWZiOTMwMGVlYgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBwaWNrcyB0aGUgcGFyc2UgZ29hbCBmcm9tIHRoZSBleHRlbnNpb24sIGFuZCBkaWFnbm9zdGljcyBjYW5ub3QgZm9yZ2UgdGhlIG1hcmtlcgk0MGJjZjZmZjQ5MmM0MmZlN2VmODgwNmZiM2FiODYzZDUzNTkxZWU5MzY3OTUxYjlmOWRhNjI1ZDU1Yjc3ZmU1CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHJlcG9ydHMgYSBzeW50YXggZXJyb3Igd2l0aG91dCBmYWlsaW5nIHRoZSBlZGl0CWExYTU5YWFiZDFiN2ZmYzFjZjEwYTc2ZDFjMTFiYTllZGQ3ZjlmMTgwNDYwOTBhMzEwYmFlZjk2Y2M3MzhlN2Q
  ```
  ```
- 2026-10-14 · 380e40c5* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:b6e2e8c3f8b6e0e1553ea82dd6f8f8e61439b6012e5a33ef661bdebae2858a95 · ms:4449
- 2026-10-14 · 380e40c5* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:b6e2e8c3f8b6e0e1553ea82dd6f8f8e61439b6012e5a33ef661bdebae2858a95 · ms:0 · test-lock-sha256:a4dcf00a7586297d7e59158fbeb47c46cd80ac4573c07f4768ae04ade3157172 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWNiZDUxODA1MTFkZTU1MjFiOTdiYmRlMzNlMWY3NjBlYjczYjc0MTNkZWE0NzY2NjIzNDRlYzg5MGM1YTI2M2YKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBQeXRob24gZmluZGluZyBzdXJ2aXZlcyBhIGNvbnNvbGUgdGhhdCBjYW5ub3QgZW5jb2RlIGl0cyBsaW5lCTg3Njg2Mzc0NjFjZDljN2UwNTgwMzMxZTUyNDJkMzljZWQ1ZTM1YzFhY2VmZTBjNTIwZGNmMWM4YjBkMzBkNDcKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgZmFpbHMgd2l0aG91dCBhIHdvcmQgaXMgVU5SVU4sIGFuZCB0aGUgaG9vayBleGl0cyAwCTMwYWE3OWI1MjgwZjdmNTZkNzcyMjI2NmM0ZTE1YmE5YjU4MDU2MzljMzc1MjRkMjk3YmE4YzNhYmI2OTNkZWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY29tbWEgd2l0aCBubyB2YWx1ZSBiZWZvcmUgaXQgaXMgbm90IGEgdHJhaWxpbmcgY29tbWEJN2E0ZjJlZjZmZjc3OWJmNzIyZTJiZjI1ZjQwNjU2MDA2MjliMDdlMmFhODU3OTJjMjRlZDk1ZGNlYmJhZDQ2Zgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGR5aW5nIGNoZWNrZXIgY2Fubm90IHBhc3MgaXRzZWxmIG9mZiBhcyBjb21wbGV0ZSBieSBwcmludGluZyB0aGUgbWFya2VyCTg4ZTFjZTNjYjRkMWM0MGFlOWQyZDVlMDUxZWI4MDllZTFhY2I1YzRlYzUxOTljN2I0ZjI2N2Y1YjExZGI1ZjEKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaWxlIHR5cGUgdGhlIGhvb2sgZG9lcyBub3QgaGFuZGxlIGlzIHNpbGVudCwgbm90IGFuIGVycm9yCTFkYjA5MjkyZWI1OTViOTM4MWJiMTFlYjY0Yzg1NTg3YTVhNzhkMjcyZDA5YmZlOWU3MGY1OWU4MDFkM2E0ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIGNvbWVzIG9ubHkgZnJvbSB0aGUgZmlsZSdzIG93biBwYXJzZXIJOWNjNDU0ZTZhNGFjZWI1MTUzZmNmY2Y2Mzc1MjYxZGYzYzdlYjMyYmYwNjkzMmZiNzE1YWY5NDYzNTU5MWYxNApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgbmFtZXMgdGhlIGVkaXRlZCBmaWxlIGFuZCBnaXZlcyB0aGUgZXJyb3IgYWxvbmUJYTY0ZmUzNGEyNWY1MWVmZTZmNjcyOTI2NGU0MTQ0OWY1Y2IzMmJkZjQ0MzljNmVhY2Q2OGZhYTBlM2IyNDc2NApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHN5bnRheCBmaW5kaW5nIGF0IHRoZSBlZGl0IHJlYWNoZXMgdGhlIGFnZW50LCBhbmQgYSBjbGVhbiBlZGl0IGhhbmRzIGl0IG5vdGhpbmcJODE1M2NlODNjMjNhODU5NmU3ODRiMDFiODVmYjRmODE2MzgyYzFkZGNiZjI3MTJkNGU5NTkxZGQ1NWNkODBhYQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBvbmx5IGFjdHMgb24gdGhlIHRvb2xzIGl0IGlzIGZvciwgYW5kIG9uIGZpbGVzIHRoYXQgZXhpc3QJMDNmMjZkYWQ0ZjQ4NWUwNmM0MGQ0YjQ0MjZhNzAxMDNkMGI4MDZmOTZlMGU5MWI1Zjk1MTg2OWZiOTMwMGVlYgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBwaWNrcyB0aGUgcGFyc2UgZ29hbCBmcm9tIHRoZSBleHRlbnNpb24sIGFuZCBkaWFnbm9zdGljcyBjYW5ub3QgZm9yZ2UgdGhlIG1hcmtlcgk0MGJjZjZmZjQ5MmM0MmZlN2VmODgwNmZiM2FiODYzZDUzNTkxZWU5MzY3OTUxYjlmOWRhNjI1ZDU1Yjc3ZmU1CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHJlcG9ydHMgYSBzeW50YXggZXJyb3Igd2l0aG91dCBmYWlsaW5nIHRoZSBlZGl0CWExYTU5YWFiZDFiN2ZmYzFjZjEwYTc2ZDFjMTFiYTllZGQ3ZjlmMTgwNDYwOTBhMzEwYmFlZjk2Y2M3MzhlN2Q · test-lock-kind:replace
