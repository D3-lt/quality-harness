# Task ADR-069-T1: The repoint rule, the root resolver, and the read-only flag

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one script, its test, a scratch-repository fixture)
**Owner:** unassigned
**Produces:** `repointEntry(entry, text, added)` and `campaignPaths(root)` exported from `scripts/mutate.mjs`; the `--repoint`, `--since` and `--root` flags
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the entry's own edit`, `an unchanged sibling is refused`, `a rewrite is refused`, `one root`, `the flag is reachable`

## Goal

`repointEntry` proposes a new `from`/`to` for a stale single-line entry under ADR-069 Decision conditions 1-5 and refuses, naming the failed condition, everything else. `campaignPaths(root)` gives the catalogue, lock, journal and cache of one root, and every read in `mutate.mjs` goes through it. `mutate.mjs --repoint [--since <ref>] [--root <dir>]` prints each proposal and refusal, writes nothing, and exits 1 while anything is stale.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `repointEntry`; `campaignPaths` replacing the module-level `root`, `catalogue` and `journalPath` reads and the lock and cache paths; `--repoint`, `--since`, `--root` in the flag set, the usage line, and the read-only branch beside `--stale` |
| `tests/mutate-runner.test.mjs` | edit | the replay rows, the resolver, and the flag over a scratch repository |
| `tests/fixtures/mutate-repoint/replay.json` | new | the twelve replay rows, taken once from the catalogue's history |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the three tests below and see each fail on an assertion (TDD red): the exports do not exist, and `--repoint` is refused as an unknown option.
2. [S2] Put the twelve replay rows of ADR-069 Context into the first test, each with its old `from`/`to`, the post-change source inline (never a path into this repository), and the lines that change added: the six mechanical rows must be proposed byte-equal to the hand repoint, the six rewrites refused. Add the dirty twins each condition needs: a multi-line entry, an insert-only entry, an entry matching twice, a nearest line occurring twice as a substring (one copy more indented), and the sibling (the entry's line deleted, a near-identical unchanged line left).
3. [S3] Implement `repointEntry`, checking the conditions in ADR-069's order, each refusal naming its condition; the nearest line is the whole line at `staleEntries`' line number, not its trimmed hint text.
4. [S4] Implement `campaignPaths(root)` and route the catalogue, lock, journal and cache through it. The catalogue is read when a run starts, not at import, so `--root` can choose it.
5. [S5] Add `--repoint`, `--since <ref>` (default `HEAD`) and `--root <dir>` beside `--stale`, answered before the campaign lock, printing old and new lines for a proposal and the reason for a refusal. [proof: acceptance]
6. [S6] Record mutants with `adr-verify --mutant`: the `oldMid` count check accepts any count; condition 4 counts whole lines instead of substrings; condition 5 is dropped; a multi-line entry is not refused; `campaignPaths` places the journal under this repository whatever the root; `--repoint` is removed from the flag set. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/mutate-runner.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (repointEntry reproduces the mechanical repoints of the 3.1.0 batch and refuses the rest|campaignPaths keeps every campaign file inside the root it is given|mutate --repoint reads a scratch repository, writes nothing, and exits 1 while an entry is stale)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `repointEntry reproduces the mechanical repoints of the 3.1.0 batch and refuses the rest` | `tests/mutate-runner.test.mjs` | the six mechanical replay rows are proposed byte-equal to the hand repoint; the six rewrites, the sibling and each dirty twin are refused with the condition that failed | none | S1, S2, S3 |
| `campaignPaths keeps every campaign file inside the root it is given` | `tests/mutate-runner.test.mjs` | for a scratch root, the catalogue, lock, journal and cache all resolve inside it; for the default, they resolve where they do today | none | S1, S4 |
| `mutate --repoint reads a scratch repository, writes nothing, and exits 1 while an entry is stale` | `tests/mutate-runner.test.mjs` | in a scratch git repository with one stale mechanical entry and one rewrite: the proposal and refusal are printed, exit 1, the catalogue and sources are byte-unchanged; the clean twin (no stale entry) exits 0 | none | S1, S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `repointEntry`, `campaignPaths` |
| 2 — something selects it | `--repoint` in `main`'s flag handling; the mutant removing it from the flag set |
| 3 — the caller can discover it | the usage line, printed for an unknown option |
| 4 — it is used | nothing measures this yet; ADR-069's follow-up counts it after the next refactor batch |

## Mutation Log
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · the edited text is accepted on the nearest line however often it occurs · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · covers:a rewrite is refused
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · condition 4 counts whole lines, so a more-indented copy of the nearest line is not seen · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · covers:the entry's own edit
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · condition 5 is dropped: a sibling the change never added is proposed · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · covers:an unchanged sibling is refused
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · a multi-line entry is not refused at condition 1 · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · covers:a rewrite is refused
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · campaignPaths puts the journal under this repository whatever the root · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · covers:one root
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · --repoint is no longer an accepted option · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · covers:the flag is reachable
- 2026-09-27 · a11f334* · mutant killed · exit 1 · `scripts/mutate.mjs` · --repoint exits 0 while an entry is stale · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · covers:the flag is reachable

## Invariants

- `repointEntry` and `campaignPaths` are pure: no file, process or environment read.
- `--repoint` without `--write` writes nothing, and takes no lock.
- A refusal always names which of ADR-069's conditions failed.
- With no `--root`, every path is where it is today.

## Risks

- Moving the catalogue read out of import time touches every campaign path; the existing mutate-runner tests and one full `--case` run over an unrelated family must stay green.

## Stop Condition

Stop and ask if any of the six mechanical replay rows cannot be reproduced byte-equal, or any rewrite or sibling is proposed: the rule then does not match the measurement ADR-069 rests on.

## Out of Scope

- Writing the catalogue (T2's job).
- Multi-line and insert-only entries (deferred: docs/BACKLOG.md §301)

## Verification Log
- 2026-09-27 · a11f334* · exit 1 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:201 · test-lock-sha256:2f306facc69f712b89617231ae8774db46daa5af62ed2036e4a2143d63f2611d · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJLS1jaGFuZ2VkIHJlYWRzIGl0cyBkaWZmIGluIG9uZSBzaGFwZSB3aGF0ZXZlciB0aGUgdXNlciBjb25maWd1cmVkCTY5NmQ3ZDk2NTExYTQ2ZDAwNTQxYWE3YmRhZWIyNDQ5NTBlZjEyNjIwODU3NzU5Mjk0Y2NiNDcxOTU2ZTI4YmUKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCS0tY2hhbmdlZCBzZWxlY3RzIGEgc2hvcnQgbXV0YW50IGJ5IHdoZXJlIHRoZSBjaGFuZ2UgYWRkZWQgaXQJMTI4YjFkMWRhZmIwZmYyN2JjZWRiMzcxOTk5ZWEzOTNkZjI2OWQ0NTEzM2UxYjhiOGZmMjFkNTE0ZjBkYzAyZgpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJR1JFRU4gYW5kIFNUQUxFIGJvdGggY291bnQgYXMgbWlzc2VkIGFuZCBleGl0IDEJMDZmNmMwZmMyMGYwZTM3NGEyYTU4YjE2MTc0OGM1MjY3ZTQyZDdiNDk1MTYzOWQ3MzY1OThlMDlkYjQwOTQxNwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJVU5QUk9WRU4gZW50cmllcyBhcmUgaW4gbmVpdGhlciBoYWxmIG9mIHRoZSBub3RpY2VkIHJhdGlvCWM1MTMxYWYyMTdlMDg2NjAyNjEwMzgxMDMwYWM1NjE1NjBhOTVlNjk1MGE0M2E4NDhlMWU4NjgwZmY1ZWViNTgKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWBvbmx5YCBiZWNvbWVzIGEgLS10ZXN0LW5hbWUtcGF0dGVybiBmb3IgdGhlIG11dGFudCBhbmQgaXRzIGJhc2VsaW5lIGFsaWtlLCBhbmQgbm90aGluZyB3aXRob3V0IGl0CTQyY2E2NzAzNGQwYmZhMGY2NmQ5MzU1ODIxYzlhN2U3MGQ0MDU3ZWU2MDAwY2NiNGIzNDMwNTJiY2EzNjcxM2IKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgYmFzZWxpbmUgaXMgdGFrZW4gb25jZSBwZXIgZGlzdGluY3QgdGVzdC1zZXQsIG5vdCBvbmNlIHBlciBtdXRhdGlvbgljMTUzYjM3YjQ3NzQwYjdkZGExODI5ZDgxNDRhZjZkNTU4Zjk1OGNjNjM1ZTFlM2U0NzRjNWZhNWFiYzc2YzIzCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGJhc2VsaW5lIHRha2VuIHVuZGVyIG9uZSBwYXR0ZXJuIGxpY2Vuc2VzIG5vdGhpbmcgYWJvdXQgYW5vdGhlcglkZDlkYWRlOGRhMTk4OTQ0MzEwZjkyYjJiNjFjNmJhOWE3NDk5YmUzMDQwYTVlOWJlMGFjZTdhNmMxYjM0NTA3CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGJhc2VsaW5lIHRoYXQgbmV2ZXIgcmFuIGlzIG5vdCByZXBvcnRlZCBhcyBhbiBhbHJlYWR5LWZhaWxpbmcgc3VpdGUJNzdjODJkNmZkZGFkNTU1YWIxN2M0NDA1M2IxNjg4YWZkOTUwNWE4NmM2NjVmNDE5YzBiNGQ1NzJkNDc1M2JmOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBjaGFuZ2VkIHN1YmplY3QsIHRlc3Qgb3IgZWRpdCBpcyBhIGRpZmZlcmVudCBtdXRhbnQJOTEyZWNiYjY0MjBiYmI0NWQ2MWQ0M2Q5NWNkYjA4MjFmOGRlMjY1MDIwMjFmYTdhNDM5ZTg1Yzk1MWNhMGEwYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBjaGVja291dCBwYXRoIHdpdGggYSBzcGFjZSBpcyBzdGlsbCBhbiB1bnJ1biBiYXNlbGluZSB3aGVuIG5vdGhpbmcgbWF0Y2hlZAk4NTljNDZjMTRiMTE1ZTM4NDhjNWQwYWVkZDYzZmY3NDNmNTM2OGQ2Y2FhNGM0M2M5MzlkODI3YWU5ZGNkNjhmCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGZvcmNlZCBydW4gcmV1c2VzIG5vdGhpbmcJODg1MDU4MTcyMDZhOWNiOGFmZDMxOTRlZDAzZjlhMTEzNDE2YTVlODhhNTg0MTQ2MWNhMjQ2ZGI0Nzk1MjFhNQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBraWxsIG5hbWVzIHdoaWNoIHRlc3RzIGZhaWxlZCwgc28gdGhlIHdyb25nIGtpbGxlciBpcyB2aXNpYmxlCWNlYjI0MjczMzBiNjQ5YmZhOWY2MzdhODY4ZmRlNmQxZGUwOTBiZGFlYjNjNzI5ZmJjMzEzMWE1MWQ4MTEwODEKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgcGFydGl0aW9uIHN0YXlzIGEgcGFydGl0aW9uIGhvd2V2ZXIgdGhlIGNvc3RzIGZhbGwJN2E2NmI4NTc3NmJhMzI5NzcyOGUxZjk1YWE3YTZlMTMwYzQ3OTM3MTFhNjg4ZGFjMjI2YmZkMDU0ZjM4YzFhZApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBwYXNzaW5nIGJhc2VsaW5lIGxlYXZlcyBldmVyeSBleGlzdGluZyB2ZXJkaWN0IGV4YWN0bHkgYXMgaXQgd2FzCTk3YjI4NWZhNTU4OWE0ZTliZmUxM2EzNWQ1YjkzOTQwNDk4ZDI2YjE5MWIyOTgwYmE5NjczNWQ3YzY2NDkwMWEKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgcnVuIGluIHdoaWNoIG5vIHRlc3QgZXhlY3V0ZWQgaXMgYW4gdW5ydW4gYmFzZWxpbmUsIG5ldmVyIGEgcGFzc2luZyBvbmUJN2Y4ODFiZGQ4YzdmNzc0Zjk1YmNhMmJjZGQzOGY1ZjJlY2RiZGNhNmNhZTU0ZGUxOTA0N2UwYzE4OWNjZDE5YQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBydW4ga2lsbGVkIGJ5IHNpZ25hbCBpcyBIVU5HIHJhdGhlciB0aGFuIEdSRUVOCWMxYTZiZDkyMTI5NzIwYzI1MDhjOGJhNmVjOGY3OTNhODBhNTM2NGIwNzIzOGUwY2RiYjIyOWJkODZiYmE2NDkKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgc3RhbGUgZW50cnkgaXMgZGVjaWRlZCBiZWZvcmUgYW55IGJhc2VsaW5lLCBiZWNhdXNlIG5vdGhpbmcgd2FzIGFwcGxpZWQJZTlhMWUxNDZkZTVhYzViZDdhMzQwYWUzODFiZDNiMTY5Y2UxYjZjMDllNDQwY2ZlMjdjYjZmYjYyMzYxZjRhOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBzdGFsZSBtdXRhdGlvbiBpcyByZXBvcnRlZCBhcyBzdGFsZSwgbm90IGFzIGEgdGVzdCB0aGF0IGZhaWxlZCB0byBub3RpY2UJNWRlOWFlNzFlMGJhNmRmYzAwYWFlZTgwZDIwMmI1YWNkMTZhNDdmNWM3NzZjMWE1MGQyNmM2NDliNmNhMjYyOQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBzdGFsZSBtdXRhdGlvbiByZW5kZXJzIGEgbGluZSByYXRoZXIgdGhhbiBhIGJsYW5rCTljOTM1ZTQ1ZTkyMmY3YjMwNTZjNGU3ZGQ1MzI5YTNkMDEzMGMyZDU0NDM4ODE2MWVmZjNhYmE1YjExNDY3MWUKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgdGVzdCBuYW1lIHRoYXQgbWVudGlvbnMgYSBkaXJlY3RvcnkgaXMgYSBuYW1lLCBub3QgYSBmaWxlIHBhdGgJYmJiMGVlMGUzY2E1NmUxZDBhZWMxYjQyMmUzNDI4ZDczZGQwZTIyZjBlNDhmMzBkOTdmOGE3MzI0ZThkNGY3Mwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSB2ZXJkaWN0IHRha2VuIGFnYWluc3QgYSBmYWlsaW5nIGJhc2VsaW5lIGlzIFVOUFJPVkVOLCBub3QgUkVECWQ3MTQwYmVjY2RkZTJjZjRiNWY1ZjBkNGU1MjMwM2ZmOWNiNTkyNTJiM2VlMDJiN2IwOTBjNThhYmIyMTM5OWYKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIFVOUFJPVkVOIGVudHJ5IG5hbWVzIGl0cyB0ZXN0LXNldCBhbmQgdGhlIG5leHQgYWN0aW9uCWZjNmM5M2M0NGMxZTMzNWEwNGI3NmZjYTNiMmY4MmE3OTQzNWY5YzU3ODU0NzA1ODU4MDdiODhiZDNiYWQ0MzAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIFVOUFJPVkVOIGVudHJ5IHN0aWxsIHJlcG9ydHMgdGhlIHZlcmRpY3QgdGhlIHRlc3RzIHByb2R1Y2VkCTRlYzdjY2VhYjZlZjczOGMwZmIzMTI0MmQzNzkwZWQ4ZDU0OGJlMzU1MjllZDBjMGU1YjI1MjVjZmM5YTU2MTAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIGFic2VudCBvciB1bnJlYWRhYmxlIGNhY2hlIG1lYXN1cmVzIGV2ZXJ5dGhpbmcJNzk2NjQ0MGJiYmQyN2VmNzFjMDA4NDE1MDMwMDg1MDhmZTBiMWQxMzgxZTQ0NTAyZWM2M2I3MjFjNzliZGVlYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYW4gZXhhY3QgY29udGVudCBtYXRjaCByZXVzZXMgYSBSRUQgdmVyZGljdAkwNmQxZjBmNjdhYTc1NDA1MjZiZGFmOWI3MzZlOGFmMjFjYWYxZjI5Yzg5YTU3NTQ1NWZiNGJmZmFiZWVhNjQwCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhbiBpbmhlcml0ZWQgRk9SQ0VfQ09MT1IgaXMgZHJvcHBlZCwgc28gYSByZWFsIHJ1biBzdGlsbCBjb3VudHMgaXRzIHRlc3RzCWI4NjRmNGU0YzBiMmU5NGY3MDE1MTA4Yjc3YjFiYjU0MTkzODQ2YTRlMjFhYmQwZWYwYzYyZDcyYTc5MGI0MmQKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIHVucmVhZGFibGUgaW5wdXQgaGFzIG5vIGtleSwgc28gaXQgaXMgbWVhc3VyZWQJZGFiZmUyOTcwYWIyZDczN2U3YjJhM2MwZDY5ZWJjMTdhYjk4Njk4MWYwYTk5NzM2MTcyOWRmNjYzN2Q4MjM1NApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJY2FtcGFpZ25QYXRocyBrZWVwcyBldmVyeSBjYW1wYWlnbiBmaWxlIGluc2lkZSB0aGUgcm9vdCBpdCBpcyBnaXZlbgk5NDYyYWUzY2ZkYzZiMTM5YzhmZjU1ZTU1NTYwNTZmMWUyNmJkNzNhYTJlZGVhMTYwMzBlNzY2ODk3MTlmMWRjCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwllbmQgdG8gZW5kOiBhIG5vbnNlbnNlIHBhdHRlcm4gdW5kZXIgYW4gaW5oZXJpdGVkIGRvdCByZXBvcnRlciBpcyB1bnJ1biwgYW5kIGEgbWF0Y2hpbmcgb25lIHBhc3NlcwlkOWQ3MDAyYWY5Njg3ZTY3ZDk4NzdkN2VhYTNjZmQ5Y2RjODM4NDU1OWVkY2ZlY2I4MDM3ZDc4ZGQxZDU4YzJiCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlraWxsZXJzIGFyZSByZW5kZXJlZCBvbmUgcGVyIGxpbmUsIGJlY2F1c2UgbmFtZXMgY29udGFpbiBjb21tYXMJZmU5NzQxNzRjMDg3ZjFiYzQ1ZjM0MDc0ZDIxZGU0YTJmMjNkMzcyYjAxNjJlNGFmYjAwOGVhOTgyYzliMzU1Mgpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJbXV0YXRlIC0tcmVwb2ludCByZWFkcyBhIHNjcmF0Y2ggcmVwb3NpdG9yeSwgd3JpdGVzIG5vdGhpbmcsIGFuZCBleGl0cyAxIHdoaWxlIGFuIGVudHJ5IGlzIHN0YWxlCWFlNzVhZjI2ZDM2OTEyNDU2ZTI4M2ZhODRjYzJmNDY5ZGYxZjQ1YTBmNDViZmVkOWJkNDcxNmJkZjU2OGJjZDAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCW11dGF0ZSAtLXN0YWxlIG92ZXIgdGhlIHJlYWwgY2F0YWxvZ3VlIGV4aXRzIDAgYW5kIHNheXMgZXZlcnkgZW50cnkgbWF0Y2hlcwk4MWFhYWE2ZmY5YjkxM2JmNWY3MDcxMzc1YWExYzgxZjAyYmNkNjViMGJkNmY2ZWU0MmVjNTU1NDJjYjE5YzYwCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlvbmx5IFJFRCBpcyByZXVzYWJsZQlhZjc4NzRmYWUwNjMwMjQyNWYwZWUwYjVmOWVmZDJhMjFjOTA5ODY3ODY3YTdlNmI2MTc2OGJiZjc0ODU3OWY5CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlyZXBvaW50RW50cnkgcmVwcm9kdWNlcyB0aGUgbWVjaGFuaWNhbCByZXBvaW50cyBvZiB0aGUgMy4xLjAgYmF0Y2ggYW5kIHJlZnVzZXMgdGhlIHJlc3QJZjVhZTViMTZlNWY3NGQ3YThjZDk3MWUyNTA3MWEzMWFjOWU3MWRkMDkyNDJiMDZkMTYyYWMwMGVjYTY3NWEyYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJc2hhcmRzIGFyZSBiYWxhbmNlZCBieSBtZWFzdXJlZCBjb3N0IHdoZW4gdGltaW5ncyBleGlzdAlhNTAyYjQ5MDNiZjFiMDJlMzU5MTdlMDg3NzAxMzU3MzMzYTU0YzA1N2QyMDdmNGU0Y2Q1MDUxZjkwYzg5YWQxCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlzdGFsZUVudHJpZXMgbmFtZXMgZWFjaCBlbnRyeSB0aGF0IG5vIGxvbmdlciBtYXRjaGVzIG9uY2UsIHdpdGggd2hlcmUgaXRzIGxpbmUgd2VudAkyNzlhY2M3YTZmZTkyYjY3ZmM5OTUyMjdmNDliOTE1ZjkyMTNkNzdmZDliNjFmMTFmNzQ5Mzk5N2NkM2I1MzViCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl0aGUgcmVwb3J0IG5hbWVzIHRoZSBraWxsZXIgYmVzaWRlIGEgUkVEIHZlcmRpY3QJZDQ0OWMwNzljMjkxMWM4OTBjZjU2MTM2M2Y4YzgxZTNjMDA0YWY5YzE1ZGRjZDdiZjdkOWU1NTgyZGUwMDI0NApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJdGhlIHN1bW1hcnkgZGlzdGluZ3Vpc2hlcyBtZWFzdXJlZCBmcm9tIHJldXNlZAlmYjMzZTZlZTEzMzMwNzRlYjBhODNmYzU2ZDFjN2E1M2NhOGQ2YTBmZGI2OTQxOWI0NTkxOWRjNTdiNjgzOWQ2CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl0b3VjaGVkQnkga2VlcHMgYW4gZW50cnkgd2hvc2UgbXV0YXRlZCBsaW5lIHdhcyBhZGRlZCBieSB0aGUgY2hhbmdlLCBhbmQgb25seSB0aG9zZQkwZDM2OGYzMWQ2M2U4MmI2OGQ2ZmNjNDg2NGQyMTZlMjNmNTdmZmYzM2UzYmMxYmQ1ZWJjMDRjMjI5ZTM2ZDk1CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl3aXRoIG5vIHRpbWluZ3MgYXQgYWxsIGl0IHN0aWxsIHBhcnRpdGlvbnMsIGFuZCBzYXlzIG5vdGhpbmcgYWJvdXQgYmFsYW5jZQk1MmNhODlkNzQyYzI0YTcxMzBlNWIwY2NkODhiYzJkNDU5M2FjYzk5ZmU3NjNmYmY2NWQ1N2MzMWRjYzBjYjg3
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
  # duration_ms 85.984334
  ```
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:2005
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:1857
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:1984
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:2000
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:1985
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:1767
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:1824
- 2026-09-27 · a11f334* · exit 0 · `set -o pipefail …` · acceptance-sha256:d21447ec075866d3b7050a1485c05f97ab7c01714edfce067668ac3ea7b97d0a · ms:3331
