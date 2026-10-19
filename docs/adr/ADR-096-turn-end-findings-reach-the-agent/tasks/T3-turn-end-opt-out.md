# Task ADR-096-T3: a project can keep turn-end findings user-only, and the skill says how

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (one config key, its reader, one line of documentation, two tests)
**Owner:** unassigned
**Produces:** `.quality-harness.json` key `turnEnd` (`"agent"` default, `"notify"`)
**Consumes:** `deliver` emitting `hookSpecificOutput.additionalContext` on Stop (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the opt-out is honoured`, `an unreadable configuration means the default`

## Goal

A project that does not want its agent's turns continued can say so, the plugin's README tells adopters how, and an unreadable
configuration is said as such and means the default.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/project-config.mjs` | edit | read `turnEnd`; a value other than `"notify"`, or none, is `"agent"` |
| `plugin/scripts/lifecycle.mjs` | edit | `deliver` reads it before choosing the channel |
| `plugin/README.md` | edit | one paragraph naming `turnEnd` beside the other `.quality-harness.json` keys (the operating skill has no configuration list) |
| `tests/turn-end-delivery.test.mjs` | edit | the two tests below |
| `tests/mutations/plugin/scripts/project-config.mjs.json` | edit | one entry per `Rests-on` name |

## Ordered Steps

1. [S1] Write the two tests and record the red run (TDD red).
2. [S2] Read the key and branch on it in `deliver`.
3. [S3] Add the paragraph to the plugin's README. [proof: acceptance]
4. [S4] Record one killed mutant per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \
  && for t in 'turnEnd notify keeps a finding user-only, and any other value means agent' 'an unreadable project configuration means the default, said as such'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `turnEnd notify keeps a finding user-only, and any other value means agent` | `tests/turn-end-delivery.test.mjs` | `turnEnd: notify`: only `systemMessage`; `turnEnd: shout` or none: `additionalContext` | none | S1, S2 |
| `an unreadable project configuration means the default, said as such` | `tests/turn-end-delivery.test.mjs` | a `.quality-harness.json` that does not parse: delivery as `agent`, and the problem said once | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `deliver` reads the key; removing the read turns the first test red |
| 3 — the caller can discover it | the plugin's README, beside `"publish": "warn"` |
| 4 — it is used | an adopter's `.quality-harness.json` |

## Mutation Log
- 2026-10-12 · fc3e9c47* · mutant killed · exit 1 · `plugin/scripts/project-config.mjs` · turnEnd notify is ignored, so the agent is handed findings the project kept user-only · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · covers:the opt-out is honoured
- 2026-10-12 · fc3e9c47* · mutant killed · exit 1 · `plugin/scripts/project-config.mjs` · an unreadable configuration silently means notify · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · covers:an unreadable configuration means the default
- 2026-10-12 · fc3e9c47* · mutant killed · exit 1 · `plugin/scripts/project-config.mjs` · turnEnd notify is ignored, so the agent is handed findings the project kept user-only · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · covers:the opt-out is honoured

## Invariants

- An unreadable configuration never silently means `"notify"`.

## Risks

- None beyond T2's.

## Stop Condition

Stop and ask if another key already controls advisory delivery.

## Out of Scope

- A per-rule opt-out (permanent: boundary: one switch is enough until someone asks for finer control)

## Verification Log
- 2026-10-12 · fc3e9c47* · exit 1 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:5112 · test-lock-sha256:3be962d9cf3bc7752562e7d1e6ab11702d0242ab05fe6882ac5f989279644e4c · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJQ0xBVURFLm1kIHNlY3Rpb24gMyBuYW1lcyBhIHR1cm4gdGhhdCBjb250aW51ZXMgYXMgYW4gYWN0LCBub3QgYSByZWZ1c2FsCTk4MjkxOGI0NTFlOThhMWFiMmM2Njg0MTYxOWViZDlkN2RmZWJjN2ZjN2E0MWExOGM1YTZhZDY2OGEwNGQ1MGIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlTdWJhZ2VudFN0b3Agb3V0cHV0IGlzIHVuY2hhbmdlZAkwN2ZmOTM4NGEzZmE5YTI0NzZlZjJkMTYwMmRmMWMyZGNjYWI1NWE0NzJiMDBhZTJhMmFkOWQwZTNmNzRiNmI3CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHdpdGggdW5jaGVja2VkIHdvcmsgZ2l2ZXMgdGhlIGFnZW50IHRoZSBmaW5kaW5nIGFuZCB0aGUgdXNlciBhIGhlYWRsaW5lCTJkNTJlMTc5NDZjYTJjNjc4NjMyYTJkNjNkZjAzMmU3MjRkMWQwMzU3ZmM2MzliNmU2YmM1MGIxZWE5OWI4ODYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgZGVsaXZlcmVkIHRvIHRoZSBhZ2VudCBmb3IgdGhpcyB0cmVlIGlzIG5vdCBkZWxpdmVyZWQgYWdhaW4sIGFuZCBhIGNoYW5nZWQgdHJlZSBpcyBzYWlkIGFnYWluCTkwMjAwYmQ4YzAwZDAwOTIwMTc0MjRiNDIwYTFjYTU2ZDI3MTgyZmY1NWViYTM0ZWI0NDY4MTNkMWE1M2QxZWMKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIHNlY29uZCBTdG9wIGluIHRoZSBzYW1lIHR1cm4gYWRkcyBub3RoaW5nCWQzZjc5MmIwYjBmMWQ4Yzk0NjhhM2Q3MDM0MTU4ZTQ5M2FmYWE5MjMzY2I5NWQ0OTFmMTRhODgyYTgyZmZjMzAKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiBhcnRpZmFjdCBmaW5kaW5nIGltcG9ydGVkIG9uIGFuIGV2ZW50IHRoYXQgY2Fubm90IHJlYWNoIHRoZSBhZ2VudCBzdGF5cyBwZW5kaW5nIGZvciB0aGUgbmV4dCBTdG9wCTdlNWZiNDIzYTY1NzdkZTdkMTJmYzdmMGM1NzU2ZDRhZWVlYWI1MWZkMzQxODE4YjY0NTBhOGQ4YjgwODFkMDIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiB1bnJlYWRhYmxlIHByb2plY3QgY29uZmlndXJhdGlvbiBtZWFucyB0aGUgZGVmYXVsdCwgc2FpZCBhcyBzdWNoCTg2YTg1OTU4Njk1NTY2NTkwN2ZiODUyMTcyM2EyZGEyODI3ZTc5ZGM0NDZiNGZhZWExNjQ2YjJlYjMwOWQxOGIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwl0aGUgdGFzay1ldmlkZW5jZSBudWRnZSBoYXMgYW4gaWRlbnRpdHkgYW5kIGlzIHNhaWQgb25jZSBwZXIgdHJlZQljODlhMGIyNzZhYmU2ZTY5NWJjMTYyZjkyOWI4NmJiNDhjNzhmOTk4MWE1ZWJjYmIyNGZiMzAzMWYyZTU3YTFhCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkga2VlcHMgYSBmaW5kaW5nIHVzZXItb25seSwgYW5kIGFueSBvdGhlciB2YWx1ZSBtZWFucyBhZ2VudAlkY2UxYzYyMmQ2NTRkYmVmNmI0OWE5ZWEyODI4ODRjOGI0ZDk5OTM1MGI3M2IyNGVjOTViYTdiMzBjZTVlNWY0
  ```
  ```
- 2026-10-12 · fc3e9c47* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:8376
- 2026-10-12 · fc3e9c47* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:7451
- 2026-10-12 · fc3e9c47* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:7244
- 2026-10-12 · fc3e9c47* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:7665
- 2026-10-12 · fc3e9c47* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:0 · test-lock-sha256:6d9b2d98a1c01199de23e1e22b72802c489edbf2d3d58ee038d2f62de3222ef6 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJQ0xBVURFLm1kIHNlY3Rpb24gMyBuYW1lcyBhIHR1cm4gdGhhdCBjb250aW51ZXMgYXMgYW4gYWN0LCBub3QgYSByZWZ1c2FsCTk4MjkxOGI0NTFlOThhMWFiMmM2Njg0MTYxOWViZDlkN2RmZWJjN2ZjN2E0MWExOGM1YTZhZDY2OGEwNGQ1MGIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlTdWJhZ2VudFN0b3Agb3V0cHV0IGlzIHVuY2hhbmdlZAkwN2ZmOTM4NGEzZmE5YTI0NzZlZjJkMTYwMmRmMWMyZGNjYWI1NWE0NzJiMDBhZTJhMmFkOWQwZTNmNzRiNmI3CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHdpdGggdW5jaGVja2VkIHdvcmsgZ2l2ZXMgdGhlIGFnZW50IHRoZSBmaW5kaW5nIGFuZCB0aGUgdXNlciBhIGhlYWRsaW5lCTJkNTJlMTc5NDZjYTJjNjc4NjMyYTJkNjNkZjAzMmU3MjRkMWQwMzU3ZmM2MzliNmU2YmM1MGIxZWE5OWI4ODYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgZGVsaXZlcmVkIHRvIHRoZSBhZ2VudCBmb3IgdGhpcyB0cmVlIGlzIG5vdCBkZWxpdmVyZWQgYWdhaW4sIGFuZCBhIGNoYW5nZWQgdHJlZSBpcyBzYWlkIGFnYWluCTkwMjAwYmQ4YzAwZDAwOTIwMTc0MjRiNDIwYTFjYTU2ZDI3MTgyZmY1NWViYTM0ZWI0NDY4MTNkMWE1M2QxZWMKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIHNlY29uZCBTdG9wIGluIHRoZSBzYW1lIHR1cm4gYWRkcyBub3RoaW5nCWQzZjc5MmIwYjBmMWQ4Yzk0NjhhM2Q3MDM0MTU4ZTQ5M2FmYWE5MjMzY2I5NWQ0OTFmMTRhODgyYTgyZmZjMzAKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiBhcnRpZmFjdCBmaW5kaW5nIGltcG9ydGVkIG9uIGFuIGV2ZW50IHRoYXQgY2Fubm90IHJlYWNoIHRoZSBhZ2VudCBzdGF5cyBwZW5kaW5nIGZvciB0aGUgbmV4dCBTdG9wCTdlNWZiNDIzYTY1NzdkZTdkMTJmYzdmMGM1NzU2ZDRhZWVlYWI1MWZkMzQxODE4YjY0NTBhOGQ4YjgwODFkMDIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiB1bnJlYWRhYmxlIHByb2plY3QgY29uZmlndXJhdGlvbiBtZWFucyB0aGUgZGVmYXVsdCwgc2FpZCBhcyBzdWNoCTI1Nzk1ZGVmMWYwODhlMDJhZWZkMWE3ZjI5YzA5ZTdlMTg0NTMzYWJlYmMxZjQzMTA5OTcyZTNlZTdlZGJhNzEKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwl0aGUgdGFzay1ldmlkZW5jZSBudWRnZSBoYXMgYW4gaWRlbnRpdHkgYW5kIGlzIHNhaWQgb25jZSBwZXIgdHJlZQljODlhMGIyNzZhYmU2ZTY5NWJjMTYyZjkyOWI4NmJiNDhjNzhmOTk4MWE1ZWJjYmIyNGZiMzAzMWYyZTU3YTFhCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkga2VlcHMgYSBmaW5kaW5nIHVzZXItb25seSwgYW5kIGFueSBvdGhlciB2YWx1ZSBtZWFucyBhZ2VudAlkY2UxYzYyMmQ2NTRkYmVmNmI0OWE5ZWEyODI4ODRjOGI0ZDk5OTM1MGI3M2IyNGVjOTViYTdiMzBjZTVlNWY0 · test-lock-kind:replace
- 2026-10-12 · 812f099d* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:9203
- 2026-10-12 · 812f099d* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:0 · test-lock-sha256:7774b4d6435ff482c3a9ed929469de9da0459ed3300e6f8c426d8e8825fd557f · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJQ0xBVURFLm1kIHNlY3Rpb24gMyBuYW1lcyBhIHR1cm4gdGhhdCBjb250aW51ZXMgYXMgYW4gYWN0LCBub3QgYSByZWZ1c2FsCTk4MjkxOGI0NTFlOThhMWFiMmM2Njg0MTYxOWViZDlkN2RmZWJjN2ZjN2E0MWExOGM1YTZhZDY2OGEwNGQ1MGIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlTdWJhZ2VudFN0b3Agb3V0cHV0IGlzIHVuY2hhbmdlZAkwN2ZmOTM4NGEzZmE5YTI0NzZlZjJkMTYwMmRmMWMyZGNjYWI1NWE0NzJiMDBhZTJhMmFkOWQwZTNmNzRiNmI3CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHRoYXQgaGFzIGFscmVhZHkgY29udGludWVkIGl0cyB0dXJuIGFkZHMgbm90aGluZywgZXZlbiBmb3IgYSBmaW5kaW5nIHRoYXQgYXJyaXZlZCBzaW5jZQkwODE4YzY3Nzc4MTk4OGI4ODk2NGExYmJkMWE0MTk5MTY1YmQ4YmU2OWU5OGY5ZDMyYWJmZDA2ZTU5MWJkOGQ2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHdpdGggdW5jaGVja2VkIHdvcmsgZ2l2ZXMgdGhlIGFnZW50IHRoZSBmaW5kaW5nIGFuZCB0aGUgdXNlciBhIGhlYWRsaW5lCTJkNTJlMTc5NDZjYTJjNjc4NjMyYTJkNjNkZjAzMmU3MjRkMWQwMzU3ZmM2MzliNmU2YmM1MGIxZWE5OWI4ODYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgZGVsaXZlcmVkIHRvIHRoZSBhZ2VudCBmb3IgdGhpcyB0cmVlIGlzIG5vdCBkZWxpdmVyZWQgYWdhaW4sIGFuZCBhIGNoYW5nZWQgdHJlZSBpcyBzYWlkIGFnYWluCTkwMjAwYmQ4YzAwZDAwOTIwMTc0MjRiNDIwYTFjYTU2ZDI3MTgyZmY1NWViYTM0ZWI0NDY4MTNkMWE1M2QxZWMKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgaGFuZGVkIHRvIGEgc3ViYWdlbnQgaXMgc3RpbGwgdGhlIG1haW4gYWdlbnQncyB0byBoZWFyCTcwNTFhMDU5YTg3MWZhNTlhN2I3ZDhiMmJhZTU3ZTE2NzVlOGY3ODRmMWRkOThlODQ5OWEyYmMyZGU5YmJhM2QKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIHNlY29uZCBTdG9wIGluIHRoZSBzYW1lIHR1cm4gYWRkcyBub3RoaW5nCWQzZjc5MmIwYjBmMWQ4Yzk0NjhhM2Q3MDM0MTU4ZTQ5M2FmYWE5MjMzY2I5NWQ0OTFmMTRhODgyYTgyZmZjMzAKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiBhcnRpZmFjdCBmaW5kaW5nIGltcG9ydGVkIG9uIGFuIGV2ZW50IHRoYXQgY2Fubm90IHJlYWNoIHRoZSBhZ2VudCBzdGF5cyBwZW5kaW5nIGZvciB0aGUgbmV4dCBTdG9wCTYwNjI4YmUwMzYyNDY0OTFkOTdlZTE5ODEzYTNiYzlhY2Q0ODI2MjAxMjkwZDEzMTYwMGM2Nzg1MjVmNjkwYjYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiB1bnJlYWRhYmxlIHByb2plY3QgY29uZmlndXJhdGlvbiBtZWFucyB0aGUgZGVmYXVsdCwgc2FpZCBhcyBzdWNoCTZjNzk5YWEyOTNjMzdiMGE0OGJlM2Y4MjZiN2M4ZTAzNzVlM2QwNTc1MWM0MjczMDRhMDcyYzI1NWZjMjRmNjgKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwl0aGUgdGFzay1ldmlkZW5jZSBudWRnZSBoYXMgYW4gaWRlbnRpdHkgYW5kIGlzIHNhaWQgb25jZSBwZXIgdHJlZQljODlhMGIyNzZhYmU2ZTY5NWJjMTYyZjkyOWI4NmJiNDhjNzhmOTk4MWE1ZWJjYmIyNGZiMzAzMWYyZTU3YTFhCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkgaG9sZHMgd2hlbiB0aGUgd29ya2luZyBkaXJlY3RvcnkgaGFzIGJlZW4gZGVsZXRlZAlmMTg1NzU1ZmI0MDNmMDNlNTkzZmNjODg0YzNjNjM4YTVjNWFlNGQxYzY2M2M1OTNjMDgzOTFmYTBhYWM1YjE1CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkga2VlcHMgYSBmaW5kaW5nIHVzZXItb25seSwgYW5kIGFueSBvdGhlciB2YWx1ZSBtZWFucyBhZ2VudAlkY2UxYzYyMmQ2NTRkYmVmNmI0OWE5ZWEyODI4ODRjOGI0ZDk5OTM1MGI3M2IyNGVjOTViYTdiMzBjZTVlNWY0 · test-lock-kind:replace
- 2026-10-19 · f07020a3* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:9264e93986c9c804902224312d27b27199f3efc509c40d16d16a809faba9ae71 · ms:0 · test-lock-sha256:645f3dd5aa60059e8bc46a1c2e306083c0c500d4fac1809149b4490694d8d99f · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJQ0xBVURFLm1kIHNlY3Rpb24gMyBuYW1lcyBhIHR1cm4gdGhhdCBjb250aW51ZXMgYXMgYW4gYWN0LCBub3QgYSByZWZ1c2FsCTM1ZWE2MjQzYzcwZThhZjFkYjlkMzQ4Y2I1ZmY2ODY3YTlmZWRlMWE5YTYzNDdiYmQzNDVhNWFiNDE0NDc4OWQKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlTdWJhZ2VudFN0b3Agb3V0cHV0IGlzIHVuY2hhbmdlZAkwN2ZmOTM4NGEzZmE5YTI0NzZlZjJkMTYwMmRmMWMyZGNjYWI1NWE0NzJiMDBhZTJhMmFkOWQwZTNmNzRiNmI3CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHRoYXQgaGFzIGFscmVhZHkgY29udGludWVkIGl0cyB0dXJuIGFkZHMgbm90aGluZywgZXZlbiBmb3IgYSBmaW5kaW5nIHRoYXQgYXJyaXZlZCBzaW5jZQkwODE4YzY3Nzc4MTk4OGI4ODk2NGExYmJkMWE0MTk5MTY1YmQ4YmU2OWU5OGY5ZDMyYWJmZDA2ZTU5MWJkOGQ2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHdpdGggdW5jaGVja2VkIHdvcmsgZ2l2ZXMgdGhlIGFnZW50IHRoZSBmaW5kaW5nIGFuZCB0aGUgdXNlciBhIGhlYWRsaW5lCTJkNTJlMTc5NDZjYTJjNjc4NjMyYTJkNjNkZjAzMmU3MjRkMWQwMzU3ZmM2MzliNmU2YmM1MGIxZWE5OWI4ODYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgZGVsaXZlcmVkIHRvIHRoZSBhZ2VudCBmb3IgdGhpcyB0cmVlIGlzIG5vdCBkZWxpdmVyZWQgYWdhaW4sIGFuZCBhIGNoYW5nZWQgdHJlZSBpcyBzYWlkIGFnYWluCTkwMjAwYmQ4YzAwZDAwOTIwMTc0MjRiNDIwYTFjYTU2ZDI3MTgyZmY1NWViYTM0ZWI0NDY4MTNkMWE1M2QxZWMKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgaGFuZGVkIHRvIGEgc3ViYWdlbnQgaXMgc3RpbGwgdGhlIG1haW4gYWdlbnQncyB0byBoZWFyCTcwNTFhMDU5YTg3MWZhNTlhN2I3ZDhiMmJhZTU3ZTE2NzVlOGY3ODRmMWRkOThlODQ5OWEyYmMyZGU5YmJhM2QKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIHNlY29uZCBTdG9wIGluIHRoZSBzYW1lIHR1cm4gYWRkcyBub3RoaW5nCWQzZjc5MmIwYjBmMWQ4Yzk0NjhhM2Q3MDM0MTU4ZTQ5M2FmYWE5MjMzY2I5NWQ0OTFmMTRhODgyYTgyZmZjMzAKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiBhcnRpZmFjdCBmaW5kaW5nIGltcG9ydGVkIG9uIGFuIGV2ZW50IHRoYXQgY2Fubm90IHJlYWNoIHRoZSBhZ2VudCBzdGF5cyBwZW5kaW5nIGZvciB0aGUgbmV4dCBTdG9wCTYwNjI4YmUwMzYyNDY0OTFkOTdlZTE5ODEzYTNiYzlhY2Q0ODI2MjAxMjkwZDEzMTYwMGM2Nzg1MjVmNjkwYjYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiB1bnJlYWRhYmxlIHByb2plY3QgY29uZmlndXJhdGlvbiBtZWFucyB0aGUgZGVmYXVsdCwgc2FpZCBhcyBzdWNoCTZjNzk5YWEyOTNjMzdiMGE0OGJlM2Y4MjZiN2M4ZTAzNzVlM2QwNTc1MWM0MjczMDRhMDcyYzI1NWZjMjRmNjgKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwl0aGUgdGFzay1ldmlkZW5jZSBudWRnZSBoYXMgYW4gaWRlbnRpdHkgYW5kIGlzIHNhaWQgb25jZSBwZXIgdHJlZQljODlhMGIyNzZhYmU2ZTY5NWJjMTYyZjkyOWI4NmJiNDhjNzhmOTk4MWE1ZWJjYmIyNGZiMzAzMWYyZTU3YTFhCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkgaG9sZHMgd2hlbiB0aGUgd29ya2luZyBkaXJlY3RvcnkgaGFzIGJlZW4gZGVsZXRlZAlmMTg1NzU1ZmI0MDNmMDNlNTkzZmNjODg0YzNjNjM4YTVjNWFlNGQxYzY2M2M1OTNjMDgzOTFmYTBhYWM1YjE1CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkga2VlcHMgYSBmaW5kaW5nIHVzZXItb25seSwgYW5kIGFueSBvdGhlciB2YWx1ZSBtZWFucyBhZ2VudAlkY2UxYzYyMmQ2NTRkYmVmNmI0OWE5ZWEyODI4ODRjOGI0ZDk5OTM1MGI3M2IyNGVjOTViYTdiMzBjZTVlNWY0 · test-lock-kind:replace
