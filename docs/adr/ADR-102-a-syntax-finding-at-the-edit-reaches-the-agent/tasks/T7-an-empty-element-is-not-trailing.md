# Task ADR-102-T7: a comma with no value before it is not a trailing comma

**Depends-on:** T6
**Covers:** none — no spec
**Estimated scope:** S (one regular expression, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The JSONC fallback removes a trailing comma only when a value precedes it, so `{"a":[,]}`, `[1,,]` and `{,}` stay findings
(ADR-102, Decision 9).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | `(?<![\[{,]\s*)` before the trailing-comma match |
| `tests/post-edit-check.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entry below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the three broken files are silent).
2. [S2] Add the lookbehind.
3. [S3] Record a killed mutant: the lookbehind removed. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a comma with no value before it is not a trailing comma")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a comma with no value before it is not a trailing comma` | `tests/post-edit-check.test.mjs` | named: `{"a":[,]}`, `{"a":[1,,]}`, `{,}`; silent: a trailing comma, one after a space, and `[,]` inside a string | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · 735527ad* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a comma after [, { or another comma is removed as trailing again, so broken JSON reads as valid JSONC · acceptance-sha256:09477eb79c580c9107d373522ec2a25018a6cf7e5bfe08c96f0493b861cfcb8b

## Invariants

- Valid JSONC stays silent (T3, T6).

## Risks

- None beyond T6's.

## Stop Condition

Stop and ask if TypeScript's parser accepts a shape this refuses.

## Out of Scope

- The review's other residuals (BACKLOG §378)

## Verification Log
- 2026-10-14 · 735527ad* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:09477eb79c580c9107d373522ec2a25018a6cf7e5bfe08c96f0493b861cfcb8b · ms:4109 · test-lock-sha256:c97b5897ad0761ced699f9d1d9632abae942bf63ecafd0302e5da385a16581aa · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWVkYTNiMTQ5YzM3NjlmODI4YTM3MDAzYTQ5OWExMDY2ZDM4MDQ1YzdiYTUxMWNhOWYwYmJiNDllNzJkNTVmN2UKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgZmFpbHMgd2l0aG91dCBhIHdvcmQgaXMgVU5SVU4sIGFuZCB0aGUgaG9vayBleGl0cyAwCTMwYWE3OWI1MjgwZjdmNTZkNzcyMjI2NmM0ZTE1YmE5YjU4MDU2MzljMzc1MjRkMjk3YmE4YzNhYmI2OTNkZWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY29tbWEgd2l0aCBubyB2YWx1ZSBiZWZvcmUgaXQgaXMgbm90IGEgdHJhaWxpbmcgY29tbWEJN2E0ZjJlZjZmZjc3OWJmNzIyZTJiZjI1ZjQwNjU2MDA2MjliMDdlMmFhODU3OTJjMjRlZDk1ZGNlYmJhZDQ2Zgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGR5aW5nIGNoZWNrZXIgY2Fubm90IHBhc3MgaXRzZWxmIG9mZiBhcyBjb21wbGV0ZSBieSBwcmludGluZyB0aGUgbWFya2VyCTg4ZTFjZTNjYjRkMWM0MGFlOWQyZDVlMDUxZWI4MDllZTFhY2I1YzRlYzUxOTljN2I0ZjI2N2Y1YjExZGI1ZjEKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaWxlIHR5cGUgdGhlIGhvb2sgZG9lcyBub3QgaGFuZGxlIGlzIHNpbGVudCwgbm90IGFuIGVycm9yCTFkYjA5MjkyZWI1OTViOTM4MWJiMTFlYjY0Yzg1NTg3YTVhNzhkMjcyZDA5YmZlOWU3MGY1OWU4MDFkM2E0ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIGNvbWVzIG9ubHkgZnJvbSB0aGUgZmlsZSdzIG93biBwYXJzZXIJOWNjNDU0ZTZhNGFjZWI1MTUzZmNmY2Y2Mzc1MjYxZGYzYzdlYjMyYmYwNjkzMmZiNzE1YWY5NDYzNTU5MWYxNApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgbmFtZXMgdGhlIGVkaXRlZCBmaWxlIGFuZCBnaXZlcyB0aGUgZXJyb3IgYWxvbmUJYTY0ZmUzNGEyNWY1MWVmZTZmNjcyOTI2NGU0MTQ0OWY1Y2IzMmJkZjQ0MzljNmVhY2Q2OGZhYTBlM2IyNDc2NApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHN5bnRheCBmaW5kaW5nIGF0IHRoZSBlZGl0IHJlYWNoZXMgdGhlIGFnZW50LCBhbmQgYSBjbGVhbiBlZGl0IGhhbmRzIGl0IG5vdGhpbmcJODE1M2NlODNjMjNhODU5NmU3ODRiMDFiODVmYjRmODE2MzgyYzFkZGNiZjI3MTJkNGU5NTkxZGQ1NWNkODBhYQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBvbmx5IGFjdHMgb24gdGhlIHRvb2xzIGl0IGlzIGZvciwgYW5kIG9uIGZpbGVzIHRoYXQgZXhpc3QJMDNmMjZkYWQ0ZjQ4NWUwNmM0MGQ0YjQ0MjZhNzAxMDNkMGI4MDZmOTZlMGU5MWI1Zjk1MTg2OWZiOTMwMGVlYgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBwaWNrcyB0aGUgcGFyc2UgZ29hbCBmcm9tIHRoZSBleHRlbnNpb24sIGFuZCBkaWFnbm9zdGljcyBjYW5ub3QgZm9yZ2UgdGhlIG1hcmtlcgk0MGJjZjZmZjQ5MmM0MmZlN2VmODgwNmZiM2FiODYzZDUzNTkxZWU5MzY3OTUxYjlmOWRhNjI1ZDU1Yjc3ZmU1CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHJlcG9ydHMgYSBzeW50YXggZXJyb3Igd2l0aG91dCBmYWlsaW5nIHRoZSBlZGl0CWExYTU5YWFiZDFiN2ZmYzFjZjEwYTc2ZDFjMTFiYTllZGQ3ZjlmMTgwNDYwOTBhMzEwYmFlZjk2Y2M3MzhlN2Q
  ```
  ```
- 2026-10-14 · 735527ad* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:09477eb79c580c9107d373522ec2a25018a6cf7e5bfe08c96f0493b861cfcb8b · ms:4473
