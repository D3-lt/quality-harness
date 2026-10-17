# Task ADR-107-T3: A session with mrw on PATH is told it is there

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one conditional line, one test)
**Owner:** unassigned
**Produces:** the SessionStart line said when `mrw` resolves on PATH
**Consumes:** the section `## Read and edit in batches` (T1)
**Proof map:** v1

## Goal

At SessionStart, a session where `mrw` resolves on PATH is told, in one line, to read every site in one `mrw read` and
apply every edit in one `mrw write` plan; a session without it sees nothing new (ADR-107, Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/session-orientation.mjs` | edit | the line, said only when `mrw` resolves and answers `--version` in its own shape |
| `tests/mrw-way.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/session-orientation.mjs.json` | edit | the catalogue mutants |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: no line with `mrw` on PATH).
2. [S2] Resolve `mrw` on PATH without a shell and with a timeout, check its `--version` answer, and say the line once per
   session; resolve nothing on Windows by name alone (`mrw.exe` too).
3. [S3] Add the catalogue mutants (the line always said; the line never said) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/mrw-way.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a session with mrw on PATH is told it is there, and a session without it is told nothing")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a session with mrw on PATH is told it is there, and a session without it is told nothing` | `tests/mrw-way.test.mjs` | through the real SessionStart hook: a stub `mrw` on PATH answering its version shape gives the line once; an empty PATH gives no line; a stub answering another shape gives no line | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the line in `session-orientation.mjs` |
| 2 — something selects it | `mrw` resolving on PATH |
| 3 — the caller can discover it | the SessionStart output |
| 4 — it is used | the test drives the real hook |

## Mutation Log
- 2026-10-17 · 1e125bf9* · mutant killed · exit 1 · `plugin/scripts/session-orientation.mjs` · a different binary called mrw would be pointed to as mrw · acceptance-sha256:6470196f320cf9618e2e333ef9011b5f9f9093f7ae9a3818839985719431bd87
- 2026-10-17 · 1e125bf9* · mutant killed · exit 1 · `plugin/scripts/session-orientation.mjs` · a session without mrw would be told to use it · acceptance-sha256:6470196f320cf9618e2e333ef9011b5f9f9093f7ae9a3818839985719431bd87

## Invariants

- A session without `mrw` gets byte-identical SessionStart output.
- The probe is bounded and hidden (CLAUDE.md §7: `windowsHide`, a timeout).

## Risks

- None beyond ADR-107's.

## Stop Condition

Stop and ask if resolving `mrw` adds more than 50 ms to SessionStart on this machine, measured unloaded.

## Out of Scope

- Saying it on every prompt (permanent: boundary: a standing fact is said once, ADR-094)

## Verification Log
- 2026-10-17 · 1e125bf9* · exit 1 · `out=$(node --test --test-reporter=tap tests/mrw-way.test.mjs 2>&1) \ …` · acceptance-sha256:6470196f320cf9618e2e333ef9011b5f9f9093f7ae9a3818839985719431bd87 · ms:597 · test-lock-sha256:5084a8b745a53af480e5091a397c15696d05664b58768e09bd3a940599e5c369 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbXJ3LXdheS50ZXN0Lm1qcwlhIHNlc3Npb24gd2l0aCBtcncgb24gUEFUSCBpcyB0b2xkIGl0IGlzIHRoZXJlLCBhbmQgYSBzZXNzaW9uIHdpdGhvdXQgaXQgaXMgdG9sZCBub3RoaW5nCTQ5MTMyOTQ2ZTFhYWRjMTdjZTAwMmI0NTIxNGU1NjZmMWI0NDIxNjhkM2M5MWRlOTExOWFhZjY3Y2QxZThiYjEKYm9keQl0ZXN0cy9tcnctd2F5LnRlc3QubWpzCW1ydyBpcyByZXNvbHZlZCBmcm9tIFBBVEggdGhlIHdheSB0aGUgcGxhdGZvcm0gcmVzb2x2ZXMgaXQsIHdpdGhvdXQgYSBzaGVsbAkxYjI1Nzg1ZWYwNmE3YzhmOGU4NzBhMWY2OTNjMjU2MDBiNDcxNmM0YzI1MTQwYjVlMDk5ODU4ZGI2ZjAyMzhkCmJvZHkJdGVzdHMvbXJ3LXdheS50ZXN0Lm1qcwl0aGUgaW1wbGVtZW50aW5nIHNraWxscyB0ZWFjaCBvbmUgcmVhZCBvZiBldmVyeSBzaXRlLCBvbmUgYmF0Y2ggb2YgZWRpdHMsIGFuZCBhIGNoZWNrIHRoYXQgZWFjaCBlZGl0IGxhbmRlZAlhZDcxMTZiM2FlOTEyM2ZlOWUzMDRjMDIxMDZmMjUzNDJhMjUxYWYzYmU4MzFiNzc3NzA3YzVlMGNkNWE0NTAw
  ```
  ```
- 2026-10-17 · 1e125bf9* · exit 0 · `out=$(node --test --test-reporter=tap tests/mrw-way.test.mjs 2>&1) \ …` · acceptance-sha256:6470196f320cf9618e2e333ef9011b5f9f9093f7ae9a3818839985719431bd87 · ms:899
- 2026-10-17 · 1e125bf9* · exit 0 · `out=$(node --test --test-reporter=tap tests/mrw-way.test.mjs 2>&1) \ …` · acceptance-sha256:6470196f320cf9618e2e333ef9011b5f9f9093f7ae9a3818839985719431bd87 · ms:946
- 2026-10-17 · 1e125bf9* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:6470196f320cf9618e2e333ef9011b5f9f9093f7ae9a3818839985719431bd87 · ms:0 · test-lock-sha256:e1382bc4fc09170622a4844c17b97dd32379708d8959bd7b8d6efde7e11fd76a · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbXJ3LXdheS50ZXN0Lm1qcwlhIHNlc3Npb24gd2l0aCBtcncgb24gUEFUSCBpcyB0b2xkIGl0IGlzIHRoZXJlLCBhbmQgYSBzZXNzaW9uIHdpdGhvdXQgaXQgaXMgdG9sZCBub3RoaW5nCTdhNjUzZmNiN2QyYTQwMmQwOGRkMDQ2MzMwMjYyOWNlNTliNjM2NDM1NDg2MDNlM2U2YmZhOGIzZDZiNmYxOTUKYm9keQl0ZXN0cy9tcnctd2F5LnRlc3QubWpzCW1ydyBpcyByZXNvbHZlZCBmcm9tIFBBVEggdGhlIHdheSB0aGUgcGxhdGZvcm0gcmVzb2x2ZXMgaXQsIHdpdGhvdXQgYSBzaGVsbAkxYWZkZDU3OTIzMDhjNjZhYTkwYmUwNWE5Y2QwZmJkNDZlNjg4M2M0ZDljMjE3MGUyOTcyZjdiZGFjMjg5NzBkCmJvZHkJdGVzdHMvbXJ3LXdheS50ZXN0Lm1qcwl0aGUgaW1wbGVtZW50aW5nIHNraWxscyB0ZWFjaCBvbmUgcmVhZCBvZiBldmVyeSBzaXRlLCBvbmUgYmF0Y2ggb2YgZWRpdHMsIGFuZCBhIGNoZWNrIHRoYXQgZWFjaCBlZGl0IGxhbmRlZAlhZDcxMTZiM2FlOTEyM2ZlOWUzMDRjMDIxMDZmMjUzNDJhMjUxYWYzYmU4MzFiNzc3NzA3YzVlMGNkNWE0NTAw · test-lock-kind:replace
- 2026-10-17 · 35c2cbcc* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:6470196f320cf9618e2e333ef9011b5f9f9093f7ae9a3818839985719431bd87 · ms:0 · test-lock-sha256:b52245983141d9e671efba5d477c25e5047d43d5dbe475d75f29261dd0c23f9c · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbXJ3LXdheS50ZXN0Lm1qcwlhIHNlc3Npb24gd2l0aCBtcncgb24gUEFUSCBpcyB0b2xkIGl0IGlzIHRoZXJlLCBhbmQgYSBzZXNzaW9uIHdpdGhvdXQgaXQgaXMgdG9sZCBub3RoaW5nCTMxZWMyODdiYmRhZDA1YTg1YjY1NmY0YWM4M2IwYjk1OWQ5ZjA0ZDIwOGM2ZmE1ZGNjMmIwZGMyN2U0MDg3OGQKYm9keQl0ZXN0cy9tcnctd2F5LnRlc3QubWpzCWNvcnB1cy1wcm9iZSBhc2tzIFNlc3Npb25TdGFydCBhYm91dCB0aGUgY29ycHVzLCBub3QgYWJvdXQgdGhlIG1hY2hpbmUgaXQgcnVucyBvbgk2ZjU4Mzk0NTNhNTBiY2ZhMjQ1YzJlZGJkZDRkYTU2NmJjMmFkOTEyNTMxOTAyY2I2MWNlZTZhMjBlZmE0OThhCmJvZHkJdGVzdHMvbXJ3LXdheS50ZXN0Lm1qcwltcncgaXMgcmVzb2x2ZWQgZnJvbSBQQVRIIHRoZSB3YXkgdGhlIHBsYXRmb3JtIHJlc29sdmVzIGl0LCB3aXRob3V0IGEgc2hlbGwJMWFmZGQ1NzkyMzA4YzY2YWE5MGJlMDVhOWNkMGZiZDQ2ZTY4ODNjNGQ5YzIxNzBlMjk3MmY3YmRhYzI4OTcwZApib2R5CXRlc3RzL21ydy13YXkudGVzdC5tanMJdGhlIGltcGxlbWVudGluZyBza2lsbHMgdGVhY2ggb25lIHJlYWQgb2YgZXZlcnkgc2l0ZSwgb25lIGJhdGNoIG9mIGVkaXRzLCBhbmQgYSBjaGVjayB0aGF0IGVhY2ggZWRpdCBsYW5kZWQJYWQ3MTE2YjNhZTkxMjNmZTllMzA0YzAyMTA2ZjI1MzQyYTI1MWFmM2JlODMxYjc3NzcwN2M1ZTBjZDVhNDUwMA · test-lock-kind:replace
