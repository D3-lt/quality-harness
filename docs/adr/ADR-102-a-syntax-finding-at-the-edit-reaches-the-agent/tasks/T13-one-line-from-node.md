# Task ADR-102-T13: a JSON finding from node is one line

**Depends-on:** T12
**Covers:** none — no spec
**Estimated scope:** S (one replacement, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic; `QUALITY_HARNESS_JQ` names a `jq` that is not installed, and the fence refuses a skip
**Proof map:** v1

## Goal

An outside run at the 3.8.28 candidate (f3e19558, a Python WCAG corpus, macOS, 2026-10-14) found that, without `jq`, node's
parse error quotes the file's text with its newlines, so `{"a": }` was named over two lines and a longer file would spill
over more. A finding gives the error alone (T4): the reader collapses the message onto one line (ADR-102, Decision 13).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | the reader joins the message's lines with a space |
| `tests/post-edit-check.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entry below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the finding spans two lines).
2. [S2] Collapse whitespace runs that hold a line break into one space.
3. [S3] Record a killed mutant: the collapse removed. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a JSON finding from node is one line")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a JSON finding from node is one line` | `tests/post-edit-check.test.mjs` | without `jq`, a one-line and a multi-line broken `.json` are each named in exactly one line | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · f3e19558* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · node's message keeps the file's newlines, so one finding spans several lines again · acceptance-sha256:05d336da0c639475a591f207fd2dac4c4f5668aa90788656ee7206583543f235

## Invariants

- The marker check (T11, T12) is unchanged.

## Risks

- None beyond T10's.

## Stop Condition

Stop and ask if a supported `node` message is empty after the collapse.

## Out of Scope

- The quoted excerpt itself is node's, kept as context (permanent: boundary: the message is node's own wording)

## Verification Log
- 2026-10-14 · f3e19558* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:05d336da0c639475a591f207fd2dac4c4f5668aa90788656ee7206583543f235 · ms:6110 · test-lock-sha256:ec89954c9e6551527c95fafda6348693af7470f8db9eec3b9d3290d0f1ee8cbd · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgSlNPTiBmaW5kaW5nIGZyb20gbm9kZSBpcyBvbmUgbGluZQljMTNmYWEwMGFhZDQxMzUxYzkwMTNjZjkxNjVlMzZmOGVjZjU0MjUxN2VhN2RhYjQ2NTc3NTFmNGZlZDcyNmE0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWNiZDUxODA1MTFkZTU1MjFiOTdiYmRlMzNlMWY3NjBlYjczYjc0MTNkZWE0NzY2NjIzNDRlYzg5MGM1YTI2M2YKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBQeXRob24gZmluZGluZyBzdXJ2aXZlcyBhIGNvbnNvbGUgdGhhdCBjYW5ub3QgZW5jb2RlIGl0cyBsaW5lCTg3Njg2Mzc0NjFjZDljN2UwNTgwMzMxZTUyNDJkMzljZWQ1ZTM1YzFhY2VmZTBjNTIwZGNmMWM4YjBkMzBkNDcKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgZmFpbHMgd2l0aG91dCBhIHdvcmQgaXMgVU5SVU4sIGFuZCB0aGUgaG9vayBleGl0cyAwCTMwYWE3OWI1MjgwZjdmNTZkNzcyMjI2NmM0ZTE1YmE5YjU4MDU2MzljMzc1MjRkMjk3YmE4YzNhYmI2OTNkZWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY29tbWEgd2l0aCBubyB2YWx1ZSBiZWZvcmUgaXQgaXMgbm90IGEgdHJhaWxpbmcgY29tbWEJN2E0ZjJlZjZmZjc3OWJmNzIyZTJiZjI1ZjQwNjU2MDA2MjliMDdlMmFhODU3OTJjMjRlZDk1ZGNlYmJhZDQ2Zgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGR5aW5nIGNoZWNrZXIgY2Fubm90IHBhc3MgaXRzZWxmIG9mZiBhcyBjb21wbGV0ZSBieSBwcmludGluZyB0aGUgbWFya2VyCTg4ZTFjZTNjYjRkMWM0MGFlOWQyZDVlMDUxZWI4MDllZTFhY2I1YzRlYzUxOTljN2I0ZjI2N2Y1YjExZGI1ZjEKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaWxlIHR5cGUgdGhlIGhvb2sgZG9lcyBub3QgaGFuZGxlIGlzIHNpbGVudCwgbm90IGFuIGVycm9yCTFkYjA5MjkyZWI1OTViOTM4MWJiMTFlYjY0Yzg1NTg3YTVhNzhkMjcyZDA5YmZlOWU3MGY1OWU4MDFkM2E0ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIGNvbWVzIG9ubHkgZnJvbSB0aGUgZmlsZSdzIG93biBwYXJzZXIJOWNjNDU0ZTZhNGFjZWI1MTUzZmNmY2Y2Mzc1MjYxZGYzYzdlYjMyYmYwNjkzMmZiNzE1YWY5NDYzNTU5MWYxNApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgaXMgcmVhZCBmcm9tIHRoZSByZWFkZXIncyBvd24gb3V0cHV0LCBub3Qgbm9kZSdzCTc2ODIyYzNlODBlOGI5NGFlZmQ3M2E0ZGE5NWMxMDAyZTQ1ZDkyMTk1NjljN2RjOWFiNjA5NzdmZDBiZTYyZTYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIG5hbWVzIHRoZSBlZGl0ZWQgZmlsZSBhbmQgZ2l2ZXMgdGhlIGVycm9yIGFsb25lCWE2NGZlMzRhMjVmNTFlZmU2ZjY3MjkyNjRlNDE0NDlmNWNiMzJiZGY0NDM5YzZlYWNkNjhmYWEwZTNiMjQ3NjQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBub2RlIHRoYXQgY2Fubm90IHN0YXJ0IHNheXMgbm90aGluZyBhYm91dCB0aGUgZmlsZQk3YmY0MTY5ZWEyM2ZjOTc4N2EyYWNkNmVkYjAzZDljNmViMGUxOGFhMzM4YjM4ODMyZDM3ZmI0YTRkYjM4ZjgzCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgcHl0aG9uMyB0aGF0IGlzIG5vdCBQeXRob24gaXMgbm90IGEgY2hlY2tlcgkzZmVlYzhjMTgyZTE1ODRhMjM3MWU5ZjJmMDRkZmZkNmU1ZTZjYTUxZTEzNGYyNDQ5ZDUwNmNjOWQ5ZDIxMjZlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgc3ludGF4IGZpbmRpbmcgYXQgdGhlIGVkaXQgcmVhY2hlcyB0aGUgYWdlbnQsIGFuZCBhIGNsZWFuIGVkaXQgaGFuZHMgaXQgbm90aGluZwk4MTUzY2U4M2MyM2E4NTk2ZTc4NGIwMWI4NWZiNGY4MTYzODJjMWRkY2JmMjcxMmQ0ZTk1OTFkZDU1Y2Q4MGFhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl3aXRob3V0IGpxLCBub2RlIHJlYWRzIEpTT04gYXMgSlNPTkMJYTZhMjljOWYzNmUxMGY4N2YxMjVkNDQyMjhhMjAzMWY2MTUxMDEwYzQzNmU3Yjg1Y2FlOTk0NGRiZTlhNTY0NA
  ```
  ```
- 2026-10-14 · f3e19558* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:05d336da0c639475a591f207fd2dac4c4f5668aa90788656ee7206583543f235 · ms:6176
