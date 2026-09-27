# Task ADR-069-T2: The write is measured before it is trusted

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (the script, a scratch-repository test)
**Owner:** unassigned
**Produces:** `--repoint --write`
**Consumes:** `repointEntry(entry, text, added)` (T1); `campaignPaths(root)` and `--root` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `only proposed entries change`, `nothing is written without consent`, `the write is measured`, `anything but RED is named`

## Goal

`mutate.mjs --repoint --write` follows ADR-069 Decision's fixed order: claim the lock, compute the proposals, refuse with exit 2 before writing when the proposed entries' sources are uncommitted and `--force` is absent, rewrite only the proposed entries' `from`/`to`, measure exactly those entries, and exit 0 only when every one is RED and no entry remains stale.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | the `--write` branch, its order, its exit codes, and `--write` in the usage line |
| `tests/mutate-runner.test.mjs` | edit | the scratch-repository test |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the test below and see it fail on an assertion (TDD red): `--write` is an unknown option.
2. [S2] The test builds a scratch git repository (CLAUDE.md §9): a subject file, a `node --test` test that fails when the subject's mechanism is removed, and a `tests/mutations.json` holding one mechanical stale entry, one rewrite, and one untouched entry. The subject's change is left UNCOMMITTED, as it is after a real refactor. It runs `node <this repository>/scripts/mutate.mjs --root <scratch> --repoint --write`, then again with `--force`.
3. [S3] Implement the order: lock, proposals, the dirt check (exit 2, nothing written, without `--force`), the write (`JSON.stringify(…, null, 2) + '\n'`), the measurement of the rewritten labels only, the lock released. [proof: acceptance]
4. [S4] The exit: 0 only when every rewritten entry is RED and nothing is stale; 1 when any rewritten entry is GREEN, STALE, UNPROVEN or HUNG, or any entry stays stale (a refused one included); 2 for the refused dirt check. [proof: acceptance]
5. [S5] Record mutants with `adr-verify --mutant`: the write also rewrites refused entries; the dirt check runs after the write; the measurement is skipped; an UNPROVEN rewritten entry exits 0; a refused entry left stale exits 0. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/mutate-runner.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (mutate --repoint --write rewrites only what it proposed, measures it, and names what stayed refused)' | grep -qx 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `mutate --repoint --write rewrites only what it proposed, measures it, and names what stayed refused` | `tests/mutate-runner.test.mjs` | in a scratch repository with an uncommitted subject: without `--force`, exit 2 and the catalogue byte-unchanged; with it, the mechanical entry is rewritten and measured RED, the rewrite is listed as refused and byte-unchanged, every other byte of the catalogue is identical, and the exit is 1 because the refused entry is still stale; its twin, with the rewrite removed from the scratch catalogue, exits 0; and a subject whose test cannot notice the repointed mutant makes that entry GREEN, named, exit 1 | none | S1, S2, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the `--write` branch |
| 2 — something selects it | `--write` read only alongside `--repoint`; the mutant skipping the measurement |
| 3 — the caller can discover it | the usage line; T1's `--repoint` output ends with the `--write` command to run |
| 4 — it is used | nothing measures this yet |

## Mutation Log
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · the write also rewrites the entries it refused · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · covers:only proposed entries change
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · the write goes ahead over uncommitted sources without --force · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · covers:nothing is written without consent
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · the rewritten entries are not measured · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · covers:the write is measured
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · a GREEN rewritten entry exits 0 · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · covers:anything but RED is named
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · an entry still stale after the write exits 0 · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · covers:anything but RED is named

## Invariants

