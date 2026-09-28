# Task ADR-071-T2: `--repoint --reanchor` proposes, and writes only when asked

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one script, its test)
**Owner:** unassigned
**Produces:** the `--reanchor` flag of `scripts/mutate.mjs`
**Consumes:** `reanchorEntry(entry, text, added)` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the flag is reachable`, `without the flag nothing changes`, `a reanchored proposal is written and measured`

## Goal

`--repoint --reanchor` prints `reanchored` proposals beside ADR-069's `repointed` ones. With `--write`, it writes them through ADR-069 T2's write and measurement. Without `--reanchor`, `--repoint` is byte-identical to today.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `--reanchor` in the flag set and the usage line; `--repoint` calls `reanchorEntry` when it is given |
| `tests/mutate-runner.test.mjs` | edit | a new test over a scratch repository; ADR-069's locked tests unchanged |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the test below and see it fail on an assertion (TDD red): `--reanchor` is refused as an unknown option.
2. [S2] Work in a scratch git repository holding one entry only `reanchorEntry` repoints, and one rewrite:
   - `--repoint` alone prints and exits exactly as today, refusing both.
   - `--repoint --reanchor` prints the re-anchored proposal the same way ADR-069 prints a proposal, with the verdict `reanchored` in place of `repointed`. It refuses the rewrite, naming its rule, and the summary line counts re-anchored proposals separately from repointed ones.
   - With `--write`, only the first entry's `from`/`to` change, and the run measures them.
3. [S3] Add `--reanchor` to the flag set and the usage line. `--reanchor` without `--repoint` is a usage error, exit 2. The same test asserts both: the usage text, printed for an unknown option, names `--reanchor`; and `--reanchor` alone exits 2.
4. [S4] Record mutants with `adr-verify --mutant`: `--reanchor` dropped from the flag set; `--repoint` calling `reanchorEntry` without the flag; `--reanchor` accepted without `--repoint`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/mutate-runner.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (mutate --repoint --reanchor proposes what repointEntry refused, and --repoint alone is unchanged)' | grep -qx 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `mutate --repoint --reanchor proposes what repointEntry refused, and --repoint alone is unchanged` | `tests/mutate-runner.test.mjs` | in a scratch repository: the output without the flag equals today's; with it, the `reanchored` proposal, the refusal and the separate count are printed; `--write` changes only the proposed entry; the usage text names `--reanchor`; `--reanchor` alone exits 2 | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the flag and its test |
| 2 — something selects it | `--reanchor` in `main`'s flag handling; the mutant removing it |
| 3 — the caller can discover it | the usage line, printed for an unknown option |
| 4 — it is used | nothing measures this yet; ADR-071's follow-up counts it |

## Mutation Log
- 2026-09-28 · e7c539c* · mutant killed · exit 1 · `scripts/mutate.mjs` · --reanchor is no longer an accepted option · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · covers:the flag is reachable
- 2026-09-28 · e7c539c* · mutant killed · exit 1 · `scripts/mutate.mjs` · --reanchor without --repoint is accepted · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · covers:the flag is reachable
- 2026-09-28 · e7c539c* · mutant killed · exit 1 · `scripts/mutate.mjs` · --repoint re-anchors without being asked · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · covers:without the flag nothing changes
- 2026-09-28 · e7c539c* · mutant killed · exit 1 · `scripts/mutate.mjs` · a re-anchored proposal is neither printed nor written · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · covers:a reanchored proposal is written and measured

## Invariants

- Without `--reanchor`, `--repoint`'s output and exit code are exactly ADR-069's.
- `--reanchor` writes nothing without `--write`, and takes no lock.

## Risks

- The write path is ADR-069 T2's; a re-anchored entry must pass the same measurement before the command succeeds.

## Stop Condition

Stop and ask if `--repoint`'s output changes without the flag in any test.

## Out of Scope

- Changing ADR-069's verdicts or tests (permanent: boundary: ADR-071 adds a flag beside them)

## Verification Log
- 2026-09-28 · e7c539c* · exit 1 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:4306 · test-lock-sha256:eddd866642888a3052580aa847d51bc26aae675509a7d3c12b191f95debac5d7 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJLS1jaGFuZ2VkIHJlYWRzIGl0cyBkaWZmIGluIG9uZSBzaGFwZSB3aGF0ZXZlciB0aGUgdXNlciBjb25maWd1cmVkCTY5NmQ3ZDk2NTExYTQ2ZDAwNTQxYWE3YmRhZWIyNDQ5NTBlZjEyNjIwODU3NzU5Mjk0Y2NiNDcxOTU2ZTI4YmUKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCS0tY2hhbmdlZCBzZWxlY3RzIGEgc2hvcnQgbXV0YW50IGJ5IHdoZXJlIHRoZSBjaGFuZ2UgYWRkZWQgaXQJMTI4YjFkMWRhZmIwZmYyN2JjZWRiMzcxOTk5ZWEzOTNkZjI2OWQ0NTEzM2UxYjhiOGZmMjFkNTE0ZjBkYzAyZgpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJR1JFRU4gYW5kIFNUQUxFIGJvdGggY291bnQgYXMgbWlzc2VkIGFuZCBleGl0IDEJMDZmNmMwZmMyMGYwZTM3NGEyYTU4YjE2MTc0OGM1MjY3ZTQyZDdiNDk1MTYzOWQ3MzY1OThlMDlkYjQwOTQxNwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJVU5QUk9WRU4gZW50cmllcyBhcmUgaW4gbmVpdGhlciBoYWxmIG9mIHRoZSBub3RpY2VkIHJhdGlvCWM1MTMxYWYyMTdlMDg2NjAyNjEwMzgxMDMwYWM1NjE1NjBhOTVlNjk1MGE0M2E4NDhlMWU4NjgwZmY1ZWViNTgKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWBvbmx5YCBiZWNvbWVzIGEgLS10ZXN0LW5hbWUtcGF0dGVybiBmb3IgdGhlIG11dGFudCBhbmQgaXRzIGJhc2VsaW5lIGFsaWtlLCBhbmQgbm90aGluZyB3aXRob3V0IGl0CTQyY2E2NzAzNGQwYmZhMGY2NmQ5MzU1ODIxYzlhN2U3MGQ0MDU3ZWU2MDAwY2NiNGIzNDMwNTJiY2EzNjcxM2IKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgYmFzZWxpbmUgaXMgdGFrZW4gb25jZSBwZXIgZGlzdGluY3QgdGVzdC1zZXQsIG5vdCBvbmNlIHBlciBtdXRhdGlvbgljMTUzYjM3YjQ3NzQwYjdkZGExODI5ZDgxNDRhZjZkNTU4Zjk1OGNjNjM1ZTFlM2U0NzRjNWZhNWFiYzc2YzIzCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGJhc2VsaW5lIHRha2VuIHVuZGVyIG9uZSBwYXR0ZXJuIGxpY2Vuc2VzIG5vdGhpbmcgYWJvdXQgYW5vdGhlcglkZDlkYWRlOGRhMTk4OTQ0MzEwZjkyYjJiNjFjNmJhOWE3NDk5YmUzMDQwYTVlOWJlMGFjZTdhNmMxYjM0NTA3CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGJhc2VsaW5lIHRoYXQgbmV2ZXIgcmFuIGlzIG5vdCByZXBvcnRlZCBhcyBhbiBhbHJlYWR5LWZhaWxpbmcgc3VpdGUJNzdjODJkNmZkZGFkNTU1YWIxN2M0NDA1M2IxNjg4YWZkOTUwNWE4NmM2NjVmNDE5YzBiNGQ1NzJkNDc1M2JmOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBjYW1wYWlnbiBsZWF2ZXMgbm90aGluZyBpbiB0aGUgdGVtcCBkaXJlY3RvcnksIHdoYXRldmVyIGl0cyB0ZXN0cyBmb3JnZXQJN2Q3NzQ5NzA1Mjc2YTEyMzVhMGI3OTBiZjI5ODU5MmM1NmNkYmYzMDg5ODc3ZWE3NDQ2MWE4OThhODY4Mzk2MApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBjaGFuZ2VkIHN1YmplY3QsIHRlc3Qgb3IgZWRpdCBpcyBhIGRpZmZlcmVudCBtdXRhbnQJOTEyZWNiYjY0MjBiYmI0NWQ2MWQ0M2Q5NWNkYjA4MjFmOGRlMjY1MDIwMjFmYTdhNDM5ZTg1Yzk1MWNhMGEwYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBjaGVja291dCBwYXRoIHdpdGggYSBzcGFjZSBpcyBzdGlsbCBhbiB1bnJ1biBiYXNlbGluZSB3aGVuIG5vdGhpbmcgbWF0Y2hlZAk4NTljNDZjMTRiMTE1ZTM4NDhjNWQwYWVkZDYzZmY3NDNmNTM2OGQ2Y2FhNGM0M2M5MzlkODI3YWU5ZGNkNjhmCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGZvcmNlZCBydW4gcmV1c2VzIG5vdGhpbmcJODg1MDU4MTcyMDZhOWNiOGFmZDMxOTRlZDAzZjlhMTEzNDE2YTVlODhhNTg0MTQ2MWNhMjQ2ZGI0Nzk1MjFhNQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBraWxsIG5hbWVzIHdoaWNoIHRlc3RzIGZhaWxlZCwgc28gdGhlIHdyb25nIGtpbGxlciBpcyB2aXNpYmxlCWNlYjI0MjczMzBiNjQ5YmZhOWY2MzdhODY4ZmRlNmQxZGUwOTBiZGFlYjNjNzI5ZmJjMzEzMWE1MWQ4MTEwODEKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgcGFydGl0aW9uIHN0YXlzIGEgcGFydGl0aW9uIGhvd2V2ZXIgdGhlIGNvc3RzIGZhbGwJN2E2NmI4NTc3NmJhMzI5NzcyOGUxZjk1YWE3YTZlMTMwYzQ3OTM3MTFhNjg4ZGFjMjI2YmZkMDU0ZjM4YzFhZApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBwYXNzaW5nIGJhc2VsaW5lIGxlYXZlcyBldmVyeSBleGlzdGluZyB2ZXJkaWN0IGV4YWN0bHkgYXMgaXQgd2FzCTk3YjI4NWZhNTU4OWE0ZTliZmUxM2EzNWQ1YjkzOTQwNDk4ZDI2YjE5MWIyOTgwYmE5NjczNWQ3YzY2NDkwMWEKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgcnVuIGluIHdoaWNoIG5vIHRlc3QgZXhlY3V0ZWQgaXMgYW4gdW5ydW4gYmFzZWxpbmUsIG5ldmVyIGEgcGFzc2luZyBvbmUJN2Y4ODFiZGQ4YzdmNzc0Zjk1YmNhMmJjZGQzOGY1ZjJlY2RiZGNhNmNhZTU0ZGUxOTA0N2UwYzE4OWNjZDE5YQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBydW4ga2lsbGVkIGJ5IHNpZ25hbCBpcyBIVU5HIHJhdGhlciB0aGFuIEdSRUVOCWMxYTZiZDkyMTI5NzIwYzI1MDhjOGJhNmVjOGY3OTNhODBhNTM2NGIwNzIzOGUwY2RiYjIyOWJkODZiYmE2NDkKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgc3RhbGUgZW50cnkgaXMgZGVjaWRlZCBiZWZvcmUgYW55IGJhc2VsaW5lLCBiZWNhdXNlIG5vdGhpbmcgd2FzIGFwcGxpZWQJZTlhMWUxNDZkZTVhYzViZDdhMzQwYWUzODFiZDNiMTY5Y2UxYjZjMDllNDQwY2ZlMjdjYjZmYjYyMzYxZjRhOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBzdGFsZSBtdXRhdGlvbiBpcyByZXBvcnRlZCBhcyBzdGFsZSwgbm90IGFzIGEgdGVzdCB0aGF0IGZhaWxlZCB0byBub3RpY2UJNWRlOWFlNzFlMGJhNmRmYzAwYWFlZTgwZDIwMmI1YWNkMTZhNDdmNWM3NzZjMWE1MGQyNmM2NDliNmNhMjYyOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBzdGFsZSBtdXRhdGlvbiByZW5kZXJzIGEgbGluZSByYXRoZXIgdGhhbiBhIGJsYW5rCTljOTM1ZTQ1ZTkyMmY3YjMwNTZjNGU3ZGQ1MzI5YTNkMDEzMGMyZDU0NDM4ODE2MWVmZjNhYmE1YjExNDY3MWUKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgdGVzdCBuYW1lIHRoYXQgbWVudGlvbnMgYSBkaXJlY3RvcnkgaXMgYSBuYW1lLCBub3QgYSBmaWxlIHBhdGgJYmJiMGVlMGUzY2E1NmUxZDBhZWMxYjQyMmUzNDI4ZDczZGQwZTIyZjBlNDhmMzBkOTdmOGE3MzI0ZThkNGY3Mwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSB2ZXJkaWN0IHRha2VuIGFnYWluc3QgYSBmYWlsaW5nIGJhc2VsaW5lIGlzIFVOUFJPVkVOLCBub3QgUkVECWQ3MTQwYmVjY2RkZTJjZjRiNWY1ZjBkNGU1MjMwM2ZmOWNiNTkyNTJiM2VlMDJiN2IwOTBjNThhYmIyMTM5OWYKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIFVOUFJPVkVOIGVudHJ5IG5hbWVzIGl0cyB0ZXN0LXNldCBhbmQgdGhlIG5leHQgYWN0aW9uCWZjNmM5M2M0NGMxZTMzNWEwNGI3NmZjYTNiMmY4MmE3OTQzNWY5YzU3ODU0NzA1ODU4MDdiODhiZDNiYWQ0MzAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIFVOUFJPVkVOIGVudHJ5IHN0aWxsIHJlcG9ydHMgdGhlIHZlcmRpY3QgdGhlIHRlc3RzIHByb2R1Y2VkCTRlYzdjY2VhYjZlZjczOGMwZmIzMTI0MmQzNzkwZWQ4ZDU0OGJlMzU1MjllZDBjMGU1YjI1MjVjZmM5YTU2MTAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIGFic2VudCBvciB1bnJlYWRhYmxlIGNhY2hlIG1lYXN1cmVzIGV2ZXJ5dGhpbmcJNzk2NjQ0MGJiYmQyN2VmNzFjMDA4NDE1MDMwMDg1MDhmZTBiMWQxMzgxZTQ0NTAyZWM2M2I3MjFjNzliZGVlYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYW4gZXhhY3QgY29udGVudCBtYXRjaCByZXVzZXMgYSBSRUQgdmVyZGljdAkwNmQxZjBmNjdhYTc1NDA1MjZiZGFmOWI3MzZlOGFmMjFjYWYxZjI5Yzg5YTU3NTQ1NWZiNGJmZmFiZWVhNjQwCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhbiBpbmhlcml0ZWQgRk9SQ0VfQ09MT1IgaXMgZHJvcHBlZCwgc28gYSByZWFsIHJ1biBzdGlsbCBjb3VudHMgaXRzIHRlc3RzCWI4NjRmNGU0YzBiMmU5NGY3MDE1MTA4Yjc3YjFiYjU0MTkzODQ2YTRlMjFhYmQwZWYwYzYyZDcyYTc5MGI0MmQKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIHVucmVhZGFibGUgaW5wdXQgaGFzIG5vIGtleSwgc28gaXQgaXMgbWVhc3VyZWQJZGFiZmUyOTcwYWIyZDczN2U3YjJhM2MwZDY5ZWJjMTdhYjk4Njk4MWYwYTk5NzM2MTcyOWRmNjYzN2Q4MjM1NApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJY2FtcGFpZ25QYXRocyBrZWVwcyBldmVyeSBjYW1wYWlnbiBmaWxlIGluc2lkZSB0aGUgcm9vdCBpdCBpcyBnaXZlbgk5NDYyYWUzY2ZkYzZiMTM5YzhmZjU1ZTU1NTYwNTZmMWUyNmJkNzNhYTJlZGVhMTYwMzBlNzY2ODk3MTlmMWRjCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwllbmQgdG8gZW5kOiBhIG5vbnNlbnNlIHBhdHRlcm4gdW5kZXIgYW4gaW5oZXJpdGVkIGRvdCByZXBvcnRlciBpcyB1bnJ1biwgYW5kIGEgbWF0Y2hpbmcgb25lIHBhc3NlcwlkOWQ3MDAyYWY5Njg3ZTY3ZDk4NzdkN2VhYTNjZmQ5Y2RjODM4NDU1OWVkY2ZlY2I4MDM3ZDc4ZGQxZDU4YzJiCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlmIGFuZCBnCTA1ZTljOGY2NDZlZWI4MzFjY2Q2OGQxYTAwZDgxZmQwZDk2MGEzOWVjZTE5ZDlkMGUyYzc2ZGM0YzBlNjJmNDkKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWtpbGxlcnMgYXJlIHJlbmRlcmVkIG9uZSBwZXIgbGluZSwgYmVjYXVzZSBuYW1lcyBjb250YWluIGNvbW1hcwlmZTk3NDE3NGMwODdmMWJjNDVmMzQwNzRkMjFkZTRhMmYyM2QzNzJiMDE2MmU0YWZiMDA4ZWE5ODJjOWIzNTUyCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwltdXRhdGUgLS1yZXBvaW50IC0tcmVhbmNob3IgcHJvcG9zZXMgd2hhdCByZXBvaW50RW50cnkgcmVmdXNlZCwgYW5kIC0tcmVwb2ludCBhbG9uZSBpcyB1bmNoYW5nZWQJYmM2ZTY2NTRlYjBjMTg1NDhiODY2MTZiY2ZiYjA5YWI2MGZmMTM2MDE0ZDJiNzU1ZjQyYzIwYWQ3MWNkZThkMwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJbXV0YXRlIC0tcmVwb2ludCAtLXdyaXRlIHJld3JpdGVzIG9ubHkgd2hhdCBpdCBwcm9wb3NlZCwgbWVhc3VyZXMgaXQsIGFuZCBuYW1lcyB3aGF0IHN0YXllZCByZWZ1c2VkCTAyNmZjZjg5NGEyNmZmMTNlNjdhZmQzOGU4ZGY0ZDFlM2ZjODk5NTdjNmVkMjQ2YmM4ZDFjZTFjOTBjNDUyNzkKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCW11dGF0ZSAtLXJlcG9pbnQgcmVhZHMgYSBzY3JhdGNoIHJlcG9zaXRvcnksIHdyaXRlcyBub3RoaW5nLCBhbmQgZXhpdHMgMSB3aGlsZSBhbiBlbnRyeSBpcyBzdGFsZQlhZTc1YWYyNmQzNjkxMjQ1NmUyODNmYTg0Y2MyZjQ2OWRmMWY0NWEwZjQ1YmZlZDliZDQ3MTZiZGY1NjhiY2QwCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwltdXRhdGUgLS1zdGFsZSBvdmVyIHRoZSByZWFsIGNhdGFsb2d1ZSBleGl0cyAwIGFuZCBzYXlzIGV2ZXJ5IGVudHJ5IG1hdGNoZXMJODFhYWFhNmZmOWI5MTNiZjVmNzA3MTM3NWFhMWM4MWYwMmJjZDY1YjBiZDZmNmVlNDJlYzU1NTQyY2IxOWM2MApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJb25seSBSRUQgaXMgcmV1c2FibGUJYWY3ODc0ZmFlMDYzMDI0MjVmMGVlMGI1ZjllZmQyYTIxYzkwOTg2Nzg2N2E3ZTZiNjE3NjhiYmY3NDg1NzlmOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJcmVhbmNob3JFbnRyeSByZXByb2R1Y2VzIHRoZSBoYW5kIHJlcG9pbnRzIHJlcG9pbnRFbnRyeSByZWZ1c2VkLCBhbmQgcHJvcG9zZXMgbm8gbGluZSB0aGUgaGFuZCBkaWQgbm90IGNob29zZQllMzZmNDkxYjI1NzI4M2I2NjYwNTI4MGVmZTMwMTg5ZjZiOWExZDIxN2ZjYTgwM2Y1YWM1YzIyOWYwMzFhZDdhCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlyZXBvaW50RW50cnkgcmVwcm9kdWNlcyB0aGUgbWVjaGFuaWNhbCByZXBvaW50cyBvZiB0aGUgMy4xLjAgYmF0Y2ggYW5kIHJlZnVzZXMgdGhlIHJlc3QJZjVhZTViMTZlNWY3NGQ3YThjZDk3MWUyNTA3MWEzMWFjOWU3MWRkMDkyNDJiMDZkMTYyYWMwMGVjYTY3NWEyYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJc2hhcmRzIGFyZSBiYWxhbmNlZCBieSBtZWFzdXJlZCBjb3N0IHdoZW4gdGltaW5ncyBleGlzdAlhNTAyYjQ5MDNiZjFiMDJlMzU5MTdlMDg3NzAxMzU3MzMzYTU0YzA1N2QyMDdmNGU0Y2Q1MDUxZjkwYzg5YWQxCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlzdGFsZUVudHJpZXMgbmFtZXMgZWFjaCBlbnRyeSB0aGF0IG5vIGxvbmdlciBtYXRjaGVzIG9uY2UsIHdpdGggd2hlcmUgaXRzIGxpbmUgd2VudAkyNzlhY2M3YTZmZTkyYjY3ZmM5OTUyMjdmNDliOTE1ZjkyMTNkNzdmZDliNjFmMTFmNzQ5Mzk5N2NkM2I1MzViCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl0aGUgcmVwb3J0IG5hbWVzIHRoZSBraWxsZXIgYmVzaWRlIGEgUkVEIHZlcmRpY3QJZDQ0OWMwNzljMjkxMWM4OTBjZjU2MTM2M2Y4YzgxZTNjMDA0YWY5YzE1ZGRjZDdiZjdkOWU1NTgyZGUwMDI0NApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJdGhlIHN1bW1hcnkgZGlzdGluZ3Vpc2hlcyBtZWFzdXJlZCBmcm9tIHJldXNlZAlmYjMzZTZlZTEzMzMwNzRlYjBhODNmYzU2ZDFjN2E1M2NhOGQ2YTBmZGI2OTQxOWI0NTkxOWRjNTdiNjgzOWQ2CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl0b3VjaGVkQnkga2VlcHMgYW4gZW50cnkgd2hvc2UgbXV0YXRlZCBsaW5lIHdhcyBhZGRlZCBieSB0aGUgY2hhbmdlLCBhbmQgb25seSB0aG9zZQkwZDM2OGYzMWQ2M2U4MmI2OGQ2ZmNjNDg2NGQyMTZlMjNmNTdmZmYzM2UzYmMxYmQ1ZWJjMDRjMjI5ZTM2ZDk1CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl3aXRoIG5vIHRpbWluZ3MgYXQgYWxsIGl0IHN0aWxsIHBhcnRpdGlvbnMsIGFuZCBzYXlzIG5vdGhpbmcgYWJvdXQgYmFsYW5jZQk1MmNhODlkNzQyYzI0YTcxMzBlNWIwY2NkODhiYzJkNDU5M2FjYzk5ZmU3NjNmYmY2NWQ1N2MzMWRjYzBjYjg3
  ```
  --- last 10 line(s) of stderr (of 296 after folding 297 raw)
    ...
  1..44
  # tests 44
  # suites 0
  # pass 43
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 4182.67725
  ```
- 2026-09-28 · e7c539c* · exit 1 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:4838
  ```
  --- last 10 line(s) of stderr (of 298 after folding 300 raw)
    ...
  1..44
  # tests 44
  # suites 0
  # pass 43
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 4744.756625
  ```
- 2026-09-28 · e7c539c* · exit 1 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:5191
  ```
  --- last 10 line(s) of stderr (of 298 after folding 300 raw)
    ...
  1..44
  # tests 44
  # suites 0
  # pass 43
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 5092.531042
  ```
- 2026-09-28 · e7c539c* · exit 1 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:4148
  ```
  --- last 10 line(s) of stderr (of 298 after folding 300 raw)
    ...
  1..44
  # tests 44
  # suites 0
  # pass 43
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 4023.850833
  ```
- 2026-09-28 · e7c539c* · exit 1 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:4145
  ```
  --- last 10 line(s) of stderr (of 298 after folding 300 raw)
    ...
  1..44
  # tests 44
  # suites 0
  # pass 43
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 4064.524375
  ```
- 2026-09-28 · e7c539c* · exit 0 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:4251
- 2026-09-28 · e7c539c* · exit 0 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:4436
- 2026-09-28 · e7c539c* · exit 0 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:4753
- 2026-09-28 · e7c539c* · exit 0 · `set -o pipefail …` · acceptance-sha256:eb8b43f4d84faf88b820f61343e71cef764f655579db952ceccb1dfc99088aba · ms:4262
