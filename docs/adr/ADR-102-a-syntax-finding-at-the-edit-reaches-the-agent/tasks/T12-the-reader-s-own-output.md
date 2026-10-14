# Task ADR-102-T12: a finding is read from the reader's own output, not node's

**Depends-on:** T11
**Covers:** none — no spec
**Estimated scope:** S (one redirection, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic; `NODE_OPTIONS` preloads a file that writes to stderr, and the fence refuses a skip
**Proof map:** v1

## Goal

The Codex review of T11 (2026-10-14) found that, without `jq`, node's own stderr ahead of the reader's marker (an inspector
starting, a preload that writes) made a real parse error read as `UNRUN`: T11 merged stderr into the channel it read the
marker from. The marker is now read from stdout alone, and node's stderr is not shown (ADR-102, Decision 13).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | the `node`-alone branch captures stdout only |
| `tests/post-edit-check.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entry below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the broken file reads as `UNRUN`).
2. [S2] Read the reader's stdout alone.
3. [S3] Record a killed mutant: stderr merged back. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - (a finding is read from the reader's own output, not node's|a node that cannot start says nothing about the file)")" = 2 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a finding is read from the reader's own output, not node's` | `tests/post-edit-check.test.mjs` | without `jq` and with a preload writing to stderr, a broken `.json` is named with its parse error and no `UNRUN` or preload text, and a valid one is silent | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · 0bba4e94* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · node's own stderr is merged back ahead of the marker, so a real parse error reads as UNRUN · acceptance-sha256:5597590eb01f8512079d5ff12f4df7b398caadd07b11a7be4964ed27ee7823a8

## Invariants

- A node that cannot start is `UNRUN` (T11).

## Risks

- A preload that writes to stdout ahead of the marker still reads as `UNRUN`: could-not-look, never a false finding.

## Stop Condition

Stop and ask if a supported `node` writes to stdout before the reader runs on a normal start.

## Out of Scope

- None — the review's other finding is in the facts-first dispatcher, fixed beside this task and recorded in BACKLOG (permanent: boundary: not this record's file)

## Verification Log
- 2026-10-14 · 0bba4e94* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:5597590eb01f8512079d5ff12f4df7b398caadd07b11a7be4964ed27ee7823a8 · ms:15161 · test-lock-sha256:132f5f0323b8fc015aa1dd29d632b0c7ec4d460eccd855f1e1550d89554a48e9 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWNiZDUxODA1MTFkZTU1MjFiOTdiYmRlMzNlMWY3NjBlYjczYjc0MTNkZWE0NzY2NjIzNDRlYzg5MGM1YTI2M2YKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBQeXRob24gZmluZGluZyBzdXJ2aXZlcyBhIGNvbnNvbGUgdGhhdCBjYW5ub3QgZW5jb2RlIGl0cyBsaW5lCTg3Njg2Mzc0NjFjZDljN2UwNTgwMzMxZTUyNDJkMzljZWQ1ZTM1YzFhY2VmZTBjNTIwZGNmMWM4YjBkMzBkNDcKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgZmFpbHMgd2l0aG91dCBhIHdvcmQgaXMgVU5SVU4sIGFuZCB0aGUgaG9vayBleGl0cyAwCTMwYWE3OWI1MjgwZjdmNTZkNzcyMjI2NmM0ZTE1YmE5YjU4MDU2MzljMzc1MjRkMjk3YmE4YzNhYmI2OTNkZWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY29tbWEgd2l0aCBubyB2YWx1ZSBiZWZvcmUgaXQgaXMgbm90IGEgdHJhaWxpbmcgY29tbWEJN2E0ZjJlZjZmZjc3OWJmNzIyZTJiZjI1ZjQwNjU2MDA2MjliMDdlMmFhODU3OTJjMjRlZDk1ZGNlYmJhZDQ2Zgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGR5aW5nIGNoZWNrZXIgY2Fubm90IHBhc3MgaXRzZWxmIG9mZiBhcyBjb21wbGV0ZSBieSBwcmludGluZyB0aGUgbWFya2VyCTg4ZTFjZTNjYjRkMWM0MGFlOWQyZDVlMDUxZWI4MDllZTFhY2I1YzRlYzUxOTljN2I0ZjI2N2Y1YjExZGI1ZjEKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaWxlIHR5cGUgdGhlIGhvb2sgZG9lcyBub3QgaGFuZGxlIGlzIHNpbGVudCwgbm90IGFuIGVycm9yCTFkYjA5MjkyZWI1OTViOTM4MWJiMTFlYjY0Yzg1NTg3YTVhNzhkMjcyZDA5YmZlOWU3MGY1OWU4MDFkM2E0ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIGNvbWVzIG9ubHkgZnJvbSB0aGUgZmlsZSdzIG93biBwYXJzZXIJOWNjNDU0ZTZhNGFjZWI1MTUzZmNmY2Y2Mzc1MjYxZGYzYzdlYjMyYmYwNjkzMmZiNzE1YWY5NDYzNTU5MWYxNApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgaXMgcmVhZCBmcm9tIHRoZSByZWFkZXIncyBvd24gb3V0cHV0LCBub3Qgbm9kZSdzCTc2ODIyYzNlODBlOGI5NGFlZmQ3M2E0ZGE5NWMxMDAyZTQ1ZDkyMTk1NjljN2RjOWFiNjA5NzdmZDBiZTYyZTYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIG5hbWVzIHRoZSBlZGl0ZWQgZmlsZSBhbmQgZ2l2ZXMgdGhlIGVycm9yIGFsb25lCWE2NGZlMzRhMjVmNTFlZmU2ZjY3MjkyNjRlNDE0NDlmNWNiMzJiZGY0NDM5YzZlYWNkNjhmYWEwZTNiMjQ3NjQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBub2RlIHRoYXQgY2Fubm90IHN0YXJ0IHNheXMgbm90aGluZyBhYm91dCB0aGUgZmlsZQk3YmY0MTY5ZWEyM2ZjOTc4N2EyYWNkNmVkYjAzZDljNmViMGUxOGFhMzM4YjM4ODMyZDM3ZmI0YTRkYjM4ZjgzCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgcHl0aG9uMyB0aGF0IGlzIG5vdCBQeXRob24gaXMgbm90IGEgY2hlY2tlcgkzZmVlYzhjMTgyZTE1ODRhMjM3MWU5ZjJmMDRkZmZkNmU1ZTZjYTUxZTEzNGYyNDQ5ZDUwNmNjOWQ5ZDIxMjZlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgc3ludGF4IGZpbmRpbmcgYXQgdGhlIGVkaXQgcmVhY2hlcyB0aGUgYWdlbnQsIGFuZCBhIGNsZWFuIGVkaXQgaGFuZHMgaXQgbm90aGluZwk4MTUzY2U4M2MyM2E4NTk2ZTc4NGIwMWI4NWZiNGY4MTYzODJjMWRkY2JmMjcxMmQ0ZTk1OTFkZDU1Y2Q4MGFhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl3aXRob3V0IGpxLCBub2RlIHJlYWRzIEpTT04gYXMgSlNPTkMJYTZhMjljOWYzNmUxMGY4N2YxMjVkNDQyMjhhMjAzMWY2MTUxMDEwYzQzNmU3Yjg1Y2FlOTk0NGRiZTlhNTY0NA
  ```
  ```
- 2026-10-14 · 0bba4e94* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:5597590eb01f8512079d5ff12f4df7b398caadd07b11a7be4964ed27ee7823a8 · ms:5656