- Without `--write`, nothing is written; without `--force`, nothing is written over uncommitted sources.
- Only `from` and `to` of proposed entries change; every other byte of the catalogue is identical.
- A written entry is measured before the command can exit 0.
- A scratch `--root` run reads and writes only inside that root (T1's resolver).

## Risks

- The measurement reuses the campaign runner, whose cache keys on the subject and test bytes (ADR-023); a rewritten entry has a new key, so no verdict is reused for it. The test asserts the written entry was measured, not reused.

## Stop Condition

Stop and ask if the campaign runner cannot measure a chosen set of labels over a scratch root without changing how an ordinary campaign behaves.

## Out of Scope

- Committing the rewritten catalogue: the diff is for a person to review.
- Worktree-isolated campaigns (deferred: docs/BACKLOG.md §301)

## Verification Log
- 2026-09-27 · a11f334* · exit 1 · `set -o pipefail …` · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · ms:334 · test-lock-sha256:3a20385820114cd7fbb5eebddeb3723219669a4576e78acfb963522849cfcf13 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJLS1jaGFuZ2VkIHJlYWRzIGl0cyBkaWZmIGluIG9uZSBzaGFwZSB3aGF0ZXZlciB0aGUgdXNlciBjb25maWd1cmVkCTY5NmQ3ZDk2NTExYTQ2ZDAwNTQxYWE3YmRhZWIyNDQ5NTBlZjEyNjIwODU3NzU5Mjk0Y2NiNDcxOTU2ZTI4YmUKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCS0tY2hhbmdlZCBzZWxlY3RzIGEgc2hvcnQgbXV0YW50IGJ5IHdoZXJlIHRoZSBjaGFuZ2UgYWRkZWQgaXQJMTI4YjFkMWRhZmIwZmYyN2JjZWRiMzcxOTk5ZWEzOTNkZjI2OWQ0NTEzM2UxYjhiOGZmMjFkNTE0ZjBkYzAyZgpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJR1JFRU4gYW5kIFNUQUxFIGJvdGggY291bnQgYXMgbWlzc2VkIGFuZCBleGl0IDEJMDZmNmMwZmMyMGYwZTM3NGEyYTU4YjE2MTc0OGM1MjY3ZTQyZDdiNDk1MTYzOWQ3MzY1OThlMDlkYjQwOTQxNwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJVU5QUk9WRU4gZW50cmllcyBhcmUgaW4gbmVpdGhlciBoYWxmIG9mIHRoZSBub3RpY2VkIHJhdGlvCWM1MTMxYWYyMTdlMDg2NjAyNjEwMzgxMDMwYWM1NjE1NjBhOTVlNjk1MGE0M2E4NDhlMWU4NjgwZmY1ZWViNTgKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWBvbmx5YCBiZWNvbWVzIGEgLS10ZXN0LW5hbWUtcGF0dGVybiBmb3IgdGhlIG11dGFudCBhbmQgaXRzIGJhc2VsaW5lIGFsaWtlLCBhbmQgbm90aGluZyB3aXRob3V0IGl0CTQyY2E2NzAzNGQwYmZhMGY2NmQ5MzU1ODIxYzlhN2U3MGQ0MDU3ZWU2MDAwY2NiNGIzNDMwNTJiY2EzNjcxM2IKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgYmFzZWxpbmUgaXMgdGFrZW4gb25jZSBwZXIgZGlzdGluY3QgdGVzdC1zZXQsIG5vdCBvbmNlIHBlciBtdXRhdGlvbgljMTUzYjM3YjQ3NzQwYjdkZGExODI5ZDgxNDRhZjZkNTU4Zjk1OGNjNjM1ZTFlM2U0NzRjNWZhNWFiYzc2YzIzCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGJhc2VsaW5lIHRha2VuIHVuZGVyIG9uZSBwYXR0ZXJuIGxpY2Vuc2VzIG5vdGhpbmcgYWJvdXQgYW5vdGhlcglkZDlkYWRlOGRhMTk4OTQ0MzEwZjkyYjJiNjFjNmJhOWE3NDk5YmUzMDQwYTVlOWJlMGFjZTdhNmMxYjM0NTA3CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGJhc2VsaW5lIHRoYXQgbmV2ZXIgcmFuIGlzIG5vdCByZXBvcnRlZCBhcyBhbiBhbHJlYWR5LWZhaWxpbmcgc3VpdGUJNzdjODJkNmZkZGFkNTU1YWIxN2M0NDA1M2IxNjg4YWZkOTUwNWE4NmM2NjVmNDE5YzBiNGQ1NzJkNDc1M2JmOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBjaGFuZ2VkIHN1YmplY3QsIHRlc3Qgb3IgZWRpdCBpcyBhIGRpZmZlcmVudCBtdXRhbnQJOTEyZWNiYjY0MjBiYmI0NWQ2MWQ0M2Q5NWNkYjA4MjFmOGRlMjY1MDIwMjFmYTdhNDM5ZTg1Yzk1MWNhMGEwYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBjaGVja291dCBwYXRoIHdpdGggYSBzcGFjZSBpcyBzdGlsbCBhbiB1bnJ1biBiYXNlbGluZSB3aGVuIG5vdGhpbmcgbWF0Y2hlZAk4NTljNDZjMTRiMTE1ZTM4NDhjNWQwYWVkZDYzZmY3NDNmNTM2OGQ2Y2FhNGM0M2M5MzlkODI3YWU5ZGNkNjhmCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGZvcmNlZCBydW4gcmV1c2VzIG5vdGhpbmcJODg1MDU4MTcyMDZhOWNiOGFmZDMxOTRlZDAzZjlhMTEzNDE2YTVlODhhNTg0MTQ2MWNhMjQ2ZGI0Nzk1MjFhNQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBraWxsIG5hbWVzIHdoaWNoIHRlc3RzIGZhaWxlZCwgc28gdGhlIHdyb25nIGtpbGxlciBpcyB2aXNpYmxlCWNlYjI0MjczMzBiNjQ5YmZhOWY2MzdhODY4ZmRlNmQxZGUwOTBiZGFlYjNjNzI5ZmJjMzEzMWE1MWQ4MTEwODEKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgcGFydGl0aW9uIHN0YXlzIGEgcGFydGl0aW9uIGhvd2V2ZXIgdGhlIGNvc3RzIGZhbGwJN2E2NmI4NTc3NmJhMzI5NzcyOGUxZjk1YWE3YTZlMTMwYzQ3OTM3MTFhNjg4ZGFjMjI2YmZkMDU0ZjM4YzFhZApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBwYXNzaW5nIGJhc2VsaW5lIGxlYXZlcyBldmVyeSBleGlzdGluZyB2ZXJkaWN0IGV4YWN0bHkgYXMgaXQgd2FzCTk3YjI4NWZhNTU4OWE0ZTliZmUxM2EzNWQ1YjkzOTQwNDk4ZDI2YjE5MWIyOTgwYmE5NjczNWQ3YzY2NDkwMWEKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgcnVuIGluIHdoaWNoIG5vIHRlc3QgZXhlY3V0ZWQgaXMgYW4gdW5ydW4gYmFzZWxpbmUsIG5ldmVyIGEgcGFzc2luZyBvbmUJN2Y4ODFiZGQ4YzdmNzc0Zjk1YmNhMmJjZGQzOGY1ZjJlY2RiZGNhNmNhZTU0ZGUxOTA0N2UwYzE4OWNjZDE5YQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBydW4ga2lsbGVkIGJ5IHNpZ25hbCBpcyBIVU5HIHJhdGhlciB0aGFuIEdSRUVOCWMxYTZiZDkyMTI5NzIwYzI1MDhjOGJhNmVjOGY3OTNhODBhNTM2NGIwNzIzOGUwY2RiYjIyOWJkODZiYmE2NDkKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgc3RhbGUgZW50cnkgaXMgZGVjaWRlZCBiZWZvcmUgYW55IGJhc2VsaW5lLCBiZWNhdXNlIG5vdGhpbmcgd2FzIGFwcGxpZWQJZTlhMWUxNDZkZTVhYzViZDdhMzQwYWUzODFiZDNiMTY5Y2UxYjZjMDllNDQwY2ZlMjdjYjZmYjYyMzYxZjRhOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBzdGFsZSBtdXRhdGlvbiBpcyByZXBvcnRlZCBhcyBzdGFsZSwgbm90IGFzIGEgdGVzdCB0aGF0IGZhaWxlZCB0byBub3RpY2UJNWRlOWFlNzFlMGJhNmRmYzAwYWFlZTgwZDIwMmI1YWNkMTZhNDdmNWM3NzZjMWE1MGQyNmM2NDliNmNhMjYyOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBzdGFsZSBtdXRhdGlvbiByZW5kZXJzIGEgbGluZSByYXRoZXIgdGhhbiBhIGJsYW5rCTljOTM1ZTQ1ZTkyMmY3YjMwNTZjNGU3ZGQ1MzI5YTNkMDEzMGMyZDU0NDM4ODE2MWVmZjNhYmE1YjExNDY3MWUKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgdGVzdCBuYW1lIHRoYXQgbWVudGlvbnMgYSBkaXJlY3RvcnkgaXMgYSBuYW1lLCBub3QgYSBmaWxlIHBhdGgJYmJiMGVlMGUzY2E1NmUxZDBhZWMxYjQyMmUzNDI4ZDczZGQwZTIyZjBlNDhmMzBkOTdmOGE3MzI0ZThkNGY3Mwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSB2ZXJkaWN0IHRha2VuIGFnYWluc3QgYSBmYWlsaW5nIGJhc2VsaW5lIGlzIFVOUFJPVkVOLCBub3QgUkVECWQ3MTQwYmVjY2RkZTJjZjRiNWY1ZjBkNGU1MjMwM2ZmOWNiNTkyNTJiM2VlMDJiN2IwOTBjNThhYmIyMTM5OWYKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIFVOUFJPVkVOIGVudHJ5IG5hbWVzIGl0cyB0ZXN0LXNldCBhbmQgdGhlIG5leHQgYWN0aW9uCWZjNmM5M2M0NGMxZTMzNWEwNGI3NmZjYTNiMmY4MmE3OTQzNWY5YzU3ODU0NzA1ODU4MDdiODhiZDNiYWQ0MzAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIFVOUFJPVkVOIGVudHJ5IHN0aWxsIHJlcG9ydHMgdGhlIHZlcmRpY3QgdGhlIHRlc3RzIHByb2R1Y2VkCTRlYzdjY2VhYjZlZjczOGMwZmIzMTI0MmQzNzkwZWQ4ZDU0OGJlMzU1MjllZDBjMGU1YjI1MjVjZmM5YTU2MTAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIGFic2VudCBvciB1bnJlYWRhYmxlIGNhY2hlIG1lYXN1cmVzIGV2ZXJ5dGhpbmcJNzk2NjQ0MGJiYmQyN2VmNzFjMDA4NDE1MDMwMDg1MDhmZTBiMWQxMzgxZTQ0NTAyZWM2M2I3MjFjNzliZGVlYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYW4gZXhhY3QgY29udGVudCBtYXRjaCByZXVzZXMgYSBSRUQgdmVyZGljdAkwNmQxZjBmNjdhYTc1NDA1MjZiZGFmOWI3MzZlOGFmMjFjYWYxZjI5Yzg5YTU3NTQ1NWZiNGJmZmFiZWVhNjQwCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhbiBpbmhlcml0ZWQgRk9SQ0VfQ09MT1IgaXMgZHJvcHBlZCwgc28gYSByZWFsIHJ1biBzdGlsbCBjb3VudHMgaXRzIHRlc3RzCWI4NjRmNGU0YzBiMmU5NGY3MDE1MTA4Yjc3YjFiYjU0MTkzODQ2YTRlMjFhYmQwZWYwYzYyZDcyYTc5MGI0MmQKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIHVucmVhZGFibGUgaW5wdXQgaGFzIG5vIGtleSwgc28gaXQgaXMgbWVhc3VyZWQJZGFiZmUyOTcwYWIyZDczN2U3YjJhM2MwZDY5ZWJjMTdhYjk4Njk4MWYwYTk5NzM2MTcyOWRmNjYzN2Q4MjM1NApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJY2FtcGFpZ25QYXRocyBrZWVwcyBldmVyeSBjYW1wYWlnbiBmaWxlIGluc2lkZSB0aGUgcm9vdCBpdCBpcyBnaXZlbgk5NDYyYWUzY2ZkYzZiMTM5YzhmZjU1ZTU1NTYwNTZmMWUyNmJkNzNhYTJlZGVhMTYwMzBlNzY2ODk3MTlmMWRjCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwllbmQgdG8gZW5kOiBhIG5vbnNlbnNlIHBhdHRlcm4gdW5kZXIgYW4gaW5oZXJpdGVkIGRvdCByZXBvcnRlciBpcyB1bnJ1biwgYW5kIGEgbWF0Y2hpbmcgb25lIHBhc3NlcwlkOWQ3MDAyYWY5Njg3ZTY3ZDk4NzdkN2VhYTNjZmQ5Y2RjODM4NDU1OWVkY2ZlY2I4MDM3ZDc4ZGQxZDU4YzJiCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlmIGFuZCBnCTA1ZTljOGY2NDZlZWI4MzFjY2Q2OGQxYTAwZDgxZmQwZDk2MGEzOWVjZTE5ZDlkMGUyYzc2ZGM0YzBlNjJmNDkKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWtpbGxlcnMgYXJlIHJlbmRlcmVkIG9uZSBwZXIgbGluZSwgYmVjYXVzZSBuYW1lcyBjb250YWluIGNvbW1hcwlmZTk3NDE3NGMwODdmMWJjNDVmMzQwNzRkMjFkZTRhMmYyM2QzNzJiMDE2MmU0YWZiMDA4ZWE5ODJjOWIzNTUyCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwltdXRhdGUgLS1yZXBvaW50IC0td3JpdGUgcmV3cml0ZXMgb25seSB3aGF0IGl0IHByb3Bvc2VkLCBtZWFzdXJlcyBpdCwgYW5kIG5hbWVzIHdoYXQgc3RheWVkIHJlZnVzZWQJMDI2ZmNmODk0YTI2ZmYxM2U2N2FmZDM4ZThkZjRkMWUzZmM4OTk1N2M2ZWQyNDZiYzhkMWNlMWM5MGM0NTI3OQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJbXV0YXRlIC0tcmVwb2ludCByZWFkcyBhIHNjcmF0Y2ggcmVwb3NpdG9yeSwgd3JpdGVzIG5vdGhpbmcsIGFuZCBleGl0cyAxIHdoaWxlIGFuIGVudHJ5IGlzIHN0YWxlCWFlNzVhZjI2ZDM2OTEyNDU2ZTI4M2ZhODRjYzJmNDY5ZGYxZjQ1YTBmNDViZmVkOWJkNDcxNmJkZjU2OGJjZDAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCW11dGF0ZSAtLXN0YWxlIG92ZXIgdGhlIHJlYWwgY2F0YWxvZ3VlIGV4aXRzIDAgYW5kIHNheXMgZXZlcnkgZW50cnkgbWF0Y2hlcwk4MWFhYWE2ZmY5YjkxM2JmNWY3MDcxMzc1YWExYzgxZjAyYmNkNjViMGJkNmY2ZWU0MmVjNTU1NDJjYjE5YzYwCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlvbmx5IFJFRCBpcyByZXVzYWJsZQlhZjc4NzRmYWUwNjMwMjQyNWYwZWUwYjVmOWVmZDJhMjFjOTA5ODY3ODY3YTdlNmI2MTc2OGJiZjc0ODU3OWY5CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlyZXBvaW50RW50cnkgcmVwcm9kdWNlcyB0aGUgbWVjaGFuaWNhbCByZXBvaW50cyBvZiB0aGUgMy4xLjAgYmF0Y2ggYW5kIHJlZnVzZXMgdGhlIHJlc3QJZjVhZTViMTZlNWY3NGQ3YThjZDk3MWUyNTA3MWEzMWFjOWU3MWRkMDkyNDJiMDZkMTYyYWMwMGVjYTY3NWEyYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJc2hhcmRzIGFyZSBiYWxhbmNlZCBieSBtZWFzdXJlZCBjb3N0IHdoZW4gdGltaW5ncyBleGlzdAlhNTAyYjQ5MDNiZjFiMDJlMzU5MTdlMDg3NzAxMzU3MzMzYTU0YzA1N2QyMDdmNGU0Y2Q1MDUxZjkwYzg5YWQxCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlzdGFsZUVudHJpZXMgbmFtZXMgZWFjaCBlbnRyeSB0aGF0IG5vIGxvbmdlciBtYXRjaGVzIG9uY2UsIHdpdGggd2hlcmUgaXRzIGxpbmUgd2VudAkyNzlhY2M3YTZmZTkyYjY3ZmM5OTUyMjdmNDliOTE1ZjkyMTNkNzdmZDliNjFmMTFmNzQ5Mzk5N2NkM2I1MzViCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl0aGUgcmVwb3J0IG5hbWVzIHRoZSBraWxsZXIgYmVzaWRlIGEgUkVEIHZlcmRpY3QJZDQ0OWMwNzljMjkxMWM4OTBjZjU2MTM2M2Y4YzgxZTNjMDA0YWY5YzE1ZGRjZDdiZjdkOWU1NTgyZGUwMDI0NApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJdGhlIHN1bW1hcnkgZGlzdGluZ3Vpc2hlcyBtZWFzdXJlZCBmcm9tIHJldXNlZAlmYjMzZTZlZTEzMzMwNzRlYjBhODNmYzU2ZDFjN2E1M2NhOGQ2YTBmZGI2OTQxOWI0NTkxOWRjNTdiNjgzOWQ2CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl0b3VjaGVkQnkga2VlcHMgYW4gZW50cnkgd2hvc2UgbXV0YXRlZCBsaW5lIHdhcyBhZGRlZCBieSB0aGUgY2hhbmdlLCBhbmQgb25seSB0aG9zZQkwZDM2OGYzMWQ2M2U4MmI2OGQ2ZmNjNDg2NGQyMTZlMjNmNTdmZmYzM2UzYmMxYmQ1ZWJjMDRjMjI5ZTM2ZDk1CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl3aXRoIG5vIHRpbWluZ3MgYXQgYWxsIGl0IHN0aWxsIHBhcnRpdGlvbnMsIGFuZCBzYXlzIG5vdGhpbmcgYWJvdXQgYmFsYW5jZQk1MmNhODlkNzQyYzI0YTcxMzBlNWIwY2NkODhiYzJkNDU5M2FjYzk5ZmU3NjNmYmY2NWQ1N2MzMWRjYzBjYjg3
  ```
  --- last 10 line(s) of stderr (of 31 after folding 31 raw)
    ...
  1..1
  # tests 1
  # suites 0
  # pass 0
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 134.205667
  ```
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · ms:5540
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · ms:5016
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · ms:4445
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · ms:3562
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:a86246912013c58636c63497618a6cf3f16b584a67f70de99642d8931a5b0a6e · ms:4021
