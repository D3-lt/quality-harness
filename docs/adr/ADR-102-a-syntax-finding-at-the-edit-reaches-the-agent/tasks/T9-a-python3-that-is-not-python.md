# Task ADR-102-T9: a python3 that is not Python is not a checker

**Depends-on:** T4, T8
**Covers:** none — no spec
**Estimated scope:** S (one interpreter probe, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic; the row runs the real `python3` behind a stub on `PATH`, and the fence refuses a skip
**Proof map:** v1

## Goal

An outside run on Windows (2026-10-14, Windows 11, Git Bash, after its user approved the run) found `python3` on `PATH` to
be the Microsoft Store alias, which prints an install hint and exits 9009. `command -v python3` accepted it, and the hook
handed the hint to the agent as its finding on every `.py` edit, while the file was never checked. The check now uses the
first of `python3` and `python` that runs a Python 3, and says nothing when neither does (ADR-102, Decision 11; the silence
for an absent checker is Decision 4's).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/post-edit-check.sh` | edit | the interpreter probe before the Python check |
| `tests/post-edit-check.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json` | edit | the entry below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the alias's hint is the output).
2. [S2] Probe each candidate with `-c 'import sys; sys.exit(sys.version_info < (3, 7))'` and use the first that exits 0.
3. [S3] Record a killed mutant: the probe removed, so the first name on `PATH` is used again. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a python3 that is not Python is not a checker")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a python3 that is not Python is not a checker` | `tests/post-edit-check.test.mjs` | with a Store-alias stub as `python3` and a real interpreter as `python`, a broken `.py` is named by the real one and a valid one is silent; with the stub as both, nothing is said, never the stub's text | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry |
| 3 — the caller can discover it | T2 hands it to the agent |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · ca7188ea* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · the first python name on PATH is used unprobed, so the Store alias hint reaches the agent again · acceptance-sha256:67025b573cdaecb3537c8042df4ea583de9dfc0b713d1fffd3009a75f961c326

## Invariants

- A clean file stays silent (T1); a finding names its file (T4); the console escape holds (T8).

## Risks

- One more interpreter start per checked `.py` edit (the probe), after the per-file debounce.

## Stop Condition

Stop and ask if a supported platform's real `python3` fails the probe.

## Out of Scope

- `.json` when `jq` is absent stays silent, as Decision 4 chose, although `node` could read it (deferred: BACKLOG §378, the owner's call)

## Verification Log
- 2026-10-14 · ca7188ea* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:67025b573cdaecb3537c8042df4ea583de9dfc0b713d1fffd3009a75f961c326 · ms:12460 · test-lock-sha256:52351e3aee07dfed9ef6caf31fa5c8bf7ca01e22a5887d527d2546c8a18fa1ca · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCUpTT05DIGlzIHJlYWQgYXMgVHlwZVNjcmlwdCByZWFkcyBpdAliY2NkZjNjNGVjOWMyYjM3MTA4YzA0OTc4YjRiMjEzODgyMDU0ZDVkYzZiMTM2NjY4NjAwOTkzNjQ0MDdjNTlmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBDb21tb25KUyBmaW5kaW5nIGlzIHRoZSBlcnJvciwgbm90IG5vZGUncyBzdGFjawk1YzY1NGRhZDM1MTRmYjY1ZDJhYmVjYWU2NTJhYzQyMTkzNmM2NTNkNzNjZTIyMzJlNzQ1MGY2ZTUxZWJkNDVlCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUEhQIGZpbmRpbmcgaXMgc2FpZCBvbmNlCWNiZDUxODA1MTFkZTU1MjFiOTdiYmRlMzNlMWY3NjBlYjczYjc0MTNkZWE0NzY2NjIzNDRlYzg5MGM1YTI2M2YKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBQeXRob24gZmluZGluZyBzdXJ2aXZlcyBhIGNvbnNvbGUgdGhhdCBjYW5ub3QgZW5jb2RlIGl0cyBsaW5lCTg3Njg2Mzc0NjFjZDljN2UwNTgwMzMxZTUyNDJkMzljZWQ1ZTM1YzFhY2VmZTBjNTIwZGNmMWM4YjBkMzBkNDcKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgZmFpbHMgd2l0aG91dCBhIHdvcmQgaXMgVU5SVU4sIGFuZCB0aGUgaG9vayBleGl0cyAwCTMwYWE3OWI1MjgwZjdmNTZkNzcyMjI2NmM0ZTE1YmE5YjU4MDU2MzljMzc1MjRkMjk3YmE4YzNhYmI2OTNkZWQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY29tbWEgd2l0aCBubyB2YWx1ZSBiZWZvcmUgaXQgaXMgbm90IGEgdHJhaWxpbmcgY29tbWEJN2E0ZjJlZjZmZjc3OWJmNzIyZTJiZjI1ZjQwNjU2MDA2MjliMDdlMmFhODU3OTJjMjRlZDk1ZGNlYmJhZDQ2Zgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGR5aW5nIGNoZWNrZXIgY2Fubm90IHBhc3MgaXRzZWxmIG9mZiBhcyBjb21wbGV0ZSBieSBwcmludGluZyB0aGUgbWFya2VyCTg4ZTFjZTNjYjRkMWM0MGFlOWQyZDVlMDUxZWI4MDllZTFhY2I1YzRlYzUxOTljN2I0ZjI2N2Y1YjExZGI1ZjEKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaWxlIHR5cGUgdGhlIGhvb2sgZG9lcyBub3QgaGFuZGxlIGlzIHNpbGVudCwgbm90IGFuIGVycm9yCTFkYjA5MjkyZWI1OTViOTM4MWJiMTFlYjY0Yzg1NTg3YTVhNzhkMjcyZDA5YmZlOWU3MGY1OWU4MDFkM2E0ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIGNvbWVzIG9ubHkgZnJvbSB0aGUgZmlsZSdzIG93biBwYXJzZXIJOWNjNDU0ZTZhNGFjZWI1MTUzZmNmY2Y2Mzc1MjYxZGYzYzdlYjMyYmYwNjkzMmZiNzE1YWY5NDYzNTU5MWYxNApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgbmFtZXMgdGhlIGVkaXRlZCBmaWxlIGFuZCBnaXZlcyB0aGUgZXJyb3IgYWxvbmUJYTY0ZmUzNGEyNWY1MWVmZTZmNjcyOTI2NGU0MTQ0OWY1Y2IzMmJkZjQ0MzljNmVhY2Q2OGZhYTBlM2IyNDc2NApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHB5dGhvbjMgdGhhdCBpcyBub3QgUHl0aG9uIGlzIG5vdCBhIGNoZWNrZXIJM2ZlZWM4YzE4MmUxNTg0YTIzNzFlOWYyZjA0ZGZmZDZlNWU2Y2E1MWUxMzRmMjQ0OWQ1MDZjYzlkOWQyMTI2ZQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHN5bnRheCBmaW5kaW5nIGF0IHRoZSBlZGl0IHJlYWNoZXMgdGhlIGFnZW50LCBhbmQgYSBjbGVhbiBlZGl0IGhhbmRzIGl0IG5vdGhpbmcJODE1M2NlODNjMjNhODU5NmU3ODRiMDFiODVmYjRmODE2MzgyYzFkZGNiZjI3MTJkNGU5NTkxZGQ1NWNkODBhYQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBvbmx5IGFjdHMgb24gdGhlIHRvb2xzIGl0IGlzIGZvciwgYW5kIG9uIGZpbGVzIHRoYXQgZXhpc3QJMDNmMjZkYWQ0ZjQ4NWUwNmM0MGQ0YjQ0MjZhNzAxMDNkMGI4MDZmOTZlMGU5MWI1Zjk1MTg2OWZiOTMwMGVlYgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBwaWNrcyB0aGUgcGFyc2UgZ29hbCBmcm9tIHRoZSBleHRlbnNpb24sIGFuZCBkaWFnbm9zdGljcyBjYW5ub3QgZm9yZ2UgdGhlIG1hcmtlcgk0MGJjZjZmZjQ5MmM0MmZlN2VmODgwNmZiM2FiODYzZDUzNTkxZWU5MzY3OTUxYjlmOWRhNjI1ZDU1Yjc3ZmU1CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHJlcG9ydHMgYSBzeW50YXggZXJyb3Igd2l0aG91dCBmYWlsaW5nIHRoZSBlZGl0CWExYTU5YWFiZDFiN2ZmYzFjZjEwYTc2ZDFjMTFiYTllZGQ3ZjlmMTgwNDYwOTBhMzEwYmFlZjk2Y2M3MzhlN2Q
  ```
  ```
- 2026-10-14 · ca7188ea* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:67025b573cdaecb3537c8042df4ea583de9dfc0b713d1fffd3009a75f961c326 · ms:13905
