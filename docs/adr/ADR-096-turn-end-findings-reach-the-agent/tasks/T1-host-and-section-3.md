# Task ADR-096-T1: the host continues a turn on Stop context, and §3 names it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one live probe, one paragraph, one test)
**Owner:** unassigned
**Produces:** a live observation that Stop `additionalContext` reaches the main agent and continues its turn; the CLAUDE.md §3 sentence
**Consumes:** none
**Data dependency:** live session (a Claude Code session on this machine; the probe hook lives in a scratch project, never in the plugin)
**Proof map:** v1
**Rests-on:** `the rulebook says what the hook does`

## Goal

Before any behaviour changes, confirm on the installed host that a Stop hook's `additionalContext` reaches the main agent and continues
the turn once, and write into CLAUDE.md §3 that a hook may continue a turn to hand the agent a finding, as an act and not a refusal.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `CLAUDE.md` | edit | §3: one sentence naming a continued turn as an allowed act; still exactly two refusals |
| `.claude/rules/03-gates-advise.md` | edit | the evidence: ADR-096's counts and the host probe |
| `tests/turn-end-delivery.test.mjs` | add | the test below |

## Ordered Steps

1. [S1] Write the test and record the red run (TDD red).
2. [S2] In a scratch project (outside this repository), register a Stop hook that prints `{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"<a unique marker>"}}` unless `stop_hook_active` is true; run one turn and record whether the agent quotes the marker and whether the turn continued exactly once; record the Claude Code version. [proof: human: the agent quoted the marker after one continuation, on the recorded version]
3. [S3] Edit §3 and its rule file.

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \
  && for t in 'CLAUDE.md section 3 names a turn that continues as an act, not a refusal'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `CLAUDE.md section 3 names a turn that continues as an act, not a refusal` | `tests/turn-end-delivery.test.mjs` | CLAUDE.md §3 contains the sentence naming a continued turn and still names exactly two refusals | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test and the sentence |
| 2 — something selects it | CLAUDE.md is loaded into every session in this repository |
| 3 — the caller can discover it | §3 is where a reader looks for what a gate may do |
| 4 — it is used | S2's live probe |

## Mutation Log
- 2026-10-12 · e08ab124* · mutant killed · exit 1 · `CLAUDE.md` · section 3 no longer says a hook may continue a turn · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · covers:the rulebook says what the hook does

## Invariants

- §3 still names exactly two refusals.
- Nothing in `plugin/` changes in this task.

## Risks

- The host behaves differently from the reference: then T2 does not start (Stop Condition).

## Stop Condition

Stop and ask if the probe shows the marker did not reach the agent, or the turn continued more than once.

## Out of Scope

