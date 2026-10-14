# Task ADR-102-T10: without jq, node reads JSON as JSONC

**Depends-on:** T7
**Covers:** none — no spec
**Estimated scope:** S (one branch, one environment seam, one test)
**Owner:** the owner, 2026-10-14 ("yes node for json")
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic; `QUALITY_HARNESS_JQ` names a `jq` that is not installed, and the fence refuses a skip
**Proof map:** v1

## Goal

None of four Windows hosts in the outside runs of v3.8.27 (2026-10-14) had `jq`, so no `.json` was ever read there:
`{"a": }` was silent, as Decision 4 chose for an absent checker. Where `jq` is absent and `node` is present, `node` reads the
file as JSONC alone and names it with its parse error; a `node` that fails without a word is `UNRUN` (ADR-102, Decision 12,
amending Decision 4 for JSON only).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | the JSONC reader in one variable, used after `jq` refuses and, without `jq`, alone; `QUALITY_HARNESS_JQ` names the `jq` to use (default `jq`), so a test can make it absent on a host that has one |
| `tests/post-edit-check.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entry below; T3's entry follows its line |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: broken JSON is silent without `jq`).
2. [S2] Read with `node` alone where `jq` is absent.
3. [S3] Record a killed mutant: the `node`-alone branch removed. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - without jq, node reads JSON as JSONC")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `without jq, node reads JSON as JSONC` | `tests/post-edit-check.test.mjs` | without `jq`: `{"a": }` and `{"a":[,]}` are named as `<path>: …` with no stack; valid JSON, JSONC with comments and trailing commas, and a BOM are silent; a `node` that fails without a word is `UNRUN` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · 8e441682* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a host without jq reads no JSON again, so a broken .json is silent · acceptance-sha256:3e7d9f11659e2e528ca6f02adf19f3625ba2fc723728f55e8ae07b7aa1be01e8

## Invariants

- With `jq`, the output is unchanged (T3, T4, T6, T7).

## Risks

- `node`'s message names a position in the text after comments are replaced, not in the file. The file is named; the
  position is a hint.

## Stop Condition

Stop and ask if `node` reads as valid a file TypeScript's parser refuses that `jq` plus the fallback would have named.

## Out of Scope

- `jq` present and `node` absent: valid JSONC is still named by `jq` alone (deferred: BACKLOG §378, residual 2)

## Verification Log
- 2026-10-14 · 8e441682* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:3e7d9f11659e2e528ca6f02adf19f3625ba2fc723728f55e8ae07b7aa1be01e8 · ms:10059 · test-lock-sha256:07d7f706815f0fb441c6305e10017fbfbb4a5c6df061ef90b611961e49bf0085 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWNiZDUxODA1MTFkZTU1MjFiOTdiYmRlMzNlMWY3NjBlYjczYjc0MTNkZWE0NzY2NjIzNDRlYzg5MGM1YTI2M2YKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBQeXRob24gZmluZGluZyBzdXJ2aXZlcyBhIGNvbnNvbGUgdGhhdCBjYW5ub3QgZW5jb2RlIGl0cyBsaW5lCTg3Njg2Mzc0NjFjZDljN2UwNTgwMzMxZTUyNDJkMzljZWQ1ZTM1YzFhY2VmZTBjNTIwZGNmMWM4YjBkMzBkNDcKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgZmFpbHMgd2l0aG91dCBhIHdvcmQgaXMgVU5SVU4sIGFuZCB0aGUgaG9vayBleGl0cyAwCTMwYWE3OWI1MjgwZjdmNTZkNzcyMjI2NmM0ZTE1YmE5YjU4MDU2MzljMzc1MjRkMjk3YmE4YzNhYmI2OTNkZWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY29tbWEgd2l0aCBubyB2YWx1ZSBiZWZvcmUgaXQgaXMgbm90IGEgdHJhaWxpbmcgY29tbWEJN2E0ZjJlZjZmZjc3OWJmNzIyZTJiZjI1ZjQwNjU2MDA2MjliMDdlMmFhODU3OTJjMjRlZDk1ZGNlYmJhZDQ2Zgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGR5aW5nIGNoZWNrZXIgY2Fubm90IHBhc3MgaXRzZWxmIG9mZiBhcyBjb21wbGV0ZSBieSBwcmludGluZyB0aGUgbWFya2VyCTg4ZTFjZTNjYjRkMWM0MGFlOWQyZDVlMDUxZWI4MDllZTFhY2I1YzRlYzUxOTljN2I0ZjI2N2Y1YjExZGI1ZjEKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaWxlIHR5cGUgdGhlIGhvb2sgZG9lcyBub3QgaGFuZGxlIGlzIHNpbGVudCwgbm90IGFuIGVycm9yCTFkYjA5MjkyZWI1OTViOTM4MWJiMTFlYjY0Yzg1NTg3YTVhNzhkMjcyZDA5YmZlOWU3MGY1OWU4MDFkM2E0ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIGNvbWVzIG9ubHkgZnJvbSB0aGUgZmlsZSdzIG93biBwYXJzZXIJOWNjNDU0ZTZhNGFjZWI1MTUzZmNmY2Y2Mzc1MjYxZGYzYzdlYjMyYmYwNjkzMmZiNzE1YWY5NDYzNTU5MWYxNApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgbmFtZXMgdGhlIGVkaXRlZCBmaWxlIGFuZCBnaXZlcyB0aGUgZXJyb3IgYWxvbmUJYTY0ZmUzNGEyNWY1MWVmZTZmNjcyOTI2NGU0MTQ0OWY1Y2IzMmJkZjQ0MzljNmVhY2Q2OGZhYTBlM2IyNDc2NApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHB5dGhvbjMgdGhhdCBpcyBub3QgUHl0aG9uIGlzIG5vdCBhIGNoZWNrZXIJM2ZlZWM4YzE4MmUxNTg0YTIzNzFlOWYyZjA0ZGZmZDZlNWU2Y2E1MWUxMzRmMjQ0OWQ1MDZjYzlkOWQyMTI2ZQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHN5bnRheCBmaW5kaW5nIGF0IHRoZSBlZGl0IHJlYWNoZXMgdGhlIGFnZW50LCBhbmQgYSBjbGVhbiBlZGl0IGhhbmRzIGl0IG5vdGhpbmcJODE1M2NlODNjMjNhODU5NmU3ODRiMDFiODVmYjRmODE2MzgyYzFkZGNiZjI3MTJkNGU5NTkxZGQ1NWNkODBhYQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBvbmx5IGFjdHMgb24gdGhlIHRvb2xzIGl0IGlzIGZvciwgYW5kIG9uIGZpbGVzIHRoYXQgZXhpc3QJMDNmMjZkYWQ0ZjQ4NWUwNmM0MGQ0YjQ0MjZhNzAxMDNkMGI4MDZmOTZlMGU5MWI1Zjk1MTg2OWZiOTMwMGVlYgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBwaWNrcyB0aGUgcGFyc2UgZ29hbCBmcm9tIHRoZSBleHRlbnNpb24sIGFuZCBkaWFnbm9zdGljcyBjYW5ub3QgZm9yZ2UgdGhlIG1hcmtlcgk0MGJjZjZmZjQ5MmM0MmZlN2VmODgwNmZiM2FiODYzZDUzNTkxZWU5MzY3OTUxYjlmOWRhNjI1ZDU1Yjc3ZmU1CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHJlcG9ydHMgYSBzeW50YXggZXJyb3Igd2l0aG91dCBmYWlsaW5nIHRoZSBlZGl0CWExYTU5YWFiZDFiN2ZmYzFjZjEwYTc2ZDFjMTFiYTllZGQ3ZjlmMTgwNDYwOTBhMzEwYmFlZjk2Y2M3MzhlN2QKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJd2l0aG91dCBqcSwgbm9kZSByZWFkcyBKU09OIGFzIEpTT05DCWE2YTI5YzlmMzZlMTBmODdmMTI1ZDQ0MjI4YTIwMzFmNjE1MTAxMGM0MzZlN2I4NWNhZTk5NDRkYmU5YTU2NDQ
  ```
  ```
- 2026-10-14 · 8e441682* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:3e7d9f11659e2e528ca6f02adf19f3625ba2fc723728f55e8ae07b7aa1be01e8 · ms:5623
