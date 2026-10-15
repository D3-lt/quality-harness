# Task ADR-102-T3: a finding comes only from the file's own parser

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (the checker cases of one script, one new test, four locked tests and T1's relock)
**Owner:** unassigned
**Produces:** a finding is a syntax error from the file's own parser (`post-edit-check.sh`)
**Consumes:** stdout is empty for a clean file (T1)
**Data dependency:** hermetic; every row runs the real checker (`node`, `jq`, `python3`, `php`), and the fence refuses a skipped row
**Proof map:** v1

## Goal

`post-edit-check.sh` names a file only for a syntax error its own parser reports: a valid `.cjs`, a `.js` of any dialect, a
JSONC file and a Python file with a warning say nothing (ADR-102 Amendment, Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | `.mjs` module parse only; `.cjs` → `node --check`; `.js`/`.jsx` not checked; JSON named only when it is not JSONC either; Python `ast` with warnings off, `ruff` and `find_up` removed |
| `tests/post-edit-check.test.mjs` | edit | add the test below; the UNRUN, dying-checker and parse-goal tests move their subject from `.js` to `.mjs` (same parser path); the Workflow test asserts a `.js` draws nothing, broken or not; T1's test drops its ruff row |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | remove T1's ruff entry (its line is gone); add the entries below |
| `docs/adr/ADR-102-a-syntax-finding-at-the-edit-reaches-the-agent/tasks/T1-quiet-on-a-clean-file.md` | relock | `adr-verify --relock --replace-hashes`, after the test changes are reviewed in the same diff |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the valid `.cjs`, the JSX `.js`, the commented `tsconfig.json` and the warning `.py` are each named). Use the file's `run` helper, which gives every call its own `TMPDIR`, so the five-second debounce never decides a row (the cold review's finding 6).
2. [S2] Change the checker cases; move the four locked tests as listed; drop T1's ruff row.
3. [S3] Retake T1's lock map with `adr-verify --relock --replace-hashes`. [proof: human: a relock runs no fence; the reviewer reads the test diff in the same commit]
4. [S4] Record killed mutants: `.cjs` back to the module parse; the JSONC fallback removed; Python warnings back on. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a finding comes only from the file's own parser")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a finding comes only from the file's own parser` | `tests/post-edit-check.test.mjs` | silent: a valid `.cjs` with a top-level `return`, a JSX `.js`, a broken `.js`, a `tsconfig.json` with comments and a trailing comma, a JSON string holding `//` and `,}`, a `.py` with an invalid escape, a `.py` with lint debt in a `pyproject.toml` directory; named: a broken `.cjs`, broken JSON, a Python syntax error | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry, unchanged |
| 3 — the caller can discover it | T2 hands what it prints to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · fb782747* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a valid CommonJS file is parsed as an ES module again and named as broken · acceptance-sha256:e5de6a18f3ebc0582dc507d4269ce1137880c37a2b68f040bf675f8518a2a7c9
- 2026-10-14 · fb782747* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a JSONC file such as tsconfig.json is named as a jq parse error again · acceptance-sha256:e5de6a18f3ebc0582dc507d4269ce1137880c37a2b68f040bf675f8518a2a7c9
- 2026-10-14 · fb782747* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · a Python SyntaxWarning is said as a finding about a valid file again · acceptance-sha256:e5de6a18f3ebc0582dc507d4269ce1137880c37a2b68f040bf675f8518a2a7c9

## Invariants

- The hook exits 0 on every path; `.mjs`'s UNRUN protocol (the parser absent, a dying checker, a forged marker) is unchanged.

## Risks

- A `.js` with a real syntax error is no longer named at the edit: the owner's choice (the Amendment); the artifact pass and the project's check still see it.
- The JSONC fallback lets through a file that is valid JSONC and invalid strict JSON; for such a file the comment says which it meant.

## Stop Condition

Stop and ask if a row cannot run on this machine (the fence refuses a skip), or if a locked test turns out to be locked by a record other than T1.

## Out of Scope

- Where the output goes (T2)