- Rewriting ADR-035 (permanent: boundary: records are history; ADR-096's Invalidates header carries the correction)

## Verification Log
- 2026-10-12 · e08ab124* · exit 1 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · ms:202 · test-lock-sha256:ab2f9d699b6731d5b4eba39c093821d5d072ec47cdecb63d6370f2037c315a01 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJQ0xBVURFLm1kIHNlY3Rpb24gMyBuYW1lcyBhIHR1cm4gdGhhdCBjb250aW51ZXMgYXMgYW4gYWN0LCBub3QgYSByZWZ1c2FsCTk4MjkxOGI0NTFlOThhMWFiMmM2Njg0MTYxOWViZDlkN2RmZWJjN2ZjN2E0MWExOGM1YTZhZDY2OGEwNGQ1MGI
  ```
  ```
- 2026-10-12 · e08ab124* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · ms:243
- 2026-10-12 · human-observed · observed: S2 on Claude Code 2.1.296 a Stop hook in a scratch project returned a marker as additionalContext and the headless agent replied OK followed by the marker; the hook ran twice, the second time with stop_hook_active true, so the turn continued exactly once
- 2026-10-12 · human-observed · observed: S2 on Claude Code 2.1.296 a turn-end hook in a scratch project returned a marker as additionalContext and the headless agent replied OK followed by the marker; the hook ran twice, the second time with stop_hook_active true, so the turn continued exactly once
- 2026-10-12 · human-observed · observed: S2 on Claude Code 2.1.296 a turn-end hook in a scratch project returned a marker as additionalContext and the headless agent replied OK followed by the marker; the hook ran twice, the second time with the host's continuation flag set, so the turn continued exactly once
- 2026-10-12 · fc3e9c47* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · ms:0 · test-lock-sha256:6d9b2d98a1c01199de23e1e22b72802c489edbf2d3d58ee038d2f62de3222ef6 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJQ0xBVURFLm1kIHNlY3Rpb24gMyBuYW1lcyBhIHR1cm4gdGhhdCBjb250aW51ZXMgYXMgYW4gYWN0LCBub3QgYSByZWZ1c2FsCTk4MjkxOGI0NTFlOThhMWFiMmM2Njg0MTYxOWViZDlkN2RmZWJjN2ZjN2E0MWExOGM1YTZhZDY2OGEwNGQ1MGIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlTdWJhZ2VudFN0b3Agb3V0cHV0IGlzIHVuY2hhbmdlZAkwN2ZmOTM4NGEzZmE5YTI0NzZlZjJkMTYwMmRmMWMyZGNjYWI1NWE0NzJiMDBhZTJhMmFkOWQwZTNmNzRiNmI3CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHdpdGggdW5jaGVja2VkIHdvcmsgZ2l2ZXMgdGhlIGFnZW50IHRoZSBmaW5kaW5nIGFuZCB0aGUgdXNlciBhIGhlYWRsaW5lCTJkNTJlMTc5NDZjYTJjNjc4NjMyYTJkNjNkZjAzMmU3MjRkMWQwMzU3ZmM2MzliNmU2YmM1MGIxZWE5OWI4ODYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgZGVsaXZlcmVkIHRvIHRoZSBhZ2VudCBmb3IgdGhpcyB0cmVlIGlzIG5vdCBkZWxpdmVyZWQgYWdhaW4sIGFuZCBhIGNoYW5nZWQgdHJlZSBpcyBzYWlkIGFnYWluCTkwMjAwYmQ4YzAwZDAwOTIwMTc0MjRiNDIwYTFjYTU2ZDI3MTgyZmY1NWViYTM0ZWI0NDY4MTNkMWE1M2QxZWMKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIHNlY29uZCBTdG9wIGluIHRoZSBzYW1lIHR1cm4gYWRkcyBub3RoaW5nCWQzZjc5MmIwYjBmMWQ4Yzk0NjhhM2Q3MDM0MTU4ZTQ5M2FmYWE5MjMzY2I5NWQ0OTFmMTRhODgyYTgyZmZjMzAKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiBhcnRpZmFjdCBmaW5kaW5nIGltcG9ydGVkIG9uIGFuIGV2ZW50IHRoYXQgY2Fubm90IHJlYWNoIHRoZSBhZ2VudCBzdGF5cyBwZW5kaW5nIGZvciB0aGUgbmV4dCBTdG9wCTdlNWZiNDIzYTY1NzdkZTdkMTJmYzdmMGM1NzU2ZDRhZWVlYWI1MWZkMzQxODE4YjY0NTBhOGQ4YjgwODFkMDIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiB1bnJlYWRhYmxlIHByb2plY3QgY29uZmlndXJhdGlvbiBtZWFucyB0aGUgZGVmYXVsdCwgc2FpZCBhcyBzdWNoCTI1Nzk1ZGVmMWYwODhlMDJhZWZkMWE3ZjI5YzA5ZTdlMTg0NTMzYWJlYmMxZjQzMTA5OTcyZTNlZTdlZGJhNzEKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwl0aGUgdGFzay1ldmlkZW5jZSBudWRnZSBoYXMgYW4gaWRlbnRpdHkgYW5kIGlzIHNhaWQgb25jZSBwZXIgdHJlZQljODlhMGIyNzZhYmU2ZTY5NWJjMTYyZjkyOWI4NmJiNDhjNzhmOTk4MWE1ZWJjYmIyNGZiMzAzMWYyZTU3YTFhCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkga2VlcHMgYSBmaW5kaW5nIHVzZXItb25seSwgYW5kIGFueSBvdGhlciB2YWx1ZSBtZWFucyBhZ2VudAlkY2UxYzYyMmQ2NTRkYmVmNmI0OWE5ZWEyODI4ODRjOGI0ZDk5OTM1MGI3M2IyNGVjOTViYTdiMzBjZTVlNWY0 · test-lock-kind:replace
- 2026-10-12 · 812f099d* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · ms:9311
- 2026-10-12 · 812f099d* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · ms:0 · test-lock-sha256:7774b4d6435ff482c3a9ed929469de9da0459ed3300e6f8c426d8e8825fd557f · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJQ0xBVURFLm1kIHNlY3Rpb24gMyBuYW1lcyBhIHR1cm4gdGhhdCBjb250aW51ZXMgYXMgYW4gYWN0LCBub3QgYSByZWZ1c2FsCTk4MjkxOGI0NTFlOThhMWFiMmM2Njg0MTYxOWViZDlkN2RmZWJjN2ZjN2E0MWExOGM1YTZhZDY2OGEwNGQ1MGIKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlTdWJhZ2VudFN0b3Agb3V0cHV0IGlzIHVuY2hhbmdlZAkwN2ZmOTM4NGEzZmE5YTI0NzZlZjJkMTYwMmRmMWMyZGNjYWI1NWE0NzJiMDBhZTJhMmFkOWQwZTNmNzRiNmI3CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHRoYXQgaGFzIGFscmVhZHkgY29udGludWVkIGl0cyB0dXJuIGFkZHMgbm90aGluZywgZXZlbiBmb3IgYSBmaW5kaW5nIHRoYXQgYXJyaXZlZCBzaW5jZQkwODE4YzY3Nzc4MTk4OGI4ODk2NGExYmJkMWE0MTk5MTY1YmQ4YmU2OWU5OGY5ZDMyYWJmZDA2ZTU5MWJkOGQ2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBTdG9wIHdpdGggdW5jaGVja2VkIHdvcmsgZ2l2ZXMgdGhlIGFnZW50IHRoZSBmaW5kaW5nIGFuZCB0aGUgdXNlciBhIGhlYWRsaW5lCTJkNTJlMTc5NDZjYTJjNjc4NjMyYTJkNjNkZjAzMmU3MjRkMWQwMzU3ZmM2MzliNmU2YmM1MGIxZWE5OWI4ODYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgZGVsaXZlcmVkIHRvIHRoZSBhZ2VudCBmb3IgdGhpcyB0cmVlIGlzIG5vdCBkZWxpdmVyZWQgYWdhaW4sIGFuZCBhIGNoYW5nZWQgdHJlZSBpcyBzYWlkIGFnYWluCTkwMjAwYmQ4YzAwZDAwOTIwMTc0MjRiNDIwYTFjYTU2ZDI3MTgyZmY1NWViYTM0ZWI0NDY4MTNkMWE1M2QxZWMKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIGZpbmRpbmcgaGFuZGVkIHRvIGEgc3ViYWdlbnQgaXMgc3RpbGwgdGhlIG1haW4gYWdlbnQncyB0byBoZWFyCTcwNTFhMDU5YTg3MWZhNTlhN2I3ZDhiMmJhZTU3ZTE2NzVlOGY3ODRmMWRkOThlODQ5OWEyYmMyZGU5YmJhM2QKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhIHNlY29uZCBTdG9wIGluIHRoZSBzYW1lIHR1cm4gYWRkcyBub3RoaW5nCWQzZjc5MmIwYjBmMWQ4Yzk0NjhhM2Q3MDM0MTU4ZTQ5M2FmYWE5MjMzY2I5NWQ0OTFmMTRhODgyYTgyZmZjMzAKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiBhcnRpZmFjdCBmaW5kaW5nIGltcG9ydGVkIG9uIGFuIGV2ZW50IHRoYXQgY2Fubm90IHJlYWNoIHRoZSBhZ2VudCBzdGF5cyBwZW5kaW5nIGZvciB0aGUgbmV4dCBTdG9wCTYwNjI4YmUwMzYyNDY0OTFkOTdlZTE5ODEzYTNiYzlhY2Q0ODI2MjAxMjkwZDEzMTYwMGM2Nzg1MjVmNjkwYjYKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwlhbiB1bnJlYWRhYmxlIHByb2plY3QgY29uZmlndXJhdGlvbiBtZWFucyB0aGUgZGVmYXVsdCwgc2FpZCBhcyBzdWNoCTZjNzk5YWEyOTNjMzdiMGE0OGJlM2Y4MjZiN2M4ZTAzNzVlM2QwNTc1MWM0MjczMDRhMDcyYzI1NWZjMjRmNjgKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWxpdmVyeS50ZXN0Lm1qcwl0aGUgdGFzay1ldmlkZW5jZSBudWRnZSBoYXMgYW4gaWRlbnRpdHkgYW5kIGlzIHNhaWQgb25jZSBwZXIgdHJlZQljODlhMGIyNzZhYmU2ZTY5NWJjMTYyZjkyOWI4NmJiNDhjNzhmOTk4MWE1ZWJjYmIyNGZiMzAzMWYyZTU3YTFhCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkgaG9sZHMgd2hlbiB0aGUgd29ya2luZyBkaXJlY3RvcnkgaGFzIGJlZW4gZGVsZXRlZAlmMTg1NzU1ZmI0MDNmMDNlNTkzZmNjODg0YzNjNjM4YTVjNWFlNGQxYzY2M2M1OTNjMDgzOTFmYTBhYWM1YjE1CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdHVybkVuZCBub3RpZnkga2VlcHMgYSBmaW5kaW5nIHVzZXItb25seSwgYW5kIGFueSBvdGhlciB2YWx1ZSBtZWFucyBhZ2VudAlkY2UxYzYyMmQ2NTRkYmVmNmI0OWE5ZWEyODI4ODRjOGI0ZDk5OTM1MGI3M2IyNGVjOTViYTdiMzBjZTVlNWY0 · test-lock-kind:replace
