# Task ADR-082-T2: attest-import files verdictChanges

**Depends-on:** T1
**Covers:** F-7, UC2-S4
**Estimated scope:** S (one key and its shape check)
**Owner:** unassigned
**Produces:** none
**Consumes:** `verdictChanges` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the field joins the schema`, `a malformed field is refused`

## Goal

`attest-import` files an attestation whose `verdictChanges` is null or exactly its three counts, and refuses any other shape with a numbered reason (ADR-082 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/attest-import.mjs` | edit | `verdictChanges` joins `KEYS` after `readinessUnproven`; `check` validates its shape |
| `tests/attest-import.test.mjs` | edit | remove `todo` from this task's test |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the test in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Add `verdictChanges` to `KEYS`, so `ordered` writes it in schema order.
3. [S3] In `check`, refuse a `verdictChanges` that is neither null nor an object with exactly `compared`, `passToFail` and `failToPass`, each a non-negative integer, with `passToFail + failToPass <= compared`; the reason names the field.
4. [S4] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
T=$(mktemp)
node --test --test-reporter=tap tests/attest-import.test.mjs > "$T" 2>&1 \
  && test "$(grep -cxE 'ok [0-9]+ - attest-import files verdictChanges and refuses a malformed one' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `attest-import files verdictChanges and refuses a malformed one` | `tests/attest-import.test.mjs` | six malformed shapes refused; null and three counts filed | F-7, UC2-S4 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `check`, which `main` calls on every message |
| 3 — the caller can discover it | the refusal names `verdictChanges` |
| 4 — it is used | every attestation filed from 3.8.0 |

## Mutation Log
- 2026-10-02 · 5d4559d* · mutant killed · exit 1 · `scripts/attest-import.mjs` · a well-formed verdictChanges is refused as a key outside the schema · acceptance-sha256:b6fafad06dcf2baa21c1665ca72e238f0e6cdc13a0f19dc1c51748e7a037f1da · covers:the field joins the schema
- 2026-10-02 · 5d4559d* · mutant killed · exit 1 · `scripts/attest-import.mjs` · a malformed verdictChanges is filed · acceptance-sha256:b6fafad06dcf2baa21c1665ca72e238f0e6cdc13a0f19dc1c51748e7a037f1da · covers:a malformed field is refused

## Invariants

- An attestation without the field is filed exactly as before.

## Risks

- None beyond the record's.

## Stop Condition

Stop and ask if an attestation already in `docs/corpus-reports/` would be refused on re-import.

## Out of Scope

- release-evidence — T3.

## Verification Log
- 2026-10-02 · 5d4559d* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:b6fafad06dcf2baa21c1665ca72e238f0e6cdc13a0f19dc1c51748e7a037f1da · ms:3501 · test-lock-sha256:4677d714b8e2cfd0db05f62a91e58acd4cbc50c5c6f665be1158a7e6a1bd8f48 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYXR0ZXN0LWltcG9ydC50ZXN0Lm1qcwlhIGRhdGUgdGhhdCBpcyBub3QgYSBkYXRlIGlzIHJlZnVzZWQsIGFuZCBub3RoaW5nIGlzIHdyaXR0ZW4gb3V0c2lkZSB0aGUgcmVwb3J0cwlmYmYyMzFkZjU1NTM4MzU3OTVhNjU3NzIxZWY1NmQxYTI4NzNmODM1Y2Y2YzExMzM3ZTMwNDU2YmZjODBlNGIwCmJvZHkJdGVzdHMvYXR0ZXN0LWltcG9ydC50ZXN0Lm1qcwlhIG1lc3NhZ2UgdGhhdCBpcyBub3QgZXhhY3RseSBvbmUgY2xlYW4gYXR0ZXN0YXRpb24gaXMgcmVmdXNlZCwgYW5kIG5vdGhpbmcgaXMgd3JpdHRlbgkyMzY3M2Y0ZDNhZjRkZTZiMDA1MGQ5NzU0N2ZkYzU2YTdjNjc1YmNjMmQ4ODZkNmQ4NDc1ZjMxZjNmZTQ1M2Q2CmJvZHkJdGVzdHMvYXR0ZXN0LWltcG9ydC50ZXN0Lm1qcwlhbiBhdCB0aGlzIGNsb25lIGxhY2tzIGlzIGNvdWxkLW5vdC1sb29rLCBub3QgYSByZWZ1c2FsCWVlNDU2MDdmMjQyZmZkZmIzMTM5NDczMGIzNzlhOTFmNGE3OTViODJiNzVkY2M4NjE3YTJmNjlhZmNhN2ZkNzYKYm9keQl0ZXN0cy9hdHRlc3QtaW1wb3J0LnRlc3QubWpzCWFuIGF0dGVzdGF0aW9uIGlzIGZpbGVkIG9ubHkgd2hlbiBpdHMgZGlnZXN0cyBhcmUgdGhlIG9uZXMgaXRzIGNvbW1pdCBnaXZlcwk1YTRmNmI0MDgwOWFhMzYzM2NmNTRiYzYyOWRjNmZkNWJkMzVjNWJmY2U2YzhiNmRmYmMxOTEyYWMyYWUxZjQyCmJvZHkJdGVzdHMvYXR0ZXN0LWltcG9ydC50ZXN0Lm1qcwlhdHRlc3QtaW1wb3J0IGZpbGVzIHZlcmRpY3RDaGFuZ2VzIGFuZCByZWZ1c2VzIGEgbWFsZm9ybWVkIG9uZQlhMjQ1MzdhNDA5ODJhMjVjZTc2MzA3ZWVjZDQ2M2M0NGE3YjZjNjRkODllYjg1ODQzZjJhYWY2Y2I0NWFmNGVj
  ```
  ```
- 2026-10-02 · 5d4559d* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:b6fafad06dcf2baa21c1665ca72e238f0e6cdc13a0f19dc1c51748e7a037f1da · ms:3567
- 2026-10-02 · 5d4559d* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:b6fafad06dcf2baa21c1665ca72e238f0e6cdc13a0f19dc1c51748e7a037f1da · ms:3440
