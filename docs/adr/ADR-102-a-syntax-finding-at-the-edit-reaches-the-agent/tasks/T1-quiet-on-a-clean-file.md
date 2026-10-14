# Task ADR-102-T1: the post-edit check is quiet on a clean file

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (two checker lines in one script, one test)
**Owner:** unassigned
**Produces:** stdout is empty for a clean file (`post-edit-check.sh`)
**Consumes:** none
**Data dependency:** hermetic; the Python and PHP rows run the real `ruff` and `php` where installed, and skip by name where not
**Proof map:** v1

## Goal

`post-edit-check.sh` prints a finding or an `UNRUN` line, and nothing for a clean file of any type it handles.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | `ruff check --quiet`; `php -l`'s output only on a non-zero exit (measured 2026-10-14, ADR-102 Context) |
| `tests/post-edit-check.test.mjs` | edit | add the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the two catalogue entries below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: a clean PHP file prints `No syntax errors detected`, a clean Python file in a ruff project prints `All checks passed!`).
2. [S2] Change the two checker lines.
3. [S3] Record killed mutants: dropping `--quiet`, and printing `php -l` on success, each turn the test red. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a clean file says nothing, and a broken one is still named")" = 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a clean file says nothing, and a broken one is still named` | `tests/post-edit-check.test.mjs` | for `.mjs`, `.sh`, `.json`, `.py` (ruff project and plain) and `.php`: the hook's stdout is empty on a clean file and names the error on a broken one; a checker that is not installed is a named skip, never a pass | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json` already runs the script on every native edit |
| 3 — the caller can discover it | T2 hands what it prints to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · 8418dd8a* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · ruff says All checks passed! on a clean file again, and that line would reach the agent on every clean Python edit · acceptance-sha256:3df326705b942a4711e7afc721e28218d5c0052903930961c0ffed8195cfa384
- 2026-10-14 · 8418dd8a* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · php -l output is printed on a clean file again (No syntax errors detected) · acceptance-sha256:3df326705b942a4711e7afc721e28218d5c0052903930961c0ffed8195cfa384

## Invariants

- The hook exits 0 on every path (CLAUDE.md §3); a finding is never a refusal.
- An `UNRUN` line is still printed: a checker that could not look is not a clean file.

## Risks

- A `ruff` that prints on success with `--quiet` in a later version: the test runs the installed ruff, so it turns red there.

## Stop Condition

Stop and ask if a handled checker turns out to print on success in a way neither change covers.

## Out of Scope

- Where the output goes (T2)

## Verification Log
- 2026-10-14 · 8418dd8a* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:3df326705b942a4711e7afc721e28218d5c0052903930961c0ffed8195cfa384 · ms:4842 · test-lock-sha256:8a3831d5cca08e72b760c34f1d9ef0de4a5f1489a90a91cfa1c11cc350067d9f · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgV29ya2Zsb3cgc2NyaXB0IGlzIG5vdCByZXBvcnRlZCBhcyBicm9rZW4sIGFuZCBhIGJyb2tlbiBvbmUgc3RpbGwgaXMJYmIzZDY0MDFmZTdmYmIyYmVhMGRmOWIyYWFkMzcxZGE0Y2E3ZTY0ZjgyYWJkYjdlMTg0MmRhZjliNTNiNjFmOQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGNoZWNrZXIgdGhhdCBjb3VsZCBub3QgcnVuIGlzIFVOUlVOLCBuZXZlciBhIGZpbmRpbmcgYWJvdXQgdGhlIGZpbGUJZjY1YzhlNDhlMjkwZDgzNTE3ZWQ2MDVkMTFmMjE2NmY3MzkxYzQxZGIwMGZhMzJiNTQ4MDBhYmJjNzIyNWUxYQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGNsZWFuIGZpbGUgc2F5cyBub3RoaW5nLCBhbmQgYSBicm9rZW4gb25lIGlzIHN0aWxsIG5hbWVkCWQyODVhYTYxNDVlMzVmYmFkNDYwYjhjYWU3NWExZjQzNTZiMTIyZTVhY2M1YWEwYzY2OWFjNzBkNjkzNjkyODQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBkeWluZyBjaGVja2VyIGNhbm5vdCBwYXNzIGl0c2VsZiBvZmYgYXMgY29tcGxldGUgYnkgcHJpbnRpbmcgdGhlIG1hcmtlcgkzYjgxZDA1OTcxZjc2ODYzN2IwYWQ4MGZlOTA3ZmJiNzhmMmRmZWY1OGZlYTVjOGQyNGY5ZGM1ZjU3YjhjM2ZhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmlsZSB0eXBlIHRoZSBob29rIGRvZXMgbm90IGhhbmRsZSBpcyBzaWxlbnQsIG5vdCBhbiBlcnJvcgkxZGIwOTI5MmViNTk1YjkzODFiYjExZWI2NGM4NTU4N2E1YTc4ZDI3MmQwOWJmZTllNzBmNTllODAxZDNhNGVmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCWQyZmExOTA0ZjEwZTUwOTRmZmExYjgwODI3YjEwYTU5YjJlMmJlOTJkYWNlZDhjNGU5MWJmZDcwNjkyOGU2MWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZA
  ```
  ```
- 2026-10-14 · 8418dd8a* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:3df326705b942a4711e7afc721e28218d5c0052903930961c0ffed8195cfa384 · ms:6221
- 2026-10-14 · 8418dd8a* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:3df326705b942a4711e7afc721e28218d5c0052903930961c0ffed8195cfa384 · ms:4870
- 2026-10-14 · fb782747* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:3df326705b942a4711e7afc721e28218d5c0052903930961c0ffed8195cfa384 · ms:0 · test-lock-sha256:b2cbf708708bd05fefa0a095f837e9532be1a124c820645e28a6343b64cd646f · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZHlpbmcgY2hlY2tlciBjYW5ub3QgcGFzcyBpdHNlbGYgb2ZmIGFzIGNvbXBsZXRlIGJ5IHByaW50aW5nIHRoZSBtYXJrZXIJODhlMWNlM2NiNGQxYzQwYWU5ZDJkNWUwNTFlYjgwOWVlMWFjYjVjNGVjNTE5OWM3YjRmMjY3ZjViMTFkYjVmMQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbGUgdHlwZSB0aGUgaG9vayBkb2VzIG5vdCBoYW5kbGUgaXMgc2lsZW50LCBub3QgYW4gZXJyb3IJMWRiMDkyOTJlYjU5NWI5MzgxYmIxMWViNjRjODU1ODdhNWE3OGQyNzJkMDliZmU5ZTcwZjU5ZTgwMWQzYTRlZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgY29tZXMgb25seSBmcm9tIHRoZSBmaWxlJ3Mgb3duIHBhcnNlcgk5Y2M0NTRlNmE0YWNlYjUxNTNmY2ZjZjYzNzUyNjFkZjNjN2ViMzJiZjA2OTMyZmI3MTVhZjk0NjM1NTkxZjE0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZA · test-lock-kind:replace
