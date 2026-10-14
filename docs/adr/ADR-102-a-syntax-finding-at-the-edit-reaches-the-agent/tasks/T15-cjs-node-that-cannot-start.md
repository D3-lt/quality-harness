# Task ADR-102-T15: a node that cannot start says nothing about a .cjs file

**Depends-on:** T11
**Covers:** none — no spec
**Estimated scope:** S (one case, one test)
**Owner:** the owner, 2026-10-14 ("Go", on the 3.8.29 batch)
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic; `NODE_OPTIONS` names a module that does not exist, and the fence refuses a skip
**Proof map:** v1

## Goal

T11 made a `node` that cannot start `UNRUN` on the JSON path; the `.cjs` path, `node --check`, still printed such a failure,
minus stack frames, as a finding about the file (BACKLOG §378, the sibling named with T11). `node --check` reports a syntax
error as `SyntaxError: …`; output without it is node failing before or around the parse, and is `UNRUN` (ADR-102, Decision 13).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | the `.cjs` branch names the file only when the output carries `SyntaxError` |
| `tests/post-edit-check.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entry below; T6's entry follows its line |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: a valid `.cjs` is named with `MODULE_NOT_FOUND`).
2. [S2] Name the file only when the filtered output carries `SyntaxError`; say `UNRUN` otherwise.
3. [S3] Record a killed mutant: the `SyntaxError` condition removed. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - (a node that cannot start says nothing about a \.cjs file|a checker that fails without a word is UNRUN, and the hook exits 0)")" = 2 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a node that cannot start says nothing about a .cjs file` | `tests/post-edit-check.test.mjs` | with a missing `NODE_OPTIONS` module, a valid and a broken `.cjs` both draw `UNRUN` and never `MODULE_NOT_FOUND`; without it, the broken one is still named with its `SyntaxError` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · 712945ad* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · any non-empty output of node --check names the file again, so a node that cannot start names a valid .cjs · acceptance-sha256:f59e04240260b1511e57a62a3dfb7fa6e51c363768a5954a2d47a914301f79ba

## Invariants

- A broken `.cjs` is named with node's error alone (T4); a silent failure is `UNRUN` (T6).

## Risks

- A broken `.cjs` checked by a `node` whose preload fails reads as `UNRUN`: could-not-look, never a false finding.

## Stop Condition

Stop and ask if a supported `node --check` reports a syntax error without the word `SyntaxError`.

## Out of Scope

- With no runnable Python 3, a broken `.py` stays silent, as Decision 4 has it (permanent: boundary: the owner, 2026-10-14, kept the silence)

