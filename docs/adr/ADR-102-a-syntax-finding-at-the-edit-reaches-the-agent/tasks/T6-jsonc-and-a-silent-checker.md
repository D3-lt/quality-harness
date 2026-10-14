# Task ADR-102-T6: JSONC is read as TypeScript reads it, and a silent checker failure is UNRUN

**Depends-on:** T3, T4, T5
**Covers:** none — no spec
**Estimated scope:** S (the JSONC one-liner and two checker lines, two tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** a finding is a syntax error from the file's own parser (T3)
**Data dependency:** hermetic; the checker stubs are written by the test
**Proof map:** v1

## Goal

A leading BOM and CR line endings do not make valid JSONC a finding; a comment between two token halves does not hide a
JSON error; a `node --check` or `php -l` that fails without a word says `UNRUN` and the hook exits 0 (ADR-102, Decision 8).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | the JSONC one-liner drops a leading BOM, ends a line comment at CR or LF and replaces a comment with a space; the `.cjs` and `.php` lines say `UNRUN` for an empty diagnostic and never exit non-zero |
| `tests/post-edit-check.test.mjs` | edit | the two tests below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entries below; the T1, T3 and T4 entries on the changed lines repointed |

## Ordered Steps

1. [S1] Add the two tests below and record the red run (TDD red: the BOM and CR files are named, the split tokens are silent, a silent `node` stub exits the hook 1).
2. [S2] Change the one-liner and the two checker lines; repoint the catalogue entries on them.
3. [S3] Record killed mutants for each of the four changes. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - JSONC is read as TypeScript reads it")" = 1 \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a checker that fails without a word is UNRUN, and the hook exits 0")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `JSONC is read as TypeScript reads it` | `tests/post-edit-check.test.mjs` | silent: a BOM with a trailing comma; a line comment with LF, CRLF and CR endings; named: `{"a":1/*c*/2}` and `{"a":tru/*c*/e}` | — | S1, S2 |
| `a checker that fails without a word is UNRUN, and the hook exits 0` | `tests/post-edit-check.test.mjs` | a `node` and a `php` that exit 1 with no output: the hook exits 0 and says `UNRUN` for each | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · aede09ce* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a CommonJS check that failed without a word reads as a clean file again · acceptance-sha256:dfce1a8a71b70dd02eab8f1578573c8c906b8e940a86558fb33ad8328fbeab1c
- 2026-10-14 · aede09ce* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a JSONC file with a leading BOM is named as broken again · acceptance-sha256:dfce1a8a71b70dd02eab8f1578573c8c906b8e940a86558fb33ad8328fbeab1c

## Invariants

- A clean file still prints nothing; every path exits 0.

## Risks

- JSONC has more dialect than this (JSON5's single quotes and unquoted keys are not JSONC); a JSON5 file stays a finding, as before.

## Stop Condition

Stop and ask if TypeScript's parser is found to accept a shape the one-liner refuses, beyond the four named here.

## Out of Scope

- JSON5 (permanent: boundary: a `.json` file is JSON or JSONC; JSON5 files are named `.json5` and this hook does not read them)

## Verification Log
- 2026-10-14 · aede09ce* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:dfce1a8a71b70dd02eab8f1578573c8c906b8e940a86558fb33ad8328fbeab1c · ms:3824 · test-lock-sha256:940ee8139cced51f3f9a90463a59bd0c57b04b5d0723ba250a08a9d42d638a99 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWVkYTNiMTQ5YzM3NjlmODI4YTM3MDAzYTQ5OWExMDY2ZDM4MDQ1YzdiYTUxMWNhOWYwYmJiNDllNzJkNTVmN2UKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgZmFpbHMgd2l0aG91dCBhIHdvcmQgaXMgVU5SVU4sIGFuZCB0aGUgaG9vayBleGl0cyAwCTMwYWE3OWI1MjgwZjdmNTZkNzcyMjI2NmM0ZTE1YmE5YjU4MDU2MzljMzc1MjRkMjk3YmE4YzNhYmI2OTNkZWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZHlpbmcgY2hlY2tlciBjYW5ub3QgcGFzcyBpdHNlbGYgb2ZmIGFzIGNvbXBsZXRlIGJ5IHByaW50aW5nIHRoZSBtYXJrZXIJODhlMWNlM2NiNGQxYzQwYWU5ZDJkNWUwNTFlYjgwOWVlMWFjYjVjNGVjNTE5OWM3YjRmMjY3ZjViMTFkYjVmMQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbGUgdHlwZSB0aGUgaG9vayBkb2VzIG5vdCBoYW5kbGUgaXMgc2lsZW50LCBub3QgYW4gZXJyb3IJMWRiMDkyOTJlYjU5NWI5MzgxYmIxMWViNjRjODU1ODdhNWE3OGQyNzJkMDliZmU5ZTcwZjU5ZTgwMWQzYTRlZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgY29tZXMgb25seSBmcm9tIHRoZSBmaWxlJ3Mgb3duIHBhcnNlcgk5Y2M0NTRlNmE0YWNlYjUxNTNmY2ZjZjYzNzUyNjFkZjNjN2ViMzJiZjA2OTMyZmI3MTVhZjk0NjM1NTkxZjE0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmluZGluZyBuYW1lcyB0aGUgZWRpdGVkIGZpbGUgYW5kIGdpdmVzIHRoZSBlcnJvciBhbG9uZQlhNjRmZTM0YTI1ZjUxZWZlNmY2NzI5MjY0ZTQxNDQ5ZjVjYjMyYmRmNDQzOWM2ZWFjZDY4ZmFhMGUzYjI0NzY0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgc3ludGF4IGZpbmRpbmcgYXQgdGhlIGVkaXQgcmVhY2hlcyB0aGUgYWdlbnQsIGFuZCBhIGNsZWFuIGVkaXQgaGFuZHMgaXQgbm90aGluZwk4MTUzY2U4M2MyM2E4NTk2ZTc4NGIwMWI4NWZiNGY4MTYzODJjMWRkY2JmMjcxMmQ0ZTk1OTFkZDU1Y2Q4MGFhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZA
  ```
  ```
- 2026-10-14 · aede09ce* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:dfce1a8a71b70dd02eab8f1578573c8c906b8e940a86558fb33ad8328fbeab1c · ms:4183
- 2026-10-14 · aede09ce* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:dfce1a8a71b70dd02eab8f1578573c8c906b8e940a86558fb33ad8328fbeab1c · ms:4237
