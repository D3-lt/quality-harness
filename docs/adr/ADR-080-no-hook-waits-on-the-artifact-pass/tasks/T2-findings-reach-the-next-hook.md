# Task ADR-080-T2: Every hook but a reviewer's imports the pass's verdicts and says each finding once

**Depends-on:** T1
**Covers:** F-5, F-6, UC2-S1, UC2-S2
**Estimated scope:** S (one import-and-say step, two tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** the `pass.gated` ledger line (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a finding is said by the next hook`, `a reviewer's PreToolUse does not import`

## Goal

Every lifecycle hook except a read-only reviewer's PreToolUse imports the pass's new verdicts and says each finding once, whether or not the pass has ended (ADR-080 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | an import-and-say step in `handleHook`, after `guardAlone` is decided and only when it is false |
| `tests/artifact-pass-behind.test.mjs` | edit | remove `todo` from this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the two tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] In `handleHook`, when `guardAlone` is false, import `pass.gated` lines not yet in the session log as `artifact.gated` naming the pass, and queue each finding as rule A keyed by path and identity.
3. [S3] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/artifact-pass-behind.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE "ok [0-9]+ - (a pass's findings reach the next hook once, while the pass still runs|a read-only reviewer neither imports nor delivers a pass finding)" "$T")" -eq 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a pass's findings reach the next hook once, while the pass still runs` | `tests/artifact-pass-behind.test.mjs` | said by the next hook while the lock is held; not by the one after | F-5, UC2-S1 | S2 |
| `a read-only reviewer neither imports nor delivers a pass finding` | `tests/artifact-pass-behind.test.mjs` | the reviewer is told nothing and writes nothing; the parent's next hook says it | F-6, UC2-S2 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | the step in `handleHook` |
| 3 — the caller can discover it | the rule A line the session sees |
| 4 — it is used | every adopter session after a pass with findings |

## Mutation Log
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a finding is said by the next hook: no hook but a boundary imports the ledger · acceptance-sha256:faf1ef9263717c733b8e2d7d9588dd2d9b7be7436f7e7a2c72bbd6bbc044a57d · covers:a finding is said by the next hook
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a reviewer's PreToolUse does not import: the reviewer guard no longer fences the import · acceptance-sha256:faf1ef9263717c733b8e2d7d9588dd2d9b7be7436f7e7a2c72bbd6bbc044a57d · covers:a reviewer's PreToolUse does not import

## Invariants

- A finding is said once per path and identity (`action.emitted`, rule A).
- A read-only reviewer's PreToolUse reads and writes nothing of the parent's.

## Risks

- None beyond T1's.

## Stop Condition

Stop and ask if delivering needs the pass to write the session log.

## Out of Scope

- The pass itself — T1.

## Verification Log
- 2026-10-01 · 9ed651c* · exit 1 · `set -o pipefail …` · acceptance-sha256:faf1ef9263717c733b8e2d7d9588dd2d9b7be7436f7e7a2c72bbd6bbc044a57d · ms:18807 · test-lock-sha256:27b607ac4b10ebe97db2504e203b5a6e9ab2e770ac5f6cb44f7b5247df348064 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBwYXNzIHRoYXQgY2Fubm90IHN0YXJ0IGlzIHNhaWQsIG5vdCBzaWxlbnQJNzI4MmI2MTQ5MGRhMGU5M2Y4NjAzYWFiNjllODczYWQzNzg4Mjg1MWI3NjA2ZWIyNTI2ZjI5YjQzMjZjZTBjMgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcGFzcydzIGZpbmRpbmdzIHJlYWNoIHRoZSBuZXh0IGhvb2sgb25jZSwgd2hpbGUgdGhlIHBhc3Mgc3RpbGwgcnVucwk4ZDIzNDVjODFmNTY4YmM3ZmNmOTEyNTliYjVhZGViNDhmNGEyMGE1YjA0ZTQ3NmVhN2ExNDU3MDcxYjdkYmZkCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSByZWFkLW9ubHkgcmV2aWV3ZXIgbmVpdGhlciBpbXBvcnRzIG5vciBkZWxpdmVycyBhIHBhc3MgZmluZGluZwk1YmViYzQxYzhlNzUzNzkxNDY1MDNjM2U2MDkwYzE1ZmRjOGY2MzE4YmQ4YTEyOTE5YTM3YzZlZTU2OTEwMWQyCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSByZWZ1c2VkIHB1Ymxpc2ggaXMgZGVuaWVkIGV2ZXJ5IHRpbWUJMzc3N2Y5NDU0NTAyMGJiYTE3MjMzYjk2ODA3YTJlYWU3MDdlMzcxZTIxMjBmMjExNjQzZWRlY2E0ZGJlYjRlNwpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgc3RvcHBlZCBwYXNzIHJlc3VtZXMgd2l0aCBleGFjdGx5IHRoZSBwYXRocyBpdCBkaWQgbm90IHJlYWNoCThkMzUyNTBlYjRiZjdjNGVhYzExZjZkN2E2OWIwODgyZGUxMjdjNWU0Y2M5NDYxNGJjNjA2ZGJhZDI4ZmVlMjUKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwlubyBib3VuZGFyeSB3YWl0cyBmb3IgdGhlIGFydGlmYWN0IHBhc3MJNzgzMjQ1ODQ1MzBiYTQ1ZThkNDRmNzg3NzM2YTUzNGQyNzcyOGI2YWViNDJlYWI0MzM5OTgwYzcwMmZlYzc4Mwpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCW9uZSBhcnRpZmFjdCBwYXNzIHJ1bnMgcGVyIHNlc3Npb24gYXQgYSB0aW1lCTkzYWRjNjFhMDRiMjA1OTgyOTJjMTJlMzc1YzQ0YmYyZTIwYTYzMjdiNWQ4MWQ3N2Q2MDNlYzlmYWIwMzgzYmEKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwl0aGUgcGFzcyB3cml0ZXMgb25seSBpdHMgb3duIGxlZGdlcgk1ZWZmNzk3OWFmYTMwZGIxNGMyMGNlZDI2MGM2ODBiNzk0Y2NhZmExZTk2YTJkYWI5ZTJjYjMwM2EyODk0ZDg0CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJdGhlIHVuY2hlY2tlZCBhZHZpc29yeSBpcyBzYWlkIG9uY2UgcGVyIHRyZWUgYW5kIGNoZWNrIHN0YXRlCTJhMmVjODBjNmZiNGIyNTA0M2VkZGI4Mjc1NWQzZWRhMTBlYTBmYzc1OGQyZmRmMzZiYzA2NTZhNTNjYjBlMTY
  ```
  --- last 10 line(s) of stdout (of 88 after folding 88 raw)
    ...
  1..9
  # tests 9
  # suites 0
  # pass 7
  # fail 2
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 18665.676834
  ```
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:faf1ef9263717c733b8e2d7d9588dd2d9b7be7436f7e7a2c72bbd6bbc044a57d · ms:19053
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:faf1ef9263717c733b8e2d7d9588dd2d9b7be7436f7e7a2c72bbd6bbc044a57d · ms:18607
- 2026-10-01 · 7f0fd0f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:faf1ef9263717c733b8e2d7d9588dd2d9b7be7436f7e7a2c72bbd6bbc044a57d · ms:0 · test-lock-sha256:2e3904fee2419db2b4bbeba2f9ea0d0eff25a30b058542781cf9eeb6ac8af5cc · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBiYXRjaCB0aGF0IHN0b3BwZWQgb24gdW5jb25maXJtZWQgY2xlYW51cCBzdG9wcyB0aGUgd2hvbGUgcGFzcwk3ODM5YjY0YWEyY2ExN2IyOGNiYTdiMTgwZmY5ZjZkZjBiZTA1MTdjOTdhOGVmNDIwMWY0MjI0MmRkYmRlOTZjCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBwYXNzIHJlbGVhc2VzIGl0cyBsb2NrIGJlZm9yZSBpdHMgZGVhZGxpbmUsIGFuZCBuZXZlciBhZnRlcglhNDA5NGNmYmVmMzhlZDJlYzEwMGI4MzhjZjVmY2Y0MzY5OTM5OGRmYjVmNWY0YjNiZTg0MDNkODgwYWZjN2M0CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBwYXNzIHRoYXQgY2Fubm90IHN0YXJ0IGlzIHNhaWQsIG5vdCBzaWxlbnQJNzI4MmI2MTQ5MGRhMGU5M2Y4NjAzYWFiNjllODczYWQzNzg4Mjg1MWI3NjA2ZWIyNTI2ZjI5YjQzMjZjZTBjMgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcGFzcyB0aGF0IGxlYXZlcyBubyBlbmQgaW4gaXRzIGxlZGdlciBpcyBzYWlkIFVOUlVOCTRlZTM0YjEwYzZmYjJmNWM1M2Q0MzNkMTc5Yjc3MTE3MmVmY2QyNmE2MmFmYzlmMThkMWIwNzZlMTY3MWFiODgKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwlhIHBhc3MncyBmaW5kaW5ncyByZWFjaCB0aGUgbmV4dCBob29rIG9uY2UsIHdoaWxlIHRoZSBwYXNzIHN0aWxsIHJ1bnMJOGQyMzQ1YzgxZjU2OGJjN2ZjZjkxMjU5YmI1YWRlYjQ4ZjRhMjBhNWIwNGU0NzZlYTdhMTQ1NzA3MWI3ZGJmZApib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcmVhZC1vbmx5IHJldmlld2VyIG5laXRoZXIgaW1wb3J0cyBub3IgZGVsaXZlcnMgYSBwYXNzIGZpbmRpbmcJNWJlYmM0MWM4ZTc1Mzc5MTQ2NTAzYzNlNjA5MGMxNWZkYzhmNjMxOGJkOGExMjkxOWEzN2M2ZWU1NjkxMDFkMgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcmVmdXNlZCBwdWJsaXNoIGlzIGRlbmllZCBldmVyeSB0aW1lCTcwYTlhZGRmZTNkYmE3Yzk4MWFjYmYzZjExNzRkZTliOTY3YzYyODA4NWYwNGRmODVmZjQwYzFhYzg1YTY5ZjQKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwlhIHN0b3BwZWQgcGFzcyByZXN1bWVzIHdpdGggZXhhY3RseSB0aGUgcGF0aHMgaXQgZGlkIG5vdCByZWFjaAk4ZDM1MjUwZWI0YmY3YzRlYWMxMWY2ZDdhNjliMDg4MmRlMTI3YzVlNGNjOTQ2MTRiYzYwNmRiYWQyOGZlZTI1CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSB0aW1lb3V0IHNhaWQgZmlyc3QgZG9lcyBub3Qgc2lsZW5jZSBhIGxhdGVyIGZpbmRpbmcgYWJvdXQgdGhlIHNhbWUgYnl0ZXMJNDZjYjc4NzBkNzRhNTE1ZGY4NjZjZGNhZDk4ZThlMzY1ODBkYTE3ZGRkMmM1M2VlMjc4OWVhNTllY2ZjYTJlMQpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCW5vIGJvdW5kYXJ5IHdhaXRzIGZvciB0aGUgYXJ0aWZhY3QgcGFzcwk3ODMyNDU4NDUzMGJhNDVlOGQ0NGY3ODc3MzZhNTM0ZDI3NzI4YjZhZWI0MmVhYjQzMzk5ODBjNzAyZmVjNzgzCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJb25lIGFydGlmYWN0IHBhc3MgcnVucyBwZXIgc2Vzc2lvbiBhdCBhIHRpbWUJOTNhZGM2MWEwNGIyMDU5ODI5MmMxMmUzNzVjNDRiZjJlMjBhNjMyN2I1ZDgxZDc3ZDYwM2VjOWZhYjAzODNiYQpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCXRoZSBwYXNzIHdyaXRlcyBvbmx5IGl0cyBvd24gbGVkZ2VyCTVlZmY3OTc5YWZhMzBkYjE0YzIwY2VkMjYwYzY4MGI3OTRjY2FmYTFlOTZhMmRhYjllMmNiMzAzYTI4OTRkODQKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwl0aGUgdW5jaGVja2VkIGFkdmlzb3J5IGlzIHNhaWQgb25jZSBwZXIgdHJlZSBhbmQgY2hlY2sgc3RhdGUJMmEyZWM4MGM2ZmI0YjI1MDQzZWRkYjgyNzU1ZDNlZGExMGVhMGZjNzU4ZDJmZGYzNmJjMDY1NmE1M2NiMGUxNgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCXR3byBjbGFpbWFudHMgb2Ygb25lIHN0YWxlIGxvY2s6IGV4YWN0bHkgb25lIGhvbGRzIGl0CWNmNTVhZTU0MjA0M2JiMmIyMDc2ODQzOGY4YzViNDNmYTE0NDg4NTZmZGIxZmE1MWEwMzhhYTk3MzljYTUxYWQ · test-lock-kind:replace
