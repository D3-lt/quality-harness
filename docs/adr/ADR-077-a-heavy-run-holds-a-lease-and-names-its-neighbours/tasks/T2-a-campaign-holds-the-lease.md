# Task ADR-077-T2: A campaign holds the same lease, covering its child

**Depends-on:** T1
**Covers:** F-1, F-11, F-12, UC3-S1, UC3-S2
**Estimated scope:** M (one caller, its child, its tests' environment, three tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** `take`, `mark`, `observe`, `release`, `leaseDir` and `alive` in `plugin/scripts/lease.mjs` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a campaign holds a lease with its child`, `a killed parent's lease stays while its child works`, `a campaign waits when asked`, `a campaign's tests have a private lease directory`, `the suite has a private lease directory`

## Goal

A campaign run by `scripts/mutate.mjs` — isolated or in place — takes the same lease as `qh-check`. The lease records the isolated child and its group, so it is live while any of them lives. The campaign waits when asked, and its tests and fixtures use private lease directories (ADR-077 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | take the lease before the selection; add the child and group once spawned; release after ADR-075's group-ended wait; `--wait` in `KNOWN` and the usage; `childEnv` sets a private lease directory; import `alive` from the module |
| `tests/campaign-fixture.mjs` | edit | `campaignEnv` sets a private lease directory and clears `QUALITY_HARNESS_WAIT` |
| `tests/lease.test.mjs` | edit | remove `todo` from the campaign tests |
| `tests/mutations.json` | edit | this task's entries |

## Ordered Steps

1. [S1] Remove `todo` from the two campaign tests and the private-directory test, and record the red run (TDD red). [proof: acceptance]
2. [S2] Take the lease in the parent before the selection runs; skip it under `QUALITY_HARNESS_CAMPAIGN_CHILD`. Add the child's pid and, on POSIX, its group once spawned. Release only after ADR-075's group-ended wait confirms the end.
3. [S3] `--wait` and `QUALITY_HARNESS_WAIT`: wait under T1's admission before the selection runs; add `--wait` to `KNOWN` and the usage line.
4. [S4] `childEnv` sets `QUALITY_HARNESS_LEASE_DIR` inside the child's scratch; `campaignEnv` sets one per call and clears `QUALITY_HARNESS_WAIT`.
5. [S5] Replace `mutate.mjs`'s own `alive` with the module's, whose unknown answer the ownership lock treats as alive.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/lease.test.mjs tests/mutate-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a campaign holds a lease that records its isolated child, and releases it at its end|a campaign.s tests and the selftest use a private lease directory|a campaign asked to wait starts its suite only after the running lease is released|a campaign leaves the working tree byte-identical and its mutants never appear there)' "$T")" -eq 4 && test "$(grep -cxE 'ok [0-9]+ - a killed campaign parent.s lease stays live while its child works( # SKIP Windows ends the child with its parent \(ADR-075\))?' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a campaign holds a lease that records its isolated child, and releases it at its end` | `tests/lease.test.mjs` | one lease naming the parent and its child; none after | F-1, UC3-S1 | S2 |
| `a killed campaign parent's lease stays live while its child works` | `tests/lease.test.mjs` | named while the child works, gone once it ends (POSIX) | F-11, UC3-S2 | S2 |
| `a campaign's tests and the selftest use a private lease directory` | `tests/lease.test.mjs` | `childEnv`'s half | F-12 | S4 |
| `a campaign asked to wait starts its suite only after the running lease is released` | `tests/lease.test.mjs` | no suite runs while a neighbour's lease is running | — | S3 |
| `a campaign leaves the working tree byte-identical and its mutants never appear there` | `tests/mutate-isolation.test.mjs` | ADR-075 still holds | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the lease calls and the tests |
| 2 — something selects it | every campaign |
| 3 — the caller can discover it | the "running beside" lines |
| 4 — it is used | a `qh-check` beside a campaign names it |

## Mutation Log
- 2026-09-30 · 4535501* · mutant killed · exit 1 · `scripts/mutate.mjs` · the lease never records the isolated child · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · covers:a campaign holds a lease with its child
- 2026-09-30 · 4535501* · mutant survived · exit 0 · `plugin/scripts/lease.mjs` · a lease is live only while its parent lives, so a killed parent's working child is unnamed · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · covers:a killed parent's lease stays while its child works
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-30 · 4535501* · mutant killed · exit 1 · `scripts/mutate.mjs` · a campaign asked to wait does not · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · covers:a campaign waits when asked
- 2026-09-30 · 4535501* · mutant killed · exit 1 · `scripts/mutate.mjs` · a campaign's tests read the machine's leases · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · covers:a campaign's tests have a private lease directory
- 2026-09-30 · 4535501* · mutant killed · exit 1 · `scripts/selftest.sh` · the selftest's tests read the machine's leases · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · covers:the suite has a private lease directory
- 2026-09-30 · 4535501* · mutant killed · exit 1 · `plugin/scripts/lease.mjs` · a lease is live only while its parent lives: neither its child nor its group keeps it, so a killed parent's working campaign goes unnamed · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · covers:a killed parent's lease stays while its child works

## Invariants

- ADR-075's behaviour is unchanged.

## Risks

- A campaign killed by SIGKILL on Windows leaves its lease until its pid has ended; the next observer removes it then.

## Stop Condition

Stop and ask if the lease must be taken in the isolated child instead of the parent.

## Out of Scope

- None — the campaign's other behaviour is unchanged

## Verification Log
- 2026-09-30 · 4535501* · exit 1 · `set -o pipefail …` · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · ms:56620 · test-lock-sha256:eee589ac4badfb94713631762255b6a8d07e1de24a109d9f491ddd3f61d8e02c · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgY2FtcGFpZ24gYXNrZWQgdG8gd2FpdCBzdGFydHMgaXRzIHN1aXRlIG9ubHkgYWZ0ZXIgdGhlIHJ1bm5pbmcgbGVhc2UgaXMgcmVsZWFzZWQJMjlmZGRkYzI4MmZjYTE0MmUxODY5NmUwYmM5N2VjMjA5NTg0NGZkYzgyMmRmMDI3ODc1OTczN2NiYjMzMzEwYwpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgY2FtcGFpZ24gaG9sZHMgYSBsZWFzZSB0aGF0IHJlY29yZHMgaXRzIGlzb2xhdGVkIGNoaWxkLCBhbmQgcmVsZWFzZXMgaXQgYXQgaXRzIGVuZAliZTk4NThlOTkxYTY3MGJlMTExYmQ3OTU2MDkzM2I1NGMzNzJkNzg5YmQ1ZjE3N2MzM2Q2YjQ4MWI2ZmU5YmFiCmJvZHkJdGVzdHMvbGVhc2UudGVzdC5tanMJYSBjYW1wYWlnbidzIHRlc3RzIGFuZCB0aGUgc2VsZnRlc3QgdXNlIGEgcHJpdmF0ZSBsZWFzZSBkaXJlY3RvcnkJZGJlYTE3ZjgyOGEwNjZjNGIyNWFiODc0OTM2MTVlNjVlNTQ4NmRiZTgzODk1ZmFlYzA2ZTBkZmMyYTc4ZmJiZgpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgZGVhZCBsZWFzZSBpcyByZW1vdmVkLCBhbmQgYW4gdW5yZWFkYWJsZSBvbmUgaXMgbmFtZWQgYXMgdW5rbm93biBhbmQga2VwdAkzZjEzMzU1MzA5NDZjYjVmZWFkMDcwMzJiMjI2M2Y4ZWIxNWUwZDBkMjliOTI2ZmVjNGM0NDUyOWUyMWQ3ZjYxCmJvZHkJdGVzdHMvbGVhc2UudGVzdC5tanMJYSBraWxsZWQgY2FtcGFpZ24gcGFyZW50J3MgbGVhc2Ugc3RheXMgbGl2ZSB3aGlsZSBpdHMgY2hpbGQgd29ya3MJMzllZWE4ODdiOWU5NDQwNGRjNjYzZWFlMDIyYzBhNTgwMzgwZmI0Yjk5NGQwZTVlMDNhMDY1YWY5MjM2MDIwMgpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgbGVhc2UgZGlyZWN0b3J5IHRoYXQgY2Fubm90IGJlIHVzZWQgaXMgc2FpZCwgYW5kIHRoZSBydW4gcHJvY2VlZHMJODVhMWMwNmZmYTA3NDk0MDZmN2VmOTY0YzU0ZmYxZmY1MjYzM2E0OTY1N2FlMTJiNGI4YzZkNjVkNGJhOThkZgpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgcnVuIGJlc2lkZSBvdGhlcnMgbmFtZXMgYW5kIHJlY29yZHMgdGhlbSwgYW5kIGl0cyBleGl0IGFuZCB2ZXJkaWN0IGFyZSBpdHMgb3duCWQ0YWY3N2Y5NTA2NzNhNjljOTg2ZjJjMTc3YWMyY2Q3ODM2NzVkZWQyZDk3NmJmNzA4YTlkOTE5YjJhYTVkNDQKYm9keQl0ZXN0cy9sZWFzZS50ZXN0Lm1qcwlhIHJ1biBob2xkcyBhIGxlYXNlIHdoaWxlIGl0IHJ1bnMgYW5kIHJlbGVhc2VzIGl0IGF0IGl0cyBlbmQJOWNkZDlkOWE4YTFjYjM1MTZmNzFjMzUwOTFlOGY2NzliNDI3N2Q2NmE1N2I5OWY4Y2JlMmNiM2UwZmM1OTI1Ywpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgc2lnbmFsIHdoaWxlIHdhaXRpbmcgcmVsZWFzZXMgdGhlIGxlYXNlIGFuZCBydW5zIG5vdGhpbmcJNWI3MGQwYmE1NTE5MjgxYzA3NzY0YmYwNzg4MDY1ZTcwN2EzODUzZjRhZGJjYTk3MTdjOTU4ZjM3NGY3Yjg5OQpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgd2FpdCBwYXN0IGl0cyBib3VuZCBzYXlzIHNvIGFuZCBydW5zLCB3aXRoaW4gdGhlIGJvdW5kCTIwZmQ3YjJjYWEyZTZmYmY0OGIyYzZlMWY1Nzc0MmFiYTg0ZDhhNTJmYWQzNmI0NTBlNDRlMzI2NDRiYzg4YWUKYm9keQl0ZXN0cy9sZWFzZS50ZXN0Lm1qcwlhIHdhaXRlciBuZXZlciBzdGFydHMgYWhlYWQgb2YgYW4gZWFybGllciB3YWl0ZXIncyB0aWNrZXQJMjU3MWVhNWMyNzUwNmQ1MzFmNzM0YmE0MzU2Yjk4NjhlMTk5ZGQ0MmE0YWVkMjY1OTdjN2I0NjY0NWYzOTQ3OApib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgd2FpdGluZyBydW4gc3RhcnRzIGl0cyBjaGVjayBvbmx5IGFmdGVyIHRoZSBydW5uaW5nIGxlYXNlIGlzIHJlbGVhc2VkLCBhbmQgc2F5cyBob3cgbG9uZyBpdCB3YWl0ZWQJNjgzZDAyYjMwYWQzMGNhNzcyMGVjMDRlZDMxOGEyZGMzMTM3ZTA5ZDgxYzM0OTc1ZmVlNjc1ZTYyNDIwMmYyMgpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCXRoZSBsZWFzZSBkaXJlY3RvcnkgaXMgdGhlIGVudmlyb25tZW50J3MsIGVsc2Ugb25lIHVuZGVyIHRoZSB0ZW1wIGRpcmVjdG9yeQkyOGU2ZGY1MmE3Y2I5MGJjMjYzMmRmOWEzNDRhNjA0MWI0ZjAwZmU2OTZiMjJiOTg0NGM4ZDBmYzE5NmFjN2E5CmJvZHkJdGVzdHMvbGVhc2UudGVzdC5tanMJdHdvIHdhaXRlcnMgYXJlIGFkbWl0dGVkIGluIHRpY2tldCBvcmRlciwgb25lIGF0IGEgdGltZQkxMmE5Nzc5ZGU3NWU1Zjg4M2QxODViYjhhN2JhZTQ4MmU4MTBhNjlhMWY0M2JiNmU4NTFlOGY3ZWE5Y2U0OThmCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGNhbXBhaWduIGNoaWxkIGRvZXMgbm90IGhhbmQgaXRzIG1hcmtlciB0byB0aGUgdGVzdHMgaXQgcnVucwkzMDkwZDE3MzMwZDQwNWYxYjViOGZlOTU3N2NjNDRlYWJjZTJlOTdkZjM4Mzk2OTlkNzNmYmJhMmEwMzg1MzVkCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGNhbXBhaWduIGxlYXZlcyB0aGUgd29ya2luZyB0cmVlIGJ5dGUtaWRlbnRpY2FsIGFuZCBpdHMgbXV0YW50cyBuZXZlciBhcHBlYXIgdGhlcmUJNzY3YjVmMzNhZDlhYWE4NjUzMjE5NTY0ZDE3M2UwY2VhZjM4YTlmYzFiNzM2MDIzN2E2YjEwYzNiMWJkYTBjOQpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSBjYW1wYWlnbiBzYXlzIGl0cyBsb2FkIGxpbmUgb25jZSwgaW4gcGxhY2UgYW5kIGlzb2xhdGVkCTk5MTk2N2UzNDBmOTZmY2YyNWEzYjU4Mjc4YWVlMTlhODI0ZGU3YmFmMWY3NTU4NDExZWZlODk3NGU2MjRlOWUKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgY2FtcGFpZ24gc3RvcHBlZCB3aXRoIFNJR1RFUk0gZW5kcyB3aXRoaW4gaXRzIGdyYWNlLCBub3QgYWZ0ZXIgaXRzIHJlbWFpbmluZyBlbnRyaWVzCTA1NmJhZDk2NGUzZDAwYTc4ZDBmNGJjYWIwZDc4Mzk3ZmE4MDI0M2Y3ZDE2MTdhZDJmZmE5YWI1YTM0NzFjMjMKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgY2FtcGFpZ24gc3RvcHBlZCB3aXRoIFNJR1RFUk0gcmVtb3ZlcyBpdHMgd29ya3RyZWUJNDUyY2UwNDQ2MTMxNTg3ZGQ0N2NjMzE4MWY1ODU3MjUxOGE5NzY2NWJlNWFiYWUzZDFkYmRhOWYwMjYxMjg4Ngpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSBjYW1wYWlnbiB0aGF0IGNhbm5vdCBpc29sYXRlIHN0b3BzIGFuZCBuYW1lcyAtLWluLXBsYWNlLCB3cml0aW5nIG5vdGhpbmcJZTFmNzEyYWEwNTA1ZTA1YzM3NmY2M2QzOGUxYTkwNzUzMWZiNTU0MjY0NjJmNzQyNGIxYTQ2OWVlNDkwNDNlZApib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSBraWxsZWQgY2FtcGFpZ24ncyB3b3JrdHJlZSBpcyByZW1vdmVkIGJ5IHRoZSBuZXh0IHJ1biwgYW5kIHNhaWQJY2ZhMjJhZjg0NTRkOTdjNTM5ZTViZDUzYzFmNTU4NmY0MTFhZmYwM2Y1NzFkNDZjZTNjZTFiZDQ5MzQzMmFlOQpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSBzZWNvbmQgY2FtcGFpZ24gd2FpdHMgd2hpbGUgYW4gb3JwaGFuZWQgY2hpbGQgb2YgdGhlIGZpcnN0IHN0aWxsIHJ1bnMJNDRkYjYwOGNiNTQ3YjYwZTU3ZDEzZjY3N2YyYmJiMTg3MmI3NTU5YmMwMmYzNWExMzY0NzM2MDcxNGE2OWE4Ywpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSB0cmFja2VkIGZpbGUgZGVsZXRlZCBpbiB0aGUgY2hlY2tvdXQgaXMgYWJzZW50IGZyb20gdGhlIHdvcmt0cmVlIHRvbwkyZDg2N2YyZTgyODZmNDNiZTcyOWQ2YWZiZmZhNGRjMjQ5ZWIyM2VhMjc2ZTEyZTRmYzdiOGMyMzMzZDNkMWM4CmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhIHZlcmRpY3QgY2FjaGUgdGhhdCBjYW5ub3QgYmUgcmVhZCBpbnRvIHRoZSB3b3JrdHJlZSBpcyBuZWl0aGVyIHJldXNlZCBub3IgcmV0dXJuZWQsIGFuZCB0aGUgd29ya3RyZWUgZ29lcwkzMDA2YmFkNDRlMTQ0NjMxZTNiMmI2NWZiNzk2ZDg2NmVmMjE2MzE1YzhiOTkwNmE1YjRmYjQ0NThmNmRjODYwCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhIHZlcmRpY3QgY2FjaGUgdGhhdCBjYW5ub3QgYmUgd3JpdHRlbiBiYWNrIGlzIGxlZnQgYXMgaXQgd2FzLCBhbmQgc2FpZAlmMmY0ODdhZDU2NjU3ZWEzODBjYzViOWI2OGZkNDBjM2Q4MWQ0NGRiYmU3ZGExNjgwNmM5ZDhmZGQxYzFhNzBlCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiBpbi1wbGFjZSBjYW1wYWlnbiBuYW1lcyB0aGUgcHJvY2Vzc2VzIHJ1bm5pbmcgdGhpcyBjaGVja291dCwgYW5kIHNheXMgd2hlbiBpdCBjb3VsZCBub3QgbG9vawlmOGI1MThkMGI2ZjQ5MjMwYzk2ODFlNThlZmIyNDk1YjFjMjA5NzQ0N2ZiN2UwYzlhNjMyNmE3ZGQ2NGEwNmNmCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiBpc29sYXRlZCBjYW1wYWlnbiByZXVzZXMgYW5kIHJldHVybnMgdGhlIGNoZWNrb3V0J3MgdmVyZGljdCBjYWNoZQk4OWIzNjFiZGEwZjA3OTIxOTY5ZmVkNzcwMWZjNThlMDk5YzZkMmE0N2ZhMmNmYzUzOTljYzIyM2UwNTkwODgzCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiBpc29sYXRlZCBjYW1wYWlnbiBydW5zIGV4YWN0bHkgdGhlIGVudHJpZXMgYW4gaW4tcGxhY2Ugb25lIHNlbGVjdHMJOTU4MGRiMmQ4MmM0ZWRiOTZlMjczYzdlYWI0OGYwZTEzMzFjM2M1ZTE5MmM3NjE5MTJkMDE2MDRlOThkNDc2Ygpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYW4gaXNvbGF0ZWQgY2FtcGFpZ24gcnVucyBvdmVyIHRoZSBieXRlcyBpbiB0aGUgY2hlY2tvdXQsIG5vdCB0aGUgb25lcyBnaXQgbm9ybWFsaXNlcwkwMmI1YTJlMWE3OWM4NGNjMmE4M2E1MmM3MWUyMzU4MjJhNTRmNzQ5ZmVmY2E2NjM2N2FhNmVhNGUyOGU2YzhlCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiBpc29sYXRlZCBjYW1wYWlnbidzIHdyaXR0ZW4tYmFjayBjYWNoZSBpcyBvbmUgQ0kncyBtZXJnZSBqb2IgY2FuIHJlYWQJNmZiMzZhOWZmNGVkNjFlMWIzOWMwODc0MjJiZWQzYmJiOGJkNDYxMmY2NTYzODQ0OTJjNWJmZDI2ODQ5NDcxNQpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYW4gaXNvbGF0ZWQgY2hpbGQgd2hvc2UgcGFyZW50IGVuZGVkIGJlZm9yZSByZWNvcmRpbmcgaXQgZG9lcyBub3Qgc3RhcnQJNjI5M2M5ZGUwZGZjOTdmYzZjNjI4NjUyYzhlN2EwNzAyMzI1NTUxNTk3MWRmZDIyYTkyNmY5NDdlZmZlNzZmOQpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYW4gaXNvbGF0ZWQgcnVuIGFuZCBhbiBpbi1wbGFjZSBydW4gb2YgdGhlIHNhbWUgZW50cmllcyBnaXZlIHRoZSBzYW1lIHZlcmRpY3RzCTgxNWE5Y2U5MjIxNTg1ODQyNWMxZWRhYzQ0ZDMzNzdmYjMzY2Y1YTRhYjViN2E3NWVjN2JiNDcyODA4MDUwZTgKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWFuIHVuY29tbWl0dGVkIHRlc3QgZWRpdCBhbmQgYW4gdW50cmFja2VkIHRlc3QgYXJlIGdyYWRlZCBhcyBhbiBpbi1wbGFjZSBydW4gZ3JhZGVzIHRoZW0JN2FhZWQ4Mjk4OTFiMDFkNjQ3NGU1OWE1YWI5MWQyNTVjN2RhZWQwZWQyZDFmNWY2OTdjYWM1OWVkZmIyNDgyNg
  ```
  --- last 10 line(s) of stdout (of 267 after folding 267 raw)
    ...
  1..33
  # tests 33
  # suites 0
  # pass 29
  # fail 4
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 56482.255125
  ```
- 2026-09-30 · 4535501* · exit 0 · `set -o pipefail …` · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · ms:56499
- 2026-09-30 · 4535501* · exit 0 · `set -o pipefail …` · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · ms:57119
- 2026-09-30 · 4535501* · exit 0 · `set -o pipefail …` · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · ms:54985
- 2026-09-30 · 4535501* · exit 0 · `set -o pipefail …` · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · ms:54880
- 2026-09-30 · 4535501* · exit 0 · `set -o pipefail …` · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · ms:57857
- 2026-09-30 · 4535501* · exit 0 · `set -o pipefail …` · acceptance-sha256:9f97fe9a8fcc7b292b956c91588cba1bfd433e262381712b1909363ff84a84da · ms:59365
