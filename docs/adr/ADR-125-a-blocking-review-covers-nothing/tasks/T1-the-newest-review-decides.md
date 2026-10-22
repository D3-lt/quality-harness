# Task ADR-125-T1: The newest covering review decides, and a blocking one covers nothing

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the `blocked` review verdict
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`reviewEvidence` reports a plugin commit reviewed only when the newest ledger row covering it is `clean` or
`evidence-limited`; a newest `blocking` row makes the release UNPROVEN, kind `blocked`, with advice naming the verification
review.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/review-blocking.test.mjs` | create | the newest-row cases (0 locks: new) |
| `scripts/release-evidence.mjs` | edit | `reviewEvidence` (:450-471), `tagAdvice` (:565-586), `main`'s advice for the review kind (:648) |
| `tests/review-ledger.test.mjs` | edit; relock | `:176-180` asserted that a blocking exact row clears its commit, the behaviour this record reverses; ADR-100 T1 and ADR-119 T2 lock the test and are relocked with `--replace-hashes` |
| `tests/mutations/scripts/release-evidence.mjs.json` | edit | the mechanism's mutant |

## Ordered Steps

1. [S1] Write the failing test and record the red run: a commit whose only covering row is blocking is UNPROVEN, kind
   `blocked`, and named; a clean row appended after it clears it; a blocking row appended after a clean one blocks it
   again; an evidence-limited newest row clears; the advice names the verification review of CLAUDE.md §12.
2. [S2] The newest covering row decides, in `reviewEvidence`; the `blocked` advice. Update `tests/review-ledger.test.mjs:176-180`
   and relock ADR-100 T1 and ADR-119 T2.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/review-blocking.test.mjs tests/review-ledger.test.mjs 2>&1) \
  && for n in "a commit whose newest covering review requested changes is not reviewed" \
      "release-evidence refuses a plugin commit since the last tag that no review covers, and a covering review clears it"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a commit whose newest covering review requested changes is not reviewed` | `tests/review-blocking.test.mjs` | the newest row decides; the advice | — | S1, S2 |
| `release-evidence refuses a plugin commit since the last tag that no review covers, and a covering review clears it` | `tests/review-ledger.test.mjs` | ADR-100's coverage, with a clean row now the one that clears | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new test |
| 2 — something selects it | `main` calls `reviewEvidence` on every SUCCESS run (:638) |
| 3 — the caller can discover it | the advice line |
| 4 — it is used | `scripts/release.mjs` step 5 |

## Mutation Log
- 2026-10-22 · 2f8507cf* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · a review that requested changes covers its commits · acceptance-sha256:493e25836564b2006b7193c7d2a0aa16136a0180a02e91c078462fa1ebbb3381

## Invariants

- A review that did not finish or said nothing readable still covers nothing.

## Risks

- What the test doubles do not model: rows written by the launcher across machines; the ledger is per clone.

## Stop Condition

Stop if a ledger row's order cannot stand for review order (rows not appended at a review's end).

## Out of Scope

- `branch-state`'s reviewed line (ADR-125 Out of Scope).