## Verification Log
- 2026-10-14 · 712945ad* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:f59e04240260b1511e57a62a3dfb7fa6e51c363768a5954a2d47a914301f79ba · ms:7209 · test-lock-sha256:53aa99c68a814a1d8e76dbb677028171109da34bd5a8f566dca693e27c7ef6c9 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgSlNPTiBmaWxlIHdpdGggbm90aGluZyBpbiBpdCByZWFkcyB0aGUgc2FtZSB3aXRoIGFuZCB3aXRob3V0IGpxCWZmNTllZDhmZjU2ZTM0MzlmNTE5ZGEzODkwZGZkNTExMWFmOTViOWI0YzQ2YTBiNjY5OTNkNzkzNWVlNjc4YmYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBKU09OIGZpbmRpbmcgZnJvbSBub2RlIGlzIG9uZSBsaW5lCWMxM2ZhYTAwYWFkNDEzNTFjOTAxM2NmOTE2NWUzNmY4ZWNmNTQyNTE3ZWE3ZGFiNDY1Nzc1MWY0ZmVkNzI2YTQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBQSFAgZmluZGluZyBpcyBzYWlkIG9uY2UJY2JkNTE4MDUxMWRlNTUyMWI5N2JiZGUzM2UxZjc2MGViNzNiNzQxM2RlYTQ3NjY2MjM0NGVjODkwYzVhMjYzZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIFB5dGhvbiBmaW5kaW5nIHN1cnZpdmVzIGEgY29uc29sZSB0aGF0IGNhbm5vdCBlbmNvZGUgaXRzIGxpbmUJODc2ODYzNzQ2MWNkOWM3ZTA1ODAzMzFlNTI0MmQzOWNlZDVlMzVjMWFjZWZlMGM1MjBkY2YxYzhiMGQzMGQ0Nwpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGNoZWNrZXIgdGhhdCBjb3VsZCBub3QgcnVuIGlzIFVOUlVOLCBuZXZlciBhIGZpbmRpbmcgYWJvdXQgdGhlIGZpbGUJYmI3MGFiN2FiZTVjMWI2YzQxMzIwNDZmYTRlMjY3ODgwZmUzMzg2MzMwMDA1YzEzMDdmY2E0ODE2N2ZhODhlZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGNoZWNrZXIgdGhhdCBmYWlscyB3aXRob3V0IGEgd29yZCBpcyBVTlJVTiwgYW5kIHRoZSBob29rIGV4aXRzIDAJMzBhYTc5YjUyODBmN2Y1NmQ3NzIyMjY2YzRlMTViYTliNTgwNTYzOWMzNzUyNGQyOTdiYThjM2FiYjY5M2RlZApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGNsZWFuIGZpbGUgc2F5cyBub3RoaW5nLCBhbmQgYSBicm9rZW4gb25lIGlzIHN0aWxsIG5hbWVkCWQzNmJkNDNhOGU0NTNjYzUxNTIyZmY1NTA2ZmNiOWU4YzI3YWM1N2M2ZmIxYzI3YzhkZTZkOTM2N2M3ZWM1ZTcKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjb21tYSB3aXRoIG5vIHZhbHVlIGJlZm9yZSBpdCBpcyBub3QgYSB0cmFpbGluZyBjb21tYQk3YTRmMmVmNmZmNzc5YmY3MjJlMmJmMjVmNDA2NTYwMDYyOWIwN2UyYWE4NTc5MmMyNGVkOTVkY2ViYmFkNDZmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZHlpbmcgY2hlY2tlciBjYW5ub3QgcGFzcyBpdHNlbGYgb2ZmIGFzIGNvbXBsZXRlIGJ5IHByaW50aW5nIHRoZSBtYXJrZXIJODhlMWNlM2NiNGQxYzQwYWU5ZDJkNWUwNTFlYjgwOWVlMWFjYjVjNGVjNTE5OWM3YjRmMjY3ZjViMTFkYjVmMQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbGUgdHlwZSB0aGUgaG9vayBkb2VzIG5vdCBoYW5kbGUgaXMgc2lsZW50LCBub3QgYW4gZXJyb3IJMWRiMDkyOTJlYjU5NWI5MzgxYmIxMWViNjRjODU1ODdhNWE3OGQyNzJkMDliZmU5ZTcwZjU5ZTgwMWQzYTRlZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgY29tZXMgb25seSBmcm9tIHRoZSBmaWxlJ3Mgb3duIHBhcnNlcgk5Y2M0NTRlNmE0YWNlYjUxNTNmY2ZjZjYzNzUyNjFkZjNjN2ViMzJiZjA2OTMyZmI3MTVhZjk0NjM1NTkxZjE0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmluZGluZyBpcyByZWFkIGZyb20gdGhlIHJlYWRlcidzIG93biBvdXRwdXQsIG5vdCBub2RlJ3MJNzY4MjJjM2U4MGU4Yjk0YWVmZDczYTRkYTk1YzEwMDJlNDVkOTIxOTU2OWM3ZGM5YWI2MDk3N2ZkMGJlNjJlNgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgbmFtZXMgdGhlIGVkaXRlZCBmaWxlIGFuZCBnaXZlcyB0aGUgZXJyb3IgYWxvbmUJYTY0ZmUzNGEyNWY1MWVmZTZmNjcyOTI2NGU0MTQ0OWY1Y2IzMmJkZjQ0MzljNmVhY2Q2OGZhYTBlM2IyNDc2NApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIG5vZGUgdGhhdCBjYW5ub3Qgc3RhcnQgc2F5cyBub3RoaW5nIGFib3V0IGEgLmNqcyBmaWxlCTYyZDhmODUyYjNlMWM1MmY3ZjcxZDY0YzdkNTNiYzgwOWM3ZTFmNjQyZGI1YjQ5NmYxMGUxMzViYWYyNjRhMzEKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBub2RlIHRoYXQgY2Fubm90IHN0YXJ0IHNheXMgbm90aGluZyBhYm91dCB0aGUgZmlsZQk3YmY0MTY5ZWEyM2ZjOTc4N2EyYWNkNmVkYjAzZDljNmViMGUxOGFhMzM4YjM4ODMyZDM3ZmI0YTRkYjM4ZjgzCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgcHl0aG9uMyB0aGF0IGlzIG5vdCBQeXRob24gaXMgbm90IGEgY2hlY2tlcgkzZmVlYzhjMTgyZTE1ODRhMjM3MWU5ZjJmMDRkZmZkNmU1ZTZjYTUxZTEzNGYyNDQ5ZDUwNmNjOWQ5ZDIxMjZlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgc3ludGF4IGZpbmRpbmcgYXQgdGhlIGVkaXQgcmVhY2hlcyB0aGUgYWdlbnQsIGFuZCBhIGNsZWFuIGVkaXQgaGFuZHMgaXQgbm90aGluZwk4MTUzY2U4M2MyM2E4NTk2ZTc4NGIwMWI4NWZiNGY4MTYzODJjMWRkY2JmMjcxMmQ0ZTk1OTFkZDU1Y2Q4MGFhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl3aXRob3V0IGpxLCBub2RlIHJlYWRzIEpTT04gYXMgSlNPTkMJYTZhMjljOWYzNmUxMGY4N2YxMjVkNDQyMjhhMjAzMWY2MTUxMDEwYzQzNmU3Yjg1Y2FlOTk0NGRiZTlhNTY0NA
  ```
  ```
- 2026-10-14 · 712945ad* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:f59e04240260b1511e57a62a3dfb7fa6e51c363768a5954a2d47a914301f79ba · ms:6506