## Verification Log
- 2026-10-14 · fb782747* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:e5de6a18f3ebc0582dc507d4269ce1137880c37a2b68f040bf675f8518a2a7c9 · ms:8302 · test-lock-sha256:c2cdeb716f04212b0a01202278f1e0c0358c54623e6443899db6b2a955214957 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgV29ya2Zsb3cgc2NyaXB0IGlzIG5vdCByZXBvcnRlZCBhcyBicm9rZW4sIGFuZCBhIGJyb2tlbiBvbmUgc3RpbGwgaXMJYmIzZDY0MDFmZTdmYmIyYmVhMGRmOWIyYWFkMzcxZGE0Y2E3ZTY0ZjgyYWJkYjdlMTg0MmRhZjliNTNiNjFmOQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGNoZWNrZXIgdGhhdCBjb3VsZCBub3QgcnVuIGlzIFVOUlVOLCBuZXZlciBhIGZpbmRpbmcgYWJvdXQgdGhlIGZpbGUJZjY1YzhlNDhlMjkwZDgzNTE3ZWQ2MDVkMTFmMjE2NmY3MzkxYzQxZGIwMGZhMzJiNTQ4MDBhYmJjNzIyNWUxYQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGNsZWFuIGZpbGUgc2F5cyBub3RoaW5nLCBhbmQgYSBicm9rZW4gb25lIGlzIHN0aWxsIG5hbWVkCWQyODVhYTYxNDVlMzVmYmFkNDYwYjhjYWU3NWExZjQzNTZiMTIyZTVhY2M1YWEwYzY2OWFjNzBkNjkzNjkyODQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBkeWluZyBjaGVja2VyIGNhbm5vdCBwYXNzIGl0c2VsZiBvZmYgYXMgY29tcGxldGUgYnkgcHJpbnRpbmcgdGhlIG1hcmtlcgkzYjgxZDA1OTcxZjc2ODYzN2IwYWQ4MGZlOTA3ZmJiNzhmMmRmZWY1OGZlYTVjOGQyNGY5ZGM1ZjU3YjhjM2ZhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmlsZSB0eXBlIHRoZSBob29rIGRvZXMgbm90IGhhbmRsZSBpcyBzaWxlbnQsIG5vdCBhbiBlcnJvcgkxZGIwOTI5MmViNTk1YjkzODFiYjExZWI2NGM4NTU4N2E1YTc4ZDI3MmQwOWJmZTllNzBmNTllODAxZDNhNGVmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmluZGluZyBjb21lcyBvbmx5IGZyb20gdGhlIGZpbGUncyBvd24gcGFyc2VyCTljYzQ1NGU2YTRhY2ViNTE1M2ZjZmNmNjM3NTI2MWRmM2M3ZWIzMmJmMDY5MzJmYjcxNWFmOTQ2MzU1OTFmMTQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgb25seSBhY3RzIG9uIHRoZSB0b29scyBpdCBpcyBmb3IsIGFuZCBvbiBmaWxlcyB0aGF0IGV4aXN0CTAzZjI2ZGFkNGY0ODVlMDZjNDBkNGI0NDI2YTcwMTAzZDBiODA2Zjk2ZTBlOTFiNWY5NTE4NjlmYjkzMDBlZWIKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcGlja3MgdGhlIHBhcnNlIGdvYWwgZnJvbSB0aGUgZXh0ZW5zaW9uLCBhbmQgZGlhZ25vc3RpY3MgY2Fubm90IGZvcmdlIHRoZSBtYXJrZXIJZDJmYTE5MDRmMTBlNTA5NGZmYTFiODA4MjdiMTBhNTliMmUyYmU5MmRhY2VkOGM0ZTkxYmZkNzA2OTI4ZTYxZApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayByZXBvcnRzIGEgc3ludGF4IGVycm9yIHdpdGhvdXQgZmFpbGluZyB0aGUgZWRpdAlhMWE1OWFhYmQxYjdmZmMxY2YxMGE3NmQxYzExYmE5ZWRkN2Y5ZjE4MDQ2MDkwYTMxMGJhZWY5NmNjNzM4ZTdk
  ```
  ```
- 2026-10-14 · fb782747* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:e5de6a18f3ebc0582dc507d4269ce1137880c37a2b68f040bf675f8518a2a7c9 · ms:2451
- 2026-10-14 · fb782747* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:e5de6a18f3ebc0582dc507d4269ce1137880c37a2b68f040bf675f8518a2a7c9 · ms:2613
- 2026-10-14 · fb782747* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:e5de6a18f3ebc0582dc507d4269ce1137880c37a2b68f040bf675f8518a2a7c9 · ms:2805
- 2026-10-14 · 63c77b04 · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:e5de6a18f3ebc0582dc507d4269ce1137880c37a2b68f040bf675f8518a2a7c9 · ms:0 · test-lock-sha256:573d98201c5e584a59c0c9daad78baea348554f0376c520a144adda2a6ec8894 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZHlpbmcgY2hlY2tlciBjYW5ub3QgcGFzcyBpdHNlbGYgb2ZmIGFzIGNvbXBsZXRlIGJ5IHByaW50aW5nIHRoZSBtYXJrZXIJODhlMWNlM2NiNGQxYzQwYWU5ZDJkNWUwNTFlYjgwOWVlMWFjYjVjNGVjNTE5OWM3YjRmMjY3ZjViMTFkYjVmMQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbGUgdHlwZSB0aGUgaG9vayBkb2VzIG5vdCBoYW5kbGUgaXMgc2lsZW50LCBub3QgYW4gZXJyb3IJMWRiMDkyOTJlYjU5NWI5MzgxYmIxMWViNjRjODU1ODdhNWE3OGQyNzJkMDliZmU5ZTcwZjU5ZTgwMWQzYTRlZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgY29tZXMgb25seSBmcm9tIHRoZSBmaWxlJ3Mgb3duIHBhcnNlcgk5Y2M0NTRlNmE0YWNlYjUxNTNmY2ZjZjYzNzUyNjFkZjNjN2ViMzJiZjA2OTMyZmI3MTVhZjk0NjM1NTkxZjE0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgc3ludGF4IGZpbmRpbmcgYXQgdGhlIGVkaXQgcmVhY2hlcyB0aGUgYWdlbnQsIGFuZCBhIGNsZWFuIGVkaXQgaGFuZHMgaXQgbm90aGluZwk4MTUzY2U4M2MyM2E4NTk2ZTc4NGIwMWI4NWZiNGY4MTYzODJjMWRkY2JmMjcxMmQ0ZTk1OTFkZDU1Y2Q4MGFhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZA · test-lock-kind:replace
- 2026-10-15 · human-observed · S3: the owner signed off on 2026-10-15 the relock of T1's lock map (2bf34aac), the test diff readable with git show 8a07b0bc -- tests/post-edit-check.test.mjs