## Verification Log
- 2026-10-22 · 2f8507cf* · exit 1 · `out=$(node --test --test-reporter=tap tests/review-blocking.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:493e25836564b2006b7193c7d2a0aa16136a0180a02e91c078462fa1ebbb3381 · ms:9024 · test-lock-sha256:b731c7a6ee83b0b3bcd00a94a2bd5e9086f1719dd59301710282fb028fce73a0 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmV2aWV3LWJsb2NraW5nLnRlc3QubWpzCWEgY29tbWl0IHdob3NlIG5ld2VzdCBjb3ZlcmluZyByZXZpZXcgcmVxdWVzdGVkIGNoYW5nZXMgaXMgbm90IHJldmlld2VkCTdjMWM2MWY3NGFkMGY2ZjIwZmUwM2IzYzA4MGM4Mjk0Mjg3YzY1ZTIzN2Y3Mjg1MWU5ZjYxZDY3ODhkYzQ2NGYKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgQ3Vyc29yIG9yIENsYXVkZSByZXZpZXcgcmVjb3JkcyB0aGUgSEVBRCBpdCB3YXMgc2hvd24sIG5vdCB0aGUgb25lIGFmdGVyIGl0CTYzMmNjYzAwNmQ2YjA1M2NmNzQ0NTliN2U5MzliYzQ3Njc1MjU4NmRiYmExYWMzOWM2ZDJlNTgwMWYzZDU3YjUKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgQ3Vyc29yIHJldmlldyB0aGUgbGF1bmNoZXIgcnVucyBsZWF2ZXMgb25lIHJldmlldyByb3cgdG9vCTE1NWE1ZjU3NWZhNTE4YTI5MGYzMWZkNTJmZDYxYTFmMTk3YWU4OTU5MzdlOTMxNjFmNmQ5ZDBmNzAxN2VjYzUKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgQ3Vyc29yIHJldmlldyB0cnVzdHMgdGhlIHdvcmtzcGFjZSBpdCBpcyBhc2tlZCBhYm91dCwgYW5kIGEgZmFpbGVkIG9uZSBzYXlzIHdoeQlkNzczMzU3NzllMjM5ZmQ1MGEwNzZmZWQ3ZGM3M2FmOTUzNGMyNDcxMTUzYWVmNjExYTE3OTIyZDZlNTUzNWFkCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwlhIGhlYWRsZXNzIENsYXVkZSByZXZpZXcgaXMgcmVhZC1vbmx5LCB1bndyYXBzIGl0cyByZXN1bHQsIGFuZCBsZWF2ZXMgb25lIHJldmlldyByb3cJMjRkNjJjMDg1Zjg5NzEyYTJhMGQzNTM0Zjc5M2FlNTQ0MGEzZTkyNDU3NjkyYmFiYzk0MjJlN2NiN2JlZTY3MQpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSByZXZpZXcgcmFuZ2UgZnJvbSBhIGRvdHRlZCByZWxlYXNlIHRhZyBpcyByZWFkLCBhbmQgYSB0aHJlZS1kb3QgcmFuZ2UgaXMgbm90CTNiNzM1NDJhZjczNzcxMGEyNTEzN2QxNDUzZWY0Zjc4NjE0NDMyZjhkNzRmNWJkMWJmZmUyNjQwOTkyN2ZhOWIKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgcmV2aWV3IHJvdyBmcm9tIHRoZSBsYXVuY2hlciBjYXJyaWVzIGl0cyBib3VuZCBhbmQgdGhlIG1vZGVsIHRoZSByZXZpZXdlciBwcmludGVkCTJiOGFjZDVkYzRjOWRlNTY5OGYwNmZmOThiZGUxOTU0OWIyN2RjYWE3M2M1YjMzNTNhYWRlOGUxYTJkNmZjN2MKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgcmV2aWV3IHJvdyB3aG9zZSBiYXNlIGRvZXMgbm90IHJlc29sdmUgY292ZXJzIG5vdGhpbmcJMWFjNmE5ODIzOTcxNWExNzFmMGFmMGIzZThmZjU2MmI5ZGM2M2QyNjE3M2FhZjU0MDUyZTAxMGEyNWQyNTQ1ZApib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSB2ZXJzaW9uIGJ1bXAgYWxvbmUgbmVlZHMgbm8gcmV2aWV3LCBhbmQgYW4gdW5hdmFpbGFibGUgb3IgdW5wYXJzZWQgcmV2aWV3IGNvdmVycyBub3RoaW5nCTA2NTA0MjZlNzU1NjFiYmZjN2Q5MzY1ODA5ZTMyODc5YzcwYmRmY2RiNDUxYTMxZjJhZDMyY2JjOTY2MDMxYzMKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWV2ZXJ5IENvZGV4IHJ1biB0aGUgbGF1bmNoZXIgc3RhcnRzIGxlYXZlcyBvbmUgcmV2aWV3IHJvdyBuYW1pbmcgaXRzIHJhbmdlIGFuZCBzdGF0dXMJMmFlNWI3YjE4YjVjMGI1YmMzNWM5OGRkNzkyNTE4ODg4YzZlYTY5MTc2ZWJhNWM0Y2JmYzgzY2MzZGZjM2NjYQpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJcmVsZWFzZS1ldmlkZW5jZSBhc2tzIHRoZSByZXZpZXcgcXVlc3Rpb24gZnJvbSBpdHMgbWFpbiBwYXRoCTNlMDRhZTYxZDY0NTI5Y2NhNjVmMGU2MGVjN2MyMTliMWQwYjE5NWY5OWFkNjQwY2Y0YjZhMDJmM2ViMjlmMTIKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCXJlbGVhc2UtZXZpZGVuY2UgcmVmdXNlcyBhIHBsdWdpbiBjb21taXQgc2luY2UgdGhlIGxhc3QgdGFnIHRoYXQgbm8gcmV2aWV3IGNvdmVycywgYW5kIGEgY292ZXJpbmcgcmV2aWV3IGNsZWFycyBpdAk5NDUwYTE3Y2Y4YTE1YTMxMjU3YTA0MDMxNThmOGIyZmVlNTBkYzVhOWU2NWM0N2FlYzVhMDhhMzBiODZhNDFiCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwl0aGUgcHJvbXB0LWZpbGUgZm9ybSB0YWtlcyBpdHMgc3RhdHVzIGZyb20gdGhlIGxhc3QgVkVSRElDVCBsaW5lLCBhbmQgbm9uZSBpcyB1bnBhcnNlZAlkNzI3MjBhMGY4NDRmYjVkNzNjYWRlZTRiZDQ2ZDQ5ZTVjMmQ5MTFjNjAwNmYyZmJmOTc5YzVlMDdjODQ2YTQ5
  ```
  ```
- 2026-10-22 · 2f8507cf* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-blocking.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:493e25836564b2006b7193c7d2a0aa16136a0180a02e91c078462fa1ebbb3381 · ms:3460
- 2026-10-22 · 2f8507cf* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:493e25836564b2006b7193c7d2a0aa16136a0180a02e91c078462fa1ebbb3381 · ms:0 · test-lock-sha256:42c286d664b7b1f0832c8a3cc8cce805648526469952c61d2c9c7a8472ed8922 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmV2aWV3LWJsb2NraW5nLnRlc3QubWpzCWEgY29tbWl0IHdob3NlIG5ld2VzdCBjb3ZlcmluZyByZXZpZXcgcmVxdWVzdGVkIGNoYW5nZXMgaXMgbm90IHJldmlld2VkCTdjMWM2MWY3NGFkMGY2ZjIwZmUwM2IzYzA4MGM4Mjk0Mjg3YzY1ZTIzN2Y3Mjg1MWU5ZjYxZDY3ODhkYzQ2NGYKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgQ3Vyc29yIG9yIENsYXVkZSByZXZpZXcgcmVjb3JkcyB0aGUgSEVBRCBpdCB3YXMgc2hvd24sIG5vdCB0aGUgb25lIGFmdGVyIGl0CTYzMmNjYzAwNmQ2YjA1M2NmNzQ0NTliN2U5MzliYzQ3Njc1MjU4NmRiYmExYWMzOWM2ZDJlNTgwMWYzZDU3YjUKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgQ3Vyc29yIHJldmlldyB0aGUgbGF1bmNoZXIgcnVucyBsZWF2ZXMgb25lIHJldmlldyByb3cgdG9vCTE1NWE1ZjU3NWZhNTE4YTI5MGYzMWZkNTJmZDYxYTFmMTk3YWU4OTU5MzdlOTMxNjFmNmQ5ZDBmNzAxN2VjYzUKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgQ3Vyc29yIHJldmlldyB0cnVzdHMgdGhlIHdvcmtzcGFjZSBpdCBpcyBhc2tlZCBhYm91dCwgYW5kIGEgZmFpbGVkIG9uZSBzYXlzIHdoeQlkNzczMzU3NzllMjM5ZmQ1MGEwNzZmZWQ3ZGM3M2FmOTUzNGMyNDcxMTUzYWVmNjExYTE3OTIyZDZlNTUzNWFkCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwlhIGhlYWRsZXNzIENsYXVkZSByZXZpZXcgaXMgcmVhZC1vbmx5LCB1bndyYXBzIGl0cyByZXN1bHQsIGFuZCBsZWF2ZXMgb25lIHJldmlldyByb3cJMjRkNjJjMDg1Zjg5NzEyYTJhMGQzNTM0Zjc5M2FlNTQ0MGEzZTkyNDU3NjkyYmFiYzk0MjJlN2NiN2JlZTY3MQpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSByZXZpZXcgcmFuZ2UgZnJvbSBhIGRvdHRlZCByZWxlYXNlIHRhZyBpcyByZWFkLCBhbmQgYSB0aHJlZS1kb3QgcmFuZ2UgaXMgbm90CTNiNzM1NDJhZjczNzcxMGEyNTEzN2QxNDUzZWY0Zjc4NjE0NDMyZjhkNzRmNWJkMWJmZmUyNjQwOTkyN2ZhOWIKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgcmV2aWV3IHJvdyBmcm9tIHRoZSBsYXVuY2hlciBjYXJyaWVzIGl0cyBib3VuZCBhbmQgdGhlIG1vZGVsIHRoZSByZXZpZXdlciBwcmludGVkCTJiOGFjZDVkYzRjOWRlNTY5OGYwNmZmOThiZGUxOTU0OWIyN2RjYWE3M2M1YjMzNTNhYWRlOGUxYTJkNmZjN2MKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgcmV2aWV3IHJvdyB3aG9zZSBiYXNlIGRvZXMgbm90IHJlc29sdmUgY292ZXJzIG5vdGhpbmcJMWFjNmE5ODIzOTcxNWExNzFmMGFmMGIzZThmZjU2MmI5ZGM2M2QyNjE3M2FhZjU0MDUyZTAxMGEyNWQyNTQ1ZApib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSB2ZXJzaW9uIGJ1bXAgYWxvbmUgbmVlZHMgbm8gcmV2aWV3LCBhbmQgYW4gdW5hdmFpbGFibGUgb3IgdW5wYXJzZWQgcmV2aWV3IGNvdmVycyBub3RoaW5nCTA2NTA0MjZlNzU1NjFiYmZjN2Q5MzY1ODA5ZTMyODc5YzcwYmRmY2RiNDUxYTMxZjJhZDMyY2JjOTY2MDMxYzMKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWV2ZXJ5IENvZGV4IHJ1biB0aGUgbGF1bmNoZXIgc3RhcnRzIGxlYXZlcyBvbmUgcmV2aWV3IHJvdyBuYW1pbmcgaXRzIHJhbmdlIGFuZCBzdGF0dXMJMmFlNWI3YjE4YjVjMGI1YmMzNWM5OGRkNzkyNTE4ODg4YzZlYTY5MTc2ZWJhNWM0Y2JmYzgzY2MzZGZjM2NjYQpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJcmVsZWFzZS1ldmlkZW5jZSBhc2tzIHRoZSByZXZpZXcgcXVlc3Rpb24gZnJvbSBpdHMgbWFpbiBwYXRoCTNlMDRhZTYxZDY0NTI5Y2NhNjVmMGU2MGVjN2MyMTliMWQwYjE5NWY5OWFkNjQwY2Y0YjZhMDJmM2ViMjlmMTIKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCXJlbGVhc2UtZXZpZGVuY2UgcmVmdXNlcyBhIHBsdWdpbiBjb21taXQgc2luY2UgdGhlIGxhc3QgdGFnIHRoYXQgbm8gcmV2aWV3IGNvdmVycywgYW5kIGEgY292ZXJpbmcgcmV2aWV3IGNsZWFycyBpdAkyYjJlZjg2MzY1NzgzM2M2YzlhYzFmYmUwNjk3ZWFiMTc0ZmQ3ZjI1MmZmOTMyMGFiMDAyYzJlZmI1YjRjODRjCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwl0aGUgcHJvbXB0LWZpbGUgZm9ybSB0YWtlcyBpdHMgc3RhdHVzIGZyb20gdGhlIGxhc3QgVkVSRElDVCBsaW5lLCBhbmQgbm9uZSBpcyB1bnBhcnNlZAlkNzI3MjBhMGY4NDRmYjVkNzNjYWRlZTRiZDQ2ZDQ5ZTVjMmQ5MTFjNjAwNmYyZmJmOTc5YzVlMDdjODQ2YTQ5 · test-lock-kind:replace
