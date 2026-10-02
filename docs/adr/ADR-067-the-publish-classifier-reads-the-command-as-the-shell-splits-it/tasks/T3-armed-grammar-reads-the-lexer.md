# Task ADR-067-T3: The armed grammar reads the same lexer

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (one module and its tests)
**Owner:** unassigned
**Produces:** `plainPublishes()` on `shellWords`; `hookSegments` deleted
**Consumes:** `shellWords()` (T1); `publishCommandIn()` on `shellWords` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the armed verdicts are unchanged`, `one reader of shell text`

## Goal

ADR-066's `leavesHookInPlace` keeps every verdict, row for row, reading `shellWords` instead of `hookSegments`, and `hookSegments` is deleted.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `plainPublishes` reads `shellWords`; `hookSegments` deleted |
| `tests/publish-command.test.mjs` | edit | one new test beside the locked armed tests |
| `tests/mutations.json` | edit | `hookSegments` mutants repointed to the lexer or replaced |

## Ordered Steps

1. [S1] Write the test below and see it fail on an assertion (TDD red): it asserts `hookSegments` is gone.
2. [S2] Port `plainPublishes` and `segmentVerdict` to `shellWords`, reading T1's per-word quote provenance where `hookSegments` put a NUL.
3. [S3] Delete `hookSegments`; repoint or replace its catalogue mutants, and record them with `adr-verify --mutant`. Add one mutant per consumer that stops routing through `shellWords` (T2's walk and T3's grammar each read a private split instead) and show each is killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (one lexer reads shell text for rule P|an armed session leaves a plain invocation to git|an armed session still refuses every form that can disable the hook|the armed check is a grammar of plain forms, not a list of dangerous ones|the armed grammar reads words, quoted code and heredocs as the shell does)' | grep -qx 5
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `one lexer reads shell text for rule P` | `tests/publish-command.test.mjs` | a quoted operator inside a git argument (`git commit '-nm;x'`) is not plain, and a brace-built hook bypass (`git {-c,hook.qh-publish-commit.enabled=false} commit`) is refused armed; both read only through `shellWords`'s provenance and brace expansion, so a consumer on a private split fails it (the dirty twin); and `lifecycle.mjs` defines no `hookSegments` | none | S1, S2, S3 |
| `an armed session leaves a plain invocation to git` | `tests/publish-command.test.mjs` | locked (ADR-066 T3), unchanged | none | S2 |
| `an armed session still refuses every form that can disable the hook` | `tests/publish-command.test.mjs` | locked (ADR-066 T3), unchanged | none | S2 |
| `the armed check is a grammar of plain forms, not a list of dangerous ones` | `tests/publish-command.test.mjs` | existing, unchanged | none | S2 |
| `the armed grammar reads words, quoted code and heredocs as the shell does` | `tests/publish-command.test.mjs` | existing, unchanged | none | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `plainPublishes` on `shellWords` |
| 2 — something selects it | rule P in an armed session |
| 3 — the caller can discover it | ADR-066's advice text, unchanged |
| 4 — it is used | every armed PreToolUse:Bash call that names a publish |

## Mutation Log
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a heredoc whose command pipes on counts its body again · acceptance-sha256:742eaa3f9f109ecb1fe6907613c546f5e7ea2b38c4a8340f72e12937ce2cf74b · covers:the armed verdicts are unchanged
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the armed grammar splits with a private naive split instead of shellWords · acceptance-sha256:742eaa3f9f109ecb1fe6907613c546f5e7ea2b38c4a8340f72e12937ce2cf74b · covers:one reader of shell text

## Invariants

- Every armed verdict in the locked ADR-066 tests is unchanged.
- The grammar still fails closed: anything the lexer marks dynamic is not plain.

## Risks

- ADR-066's grammar took four Codex rounds. If any armed row changes verdict, stop rather than adjust the row.

## Stop Condition

Stop and ask if a locked armed test needs its body changed.

## Out of Scope

- Widening what counts as plain (permanent: boundary: ADR-066 Decision 4 owns that list)

## Verification Log
- 2026-09-27 · 826ec94* · exit 1 · `set -o pipefail …` · acceptance-sha256:742eaa3f9f109ecb1fe6907613c546f5e7ea2b38c4a8340f72e12937ce2cf74b · ms:96766 · test-lock-sha256:601ceca59294b3ad415c799a6e9aaf5eb5bc0182fc1e1740b8d1fcaa60c69c93 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlQb3dlclNoZWxsLCBhbiBvZmZlcmVkLW9ubHkgc2Vzc2lvbiBhbmQgdGhlIHJldmlld2VyIGd1YXJkIGFyZSB1bmNoYW5nZWQJODFmNDZhMmM1NTQwZDE2YzRhYzM0MGRhYjAzMDk3ZThkYmNiMjAzNzE4MTZiYjA3YjcyZjZlNzNlZTIwMzdlNgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlXaW5kb3dzIHNwZWxsaW5ncyBvZiBhIHB1Ymxpc2ggYXJlIHJlY29nbmlzZWQsIGFuZCBsb29rLWFsaWtlcyBhcmUgbm90CTljMzQxYjdhY2U2ZWM3ZTMwNGE2OGVhYzNlOTBiNzc0MTA3OWQ2M2FhMzg0ZThhMmQ2Y2M3NDQ0ZGY0YzBiMmEKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYSBicmFjZS1idWlsdCBwdWJsaXNoIGlzIHJlZnVzZWQJMGE4ZTRkOWQwM2Y4ODBjNzZiNzhjYTc3NTk0ZTljYTQ0MDZmNDYwYjA3ZGM2N2YwMWJjNmQ5ODkyOTBjZWFlNwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHB1Ymxpc2ggaXMgZm91bmQgYnkgYXJndiwgYXMgdGhlIHNoZWxsIHJ1bnMgaXQJZDdhNmJhYzRjM2ZhYzQyYzU4NGQyMDFlMmY5YjRkMzZjZmVmNWU5ZWQ4NDNiMmI1N2M0YzYyNGRiOWQzZmI5Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIGxlYXZlcyBhIHBsYWluIGludm9jYXRpb24gdG8gZ2l0CTE0ODQ2NDUwNzJmMDFkMjA1ZjRiYWVhZmZjZDU3OTdkMTI3MzRiNDVmZjgyMzlkNGU2MmQyYWRmMDMwNzE2YzAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgcXVvdGVkLCBlc2NhcGVkIG9yIHN1YnN0aXR1dGVkIGhvb2sgYnlwYXNzCWNkYzgwMGMxNDFjYzcxYmM1ZDc1YTU3MzIxZTM4ODY3ZWVhMDAyYjY5M2JmOWFhMWM0YTM4NjE4ODE2NmQ5MTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgcmVkaXJlY3Rpb24gb3IgYW4gYXR0YWNoZWQgdmFsdWUgdGhhdCBoaWRlcyBhIGJ5cGFzcwk2ODYyODgxZGZmODc3NDViODU0NzA3MmJhYzM5NjRjOTJlOGI2YjEyM2M5ZTlhMzdlMTM3OGE5MmM3YmNlZmMzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyBhIHdyYXBwZWQgZ2l0IGFuZCBhIHJlYXNzaWduZWQgaG9vayB2YXJpYWJsZQkxZTM2YmFkMDQyMDlhNmZiZWQ5MTE2MDMwNzhhMjFhMGIxNGQ3ZjlkMTllYTE5MzFjOGViMzI4OTg5OGM2OGNjCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyB3aGF0IHRoZSBzaGVsbCBleHBhbmRzIGJlZm9yZSBnaXQgc2VlcyBpdAkyODU3MjIyZjMyYzZmYjA2NDhlYTMwZjhhYzhkOGQ4NDdjM2QwZDY3YWRiMDRiOWVjNmEwNTdjYWJlNTQ4NThlCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gc3RpbGwgcmVmdXNlcyBldmVyeSBmb3JtIHRoYXQgY2FuIGRpc2FibGUgdGhlIGhvb2sJYjA3M2RlYmEwNjhiODMzYWU1NDVhYjA0MjRmNjljNzI1NzYwMmYzMDNlMzFlZWQ5OTYyMGNjYmM1MDJhYzE3Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlkYXRhIHRoYXQgbmFtZXMgYSBwdWJsaXNoIGlzIG5vdCByZWZ1c2VkLCBhbmQgdGhlIGtub3duIGZhbHNlIHJlZnVzYWxzIGFyZSBnb25lCWNhNGM2YzBjYzY4N2IzZmNkZTFiMmUxNjQwYmE1N2E1NWRmNjIyNGNiZjg2MDFkNDExNTkxNmQwN2U1OTFmYTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZHluYW1pYyBpbnZvY2F0aW9ucyBhcmUgbm90IHJlZnVzZWQsIGFuZCB0aGlzIHRlc3QgcGlucyB0aGF0IHRoZXkgYXJlIGEgbWVudGlvbiBhdCBtb3N0CWJlODY0N2IzNTczMzQ3OTgzNmU5OTQ4ODg5NWViNzliMDljMjNjN2FmNGI1OTZiZGUwOTQwOTJkOWU5MjdmZDAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZXZhbCBydW5zIGl0cyBzdHJpbmcsIHNvIGEgcHVibGlzaCBpbiBpdCBpcyBpbnZva2VkCWJmYWZiOGY4NjJhZjAxOTFkNjZiODNjNTcyYjdlYTczM2EwNjAyYzMwOTFjODdmOGJhNTE0MDY2NDg1MjgyYTkKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZXZlcnkgcHVibGlzaCBmb3JtIGlzIHJlY29nbmlzZWQsIHdpdGggdGhlIGludm9jYXRpb24gbmFtZWQJZjNlOGVkZmIwN2NkNWI1MTM5OWIzMzY1ZTQxN2JkNGY0MWVlYTU1NTIzNDgzNjE0ZDk3ZDk2NTVmYzdmZDgxYgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlub3RoaW5nIHRoYXQgb25seSBtZW50aW9ucyBhIHB1Ymxpc2ggaXMgcmVmdXNlZAk3YWY4ZTY5YThiZGQ2ZmU4OWViYTQ4ZGYwZjUxNDI3ODk0ZWZkZTViMDUyZDhjMWYxMjUyNGQ1MzZhZWEyMjk3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCW9uZSBsZXhlciByZWFkcyBzaGVsbCB0ZXh0IGZvciBydWxlIFAJZTAxZTAwMjY2MTY5MDI5NWYzNTRhZjYyMzM3NWQ5NzZlMzc1OTc4ZjMxNDVhMTY1NTY3YmMzYTQzOTI2M2ZlYgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0ZXh0IHBpcGVkIGludG8gYSBzaGVsbCBpcyByZWFkIGFzIHRoZSBzaGVsbCByZWFkcyBpdAlhMTIzYjVmNzkzMmJmMGFjYzhjZDVjMGNjMTFjNWIxODRiODVmZDA5MzgzYjg0YTQ5ZTczODhkM2U4OTk1MGJhCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBhZHZpc29yeSBhcm0gc2VlcyB0aGUgd29yZHMgYXMgd29yZHMg4oCUIHdhcm5lZCBhYm91dCwgbmV2ZXIgcmVmdXNlZAlhMjJmMzMxYTllN2E5ZGFlZDcyMGVhMmMyZmNjZjI0NTZlZjk0NGE0MGFjZmVmY2ExZGUxMTEwNzI3MjY3Mzk2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBhcm1lZCBjaGVjayBpcyBhIGdyYW1tYXIgb2YgcGxhaW4gZm9ybXMsIG5vdCBhIGxpc3Qgb2YgZGFuZ2Vyb3VzIG9uZXMJZjBhNDNjMjVhOGNhMjI3NDc3NGM3NzUyODk3YjhjY2NmMzUwNmNkZjVhMjg3NzVmZmU3MTVmZGU2ZTlhYzAzOQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgYXJtZWQgZ3JhbW1hciByZWFkcyB3b3JkcywgcXVvdGVkIGNvZGUgYW5kIGhlcmVkb2NzIGFzIHRoZSBzaGVsbCBkb2VzCWUzNWY0NTZmY2MwNGM5M2YzZGZjYjUxNDc0MzhiMGViOTQ4ZGU4NmNjZjYyMDdlZmFlZmFkMTgxYzI2MDc2YmMKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGNsYXNzaWZpZXIgc3RheXMgdW5kZXIgaXRzIGNvc3QgYm91bmQJYjBkZWYwMDk0ZTZjODY1YzcxYWRiN2I2MDdlNTc4YWY3OTgzM2VhOGEyYzBhYzEzMzZlNTE2YzZmNTI3NDBmOQ
  ```
  --- last 10 line(s) of stderr (of 157 after folding 157 raw)
    ...
  1..21
  # tests 21
  # suites 0
  # pass 20
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 95626.014708
  ```
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:742eaa3f9f109ecb1fe6907613c546f5e7ea2b38c4a8340f72e12937ce2cf74b · ms:28061
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:742eaa3f9f109ecb1fe6907613c546f5e7ea2b38c4a8340f72e12937ce2cf74b · ms:39552
