# Task ADR-119-T4: Wrong output and the gates' own blind spots

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic, except S7's measurement of the listing, taken on a fresh repository with the plugin installed
**Proof map:** v1

## Goal

Six items of BACKLOG §381 close: a node JSON error is placed (16), the dead-code scan survives an empty list (20) and sees
unreachable code (21), a contract test reads the plugin as git lists it (22), two post-edit tests skip without `jq` (18),
and the listing figure is re-measured (24).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/post-edit-check.test.mjs` | edit | :561-563 of the unlocked `a JSON finding from node names the file's line and column` change from unplaced to placed; :388-389 and :416 skip through `required('jq', reason)`, in `JSONC is read as TypeScript reads it` and `a comma with no value before it is not a trailing comma`, each locked by ADR-102 T5 through T15 (11 owners each, `python3 scripts/test-locks.py`, 2026-10-20) |
| `plugin/scripts/post-edit-check.sh` | edit | :123 finds the first bad token in the masked text and appends `(line L column C)` when node gave none |
| `tests/dead-code-scan.test.mjs` | add | the script's first test |
| `scripts/dead-code-scan.sh` | edit | :48 under the `-gt 0` guard from `unused-names.sh:92`, and UNRUN for an empty list |
| `tests/unused-names.test.mjs` | edit | a dirty fixture and a clean twin for unreachable code (0 locks) |
| `scripts/unused-names.sh` | edit | :107 adds `--only=correctness/noUnreachable` |
| `tests/review-contract.test.mjs` | edit | :72-73, :109, :145, :159-160 read `git ls-files -z --cached --others --exclude-standard` (CLAUDE.md §8); a relock under ADR-098 T2 with the reason recorded |
| `.claude/rules/19-adopter-footprint.md` | edit | :26, the listing figure with its method, date and sha |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json`, `tests/mutations/scripts/unused-names.sh.json`, `tests/mutations/scripts/dead-code-scan.sh.json` | edit, edit, add | one catalogue entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: `{"a": tru}` placed at its first bad token; a message that already has a position gets no second one (:554-556); `dead-code-scan.sh` with no Python file prints UNRUN and does not abort under `set -u`; an unreachable statement after `return` is a finding, and its twin with none is clean. Run `scripts/test-locks.py` on each test file first.
2. [S2] In `post-edit-check.sh:123`, when node's message carries no position, find the first bad token in the masked text (masking keeps offsets) and append `(line L column C)`.
3. [S3] In `dead-code-scan.sh`, guard :48 with `[ "${#files[@]}" -gt 0 ]` and print UNRUN for an empty list.
4. [S4] Add `--only=correctness/noUnreachable` to biome at `unused-names.sh:107`.
5. [S5] Switch `tests/review-contract.test.mjs` to the git listing at its five sites, relocking ADR-098 T2's tests with `adr-verify --relock` and the reason (CLAUDE.md §8: a disk read answers for this machine only).
6. [S6] Use `required('jq', reason)` from `tests/helpers/require.mjs` for the two jq assertions. Before the edit, run `python3 scripts/test-locks.py tests/post-edit-check.test.mjs '<test name>'` for both tests and relock every owner it returns, with the reason; on 2026-10-20 that was ADR-102 T5 through T15 for each. The uvx half of §381 item 18 stays red where uvx is absent, by the owner's rule.
7. [S7] Re-measure the listing in `.claude/rules/19-adopter-footprint.md:26` and write the method, the date and the sha beside it. The re-check's sum, 2026-10-20 at 14bc3430, was skills 5,475 + agents 1,012 + workflows 1,505 characters. [proof: human: the owner reads the figure against the method written beside it]
8. [S8] Record a killed mutant for the position finder, the empty-list guard and the unreachable rule, with a catalogue entry each. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs tests/dead-code-scan.test.mjs tests/unused-names.test.mjs tests/review-contract.test.mjs 2>&1) \
  && for n in "a JSON finding from node names the file's line and column" \
      "an empty list is UNRUN under set -u, not an unbound-variable abort" \
      "an unreachable statement is a finding, and its clean twin is not" \
      "JSONC is read as TypeScript reads it" \
      "a comma with no value before it is not a trailing comma" \
      "the blocking criteria have one definition and every mirror is its text"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a JSON finding from node names the file's line and column` | `tests/post-edit-check.test.mjs` | `{"a": tru}` is placed; an existing position is not doubled | — | S1, S2 |
| `an empty list is UNRUN under set -u, not an unbound-variable abort` | `tests/dead-code-scan.test.mjs` | the guard and the UNRUN line, through the real script under bash | — | S1, S3 |
| `an unreachable statement is a finding, and its clean twin is not` | `tests/unused-names.test.mjs` | the biome rule is on, through the real script | — | S1, S4 |
| `JSONC is read as TypeScript reads it` | `tests/post-edit-check.test.mjs` | the relocked jq assertions skip with their reason where jq is absent | — | S6 |
| `a comma with no value before it is not a trailing comma` | `tests/post-edit-check.test.mjs` | the same, for :416 | — | S6 |
| `the blocking criteria have one definition and every mirror is its text` | `tests/review-contract.test.mjs` | the holders are read from the git listing | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | the PostToolUse hook runs `post-edit-check.sh`; `scripts/selftest.sh` runs `unused-names.sh`; the release runs `dead-code-scan.sh` |
| 3 — the caller can discover it | the finding's own text |
| 4 — it is used | every JSON edit, every gate, every release |

## Mutation Log
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `plugin/scripts/post-edit-check.sh` · the position finder calls every prefix bad, so an unplaced token lands at line 1 column 1; the placed-token test must fail · acceptance-sha256:46426624354984efeffaa01f0bf627bbefd332c4a719d68abf65c7f7dc86138e
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `scripts/dead-code-scan.sh` · the empty-list guard is gone, so an empty Python list aborts under set -u on bash 3.2 or runs vulture over the allowlist alone; the UNRUN test must fail · acceptance-sha256:46426624354984efeffaa01f0bf627bbefd332c4a719d68abf65c7f7dc86138e
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `scripts/unused-names.sh` · biome no longer runs noUnreachable over plugin/ and scripts/, so a statement after return is clean; the unreachable test must fail · acceptance-sha256:46426624354984efeffaa01f0bf627bbefd332c4a719d68abf65c7f7dc86138e

## Invariants

- A message that already carries a position is printed as before, and the `path: ` form stays (ADR-102 T14).
- A relocked test keeps every assertion it had, only reached by a different listing or a skip with a reason.

## Risks

- `noUnreachable` may flag a deliberate `throw` after an exhaustive switch in `plugin/`. Each finding is fixed or wired, never allow-listed, by the owner's rule.

## Stop Condition

Stop if biome's pinned version has no `correctness/noUnreachable`: the rule would need a version bump, which is its own change.

## Out of Scope

- The uvx half of §381 item 18 (permanent: boundary: the owner's rule is that a missing linter is UNRUN and red, never a skip)

## Verification Log
- 2026-10-20 · c48dd5b0* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs tests/dead-code-scan.test.mjs tests/unused-names.test.mjs tests/review-contract.test.mjs 2>&1) \ …` · acceptance-sha256:46426624354984efeffaa01f0bf627bbefd332c4a719d68abf65c7f7dc86138e · ms:9779 · test-lock-sha256:8344447c9fe23caf246619afd58ac9d318b3290074e1b5cbe2123af71d2ac7d7 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZGVhZC1jb2RlLXNjYW4udGVzdC5tanMJYW4gZW1wdHkgbGlzdCBpcyBVTlJVTiB1bmRlciBzZXQgLXUsIG5vdCBhbiB1bmJvdW5kLXZhcmlhYmxlIGFib3J0CWMyYWNiNzk4Yzg0MWRhZmY5YTc4ZTdjNGJiNjQ2MmE2NjdlZWZjNjBkNTkwZGFiZDgwZTEyOTI4ZmE3Nzc0YTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJSlNPTkMgaXMgcmVhZCBhcyBUeXBlU2NyaXB0IHJlYWRzIGl0CWViZDUxMzAxZDIzNjJjYzY1N2ExMDNjMDcyMWQ1NmY5N2QwOTIyYzk5MjE5ZTVlYWY5ZTIyNzI1ZTYyNDFkMzUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSAuanMgZmlsZSBkcmF3cyBub3RoaW5nLCB3aGV0aGVyIGl0IGlzIGEgV29ya2Zsb3cgc2NyaXB0LCBhIG1vZHVsZSBvciBicm9rZW4JMGY5YmQ2NGI2NmIzNTY3ZGExYjRiMTY5NDdiNzZhNGRhN2VjYTM0NTAzODRhNTE3YThkZDUwZTM3ZWYzN2RkMwpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIENvbW1vbkpTIGZpbmRpbmcgaXMgdGhlIGVycm9yLCBub3Qgbm9kZSdzIHN0YWNrCTVjNjU0ZGFkMzUxNGZiNjVkMmFiZWNhZTY1MmFjNDIxOTM2YzY1M2Q3M2NlMjIzMmU3NDUwZjZlNTFlYmQ0NWUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBKU09OIGZpbGUgd2l0aCBub3RoaW5nIGluIGl0IHJlYWRzIHRoZSBzYW1lIHdpdGggYW5kIHdpdGhvdXQganEJZmY1OWVkOGZmNTZlMzQzOWY1MTlkYTM4OTBkZmQ1MTExYWY5NWI5YjRjNDZhMGI2Njk5M2Q3OTM1ZWU2NzhiZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIEpTT04gZmluZGluZyBmcm9tIG5vZGUgaXMgb25lIGxpbmUJYzEzZmFhMDBhYWQ0MTM1MWM5MDEzY2Y5MTY1ZTM2ZjhlY2Y1NDI1MTdlYTdkYWI0NjU3NzUxZjRmZWQ3MjZhNApib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIEpTT04gZmluZGluZyBmcm9tIG5vZGUgbmFtZXMgdGhlIGZpbGUncyBsaW5lIGFuZCBjb2x1bW4JMzIxMDgxYTU2YTNmM2ViNzA1ZTEyMThhZTQwMGQzMmVkNDVlYzYyZTlmMjc4NDk5OTNmOWZhODk0ZTJhOWNkZQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIFBIUCBmaW5kaW5nIGlzIHNhaWQgb25jZQljYmQ1MTgwNTExZGU1NTIxYjk3YmJkZTMzZTFmNzYwZWI3M2I3NDEzZGVhNDc2NjYyMzQ0ZWM4OTBjNWEyNjNmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgUHl0aG9uIGZpbmRpbmcgc3Vydml2ZXMgYSBjb25zb2xlIHRoYXQgY2Fubm90IGVuY29kZSBpdHMgbGluZQk4NzY4NjM3NDYxY2Q5YzdlMDU4MDMzMWU1MjQyZDM5Y2VkNWUzNWMxYWNlZmUwYzUyMGRjZjFjOGIwZDMwZDQ3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY2hlY2tlciB0aGF0IGNvdWxkIG5vdCBydW4gaXMgVU5SVU4sIG5ldmVyIGEgZmluZGluZyBhYm91dCB0aGUgZmlsZQliYjcwYWI3YWJlNWMxYjZjNDEzMjA0NmZhNGUyNjc4ODBmZTMzODYzMzAwMDVjMTMwN2ZjYTQ4MTY3ZmE4OGVmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY2hlY2tlciB0aGF0IGZhaWxzIHdpdGhvdXQgYSB3b3JkIGlzIFVOUlVOLCBhbmQgdGhlIGhvb2sgZXhpdHMgMAkzMGFhNzliNTI4MGY3ZjU2ZDc3MjIyNjZjNGUxNWJhOWI1ODA1NjM5YzM3NTI0ZDI5N2JhOGMzYWJiNjkzZGVkCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgY2xlYW4gZmlsZSBzYXlzIG5vdGhpbmcsIGFuZCBhIGJyb2tlbiBvbmUgaXMgc3RpbGwgbmFtZWQJZDM2YmQ0M2E4ZTQ1M2NjNTE1MjJmZjU1MDZmY2I5ZThjMjdhYzU3YzZmYjFjMjdjOGRlNmQ5MzY3YzdlYzVlNwpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGNvbW1hIHdpdGggbm8gdmFsdWUgYmVmb3JlIGl0IGlzIG5vdCBhIHRyYWlsaW5nIGNvbW1hCTE5NjA5YWM2MTZiMTE2YjcyYmYzYjhmZDVjOTViYjIxM2ViZGM2ZDczOTg5MjYyNWNhZjU4YjBiYWMzNmJmY2YKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBkeWluZyBjaGVja2VyIGNhbm5vdCBwYXNzIGl0c2VsZiBvZmYgYXMgY29tcGxldGUgYnkgcHJpbnRpbmcgdGhlIG1hcmtlcgk4OGUxY2UzY2I0ZDFjNDBhZTlkMmQ1ZTA1MWViODA5ZWUxYWNiNWM0ZWM1MTk5YzdiNGYyNjdmNWIxMWRiNWYxCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmlsZSB0eXBlIHRoZSBob29rIGRvZXMgbm90IGhhbmRsZSBpcyBzaWxlbnQsIG5vdCBhbiBlcnJvcgkxZGIwOTI5MmViNTk1YjkzODFiYjExZWI2NGM4NTU4N2E1YTc4ZDI3MmQwOWJmZTllNzBmNTllODAxZDNhNGVmCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmluZGluZyBjb21lcyBvbmx5IGZyb20gdGhlIGZpbGUncyBvd24gcGFyc2VyCTljYzQ1NGU2YTRhY2ViNTE1M2ZjZmNmNjM3NTI2MWRmM2M3ZWIzMmJmMDY5MzJmYjcxNWFmOTQ2MzU1OTFmMTQKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBmaW5kaW5nIGlzIHJlYWQgZnJvbSB0aGUgcmVhZGVyJ3Mgb3duIG91dHB1dCwgbm90IG5vZGUncwk3NjgyMmMzZTgwZThiOTRhZWZkNzNhNGRhOTVjMTAwMmU0NWQ5MjE5NTY5YzdkYzlhYjYwOTc3ZmQwYmU2MmU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZmluZGluZyBuYW1lcyB0aGUgZWRpdGVkIGZpbGUgYW5kIGdpdmVzIHRoZSBlcnJvciBhbG9uZQlhNjRmZTM0YTI1ZjUxZWZlNmY2NzI5MjY0ZTQxNDQ5ZjVjYjMyYmRmNDQzOWM2ZWFjZDY4ZmFhMGUzYjI0NzY0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgbGluZSBjb21tZW50IGVuZHMgYXQgVSsyMDI4IGFuZCBVKzIwMjksIGFzIFR5cGVTY3JpcHQgcmVhZHMgb25lCWRkMjVhMTczMTQyNzc0ZTAzMzIxNWIwNTY0Yzk4Y2EwZGRmZmVlNTg2ODVjOGVlZWRmNWNkMDhjY2FhMGM2NzIKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBub2RlIHRoYXQgY2Fubm90IHN0YXJ0IHNheXMgbm90aGluZyBhYm91dCBhIC5janMgZmlsZQk2MmQ4Zjg1MmIzZTFjNTJmN2Y3MWQ2NGM3ZDUzYmM4MDljN2UxZjY0MmRiNWI0OTZmMTBlMTM1YmFmMjY0YTMxCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgbm9kZSB0aGF0IGNhbm5vdCBzdGFydCBzYXlzIG5vdGhpbmcgYWJvdXQgdGhlIGZpbGUJN2JmNDE2OWVhMjNmYzk3ODdhMmFjZDZlZGIwM2Q5YzZlYjBlMThhYTMzOGIzODgzMmQzN2ZiNGE0ZGIzOGY4Mwpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHB5dGhvbjMgdGhhdCBpcyBub3QgUHl0aG9uIGlzIG5vdCBhIGNoZWNrZXIJM2ZlZWM4YzE4MmUxNTg0YTIzNzFlOWYyZjA0ZGZmZDZlNWU2Y2E1MWUxMzRmMjQ0OWQ1MDZjYzlkOWQyMTI2ZQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIHN5bnRheCBmaW5kaW5nIGF0IHRoZSBlZGl0IHJlYWNoZXMgdGhlIGFnZW50LCBhbmQgYSBjbGVhbiBlZGl0IGhhbmRzIGl0IG5vdGhpbmcJODE1M2NlODNjMjNhODU5NmU3ODRiMDFiODVmYjRmODE2MzgyYzFkZGNiZjI3MTJkNGU5NTkxZGQ1NWNkODBhYQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhbiBVTlJVTiBsaW5lIG5hbWVzIG5vZGUsIG5vdCB0aGUgZmlsZSwgYXMgd2hhdCBmYWlsZWQJZGRmN2E4Zjg3ZWJhZTU3YjcyYTViZjZhZjI4YzgyNjk2NTU0NWFiZWUyOGI3MDVjMzlmNGE3ZjhmNDI3MWUxNwpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBvbmx5IGFjdHMgb24gdGhlIHRvb2xzIGl0IGlzIGZvciwgYW5kIG9uIGZpbGVzIHRoYXQgZXhpc3QJMDNmMjZkYWQ0ZjQ4NWUwNmM0MGQ0YjQ0MjZhNzAxMDNkMGI4MDZmOTZlMGU5MWI1Zjk1MTg2OWZiOTMwMGVlYgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwl0aGUgaG9vayBwaWNrcyB0aGUgcGFyc2UgZ29hbCBmcm9tIHRoZSBleHRlbnNpb24sIGFuZCBkaWFnbm9zdGljcyBjYW5ub3QgZm9yZ2UgdGhlIG1hcmtlcgk0MGJjZjZmZjQ5MmM0MmZlN2VmODgwNmZiM2FiODYzZDUzNTkxZWU5MzY3OTUxYjlmOWRhNjI1ZDU1Yjc3ZmU1CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHJlcG9ydHMgYSBzeW50YXggZXJyb3Igd2l0aG91dCBmYWlsaW5nIHRoZSBlZGl0CWExYTU5YWFiZDFiN2ZmYzFjZjEwYTc2ZDFjMTFiYTllZGQ3ZjlmMTgwNDYwOTBhMzEwYmFlZjk2Y2M3MzhlN2QKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJd2l0aG91dCBqcSwgbm9kZSByZWFkcyBKU09OIGFzIEpTT05DCWE2YTI5YzlmMzZlMTBmODdmMTI1ZDQ0MjI4YTIwMzFmNjE1MTAxMGM0MzZlN2I4NWNhZTk5NDRkYmU5YTU2NDQKYm9keQl0ZXN0cy9yZXZpZXctY29udHJhY3QudGVzdC5tanMJYSB3b3JrZmxvdyBwcm9tcHQga2VlcHMgb25lIHJvbGUgc2VudGVuY2UgYW5kIG5vIHJlc3RhdGVkIHJ1bGVzCTgwYTM2N2EwMGFhZjE1OWVjZjA2OWVlYTFjOWRiNmViMDllNTU1ZTY4YzY4OGFjNTZjY2I2NmFiZjgzM2FjNTUKYm9keQl0ZXN0cy9yZXZpZXctY29udHJhY3QudGVzdC5tanMJZXZlcnkgZWRpdGluZyByb2xlIGtlZXBzIGFuIGV4cGxpY2l0IHB1Ymxpc2ggcHJvaGliaXRpb24JY2FjYzYyMDFiMTMyNzI1ODg5MzM3MmU5Y2Y2ZWIyMzIzMDMxZTY2Yjc5YWY2NGRlNDE1MmJjODlmZmY4YTNiMwpib2R5CXRlc3RzL3Jldmlldy1jb250cmFjdC50ZXN0Lm1qcwlldmVyeSByZXZpZXcgc2NoZW1hIHNheXMgYmxvY2tpbmcgb3IgYWR2aXNvcnkJZDE0ZmI3NTU5OWU1MTQ0NTg4MjgxYjQ0N2U0ZDc0M2FjMDVjYjIyNTU3NWVhNzQ5ZjkxNDNhNDQ3YWIyNDY5OQpib2R5CXRlc3RzL3Jldmlldy1jb250cmFjdC50ZXN0Lm1qcwlubyBhZ2VudCBmaWxlIHJlc3RhdGVzIHRoZSBsZWFmIGNvbnRyYWN0IHRoZSBTdWJhZ2VudFN0YXJ0IGhvb2sgZ2l2ZXMJZjkwZmZiZDkwNDU2MzBkOGQwZGNkZmJlYmU3NWVjZjgwY2FjOTkyZTI4NmE0N2IxNjFhNGI3ZGIyMmM5ZGFhNQpib2R5CXRlc3RzL3Jldmlldy1jb250cmFjdC50ZXN0Lm1qcwlubyByZXZpZXcgc3VyZmFjZSB0ZWxscyBhIHJldmlld2VyIHRoZSBvbGQgc2V2ZXJpdHkgd29yZHMJNDBhMzM2MmZlNDA0YjBjYmNhYTc0NzZhY2JmNzE0Mjg0ZmVhNjEyNjBiNzE1NGE2ODA1ODA4MjM1ZWZiZDkxMQpib2R5CXRlc3RzL3Jldmlldy1jb250cmFjdC50ZXN0Lm1qcwl0aGUgYmxvY2tpbmcgY3JpdGVyaWEgaGF2ZSBvbmUgZGVmaW5pdGlvbiBhbmQgZXZlcnkgbWlycm9yIGlzIGl0cyB0ZXh0CTJlZjZlMGE1MjU5MzU4YThkMTNkNDExYzlhNTU0ZjNkYjFhYzZkNDVmOGU0MmUwZTUyMGE4NDE2NTMzNmM1NWMKYm9keQl0ZXN0cy9yZXZpZXctY29udHJhY3QudGVzdC5tanMJdGhlIGNhbm9uaWNhbCBibG9ja2luZyBibG9jayBpcyBkZWZpbml0aW9uIEEJY2Y0ODI4NjIwNTgzNjg2MzlkMzBlYjVlN2QwOTcwMDI2YTI2OTFkMzFjYjg1N2RjZTEwNTU5NDFiZTZlMjAxNgpib2R5CXRlc3RzL3VudXNlZC1uYW1lcy50ZXN0Lm1qcwlhIGZpbGUgcGFzdCB0aGUgZmlyc3QgaHVuZHJlZCBpcyByZWFkLCBhbmQgZWFjaCBiYXRjaCBnaXZlcyBpdHMgb3duIHZlcmRpY3QJYjgwNTY1MDM5NmVkYmI4NTA3Njg1YzIwNDEwNmRiODY1ZmU1MTI5YzkyOGJmYTAxYmFjYjlkOWM1NTI5NjkxMwpib2R5CXRlc3RzL3VudXNlZC1uYW1lcy50ZXN0Lm1qcwlhIGxpbnRlciB0aGF0IGlzIHByZXNlbnQgYnV0IGNhbm5vdCBzdGFydCBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nCTU5YjBmMGEzMmVkMWVkODFlZGY0YTUwOTY3YzViZWNkYTY5ZDAzY2IyZGViNTk1MjQzMmYyOWY5NDAxNDQxMzQKYm9keQl0ZXN0cy91bnVzZWQtbmFtZXMudGVzdC5tanMJYSBsb2NhbCBpbnNpZGUgYSB0ZXN0IGlzIG5vdCBhIGZpbmRpbmc6IG9ubHkgaXRzIGltcG9ydHMgYXJlIHJlYWQJYjA5NjZmNTk0OGExYWY0M2U1MDRmMGExNDQ0NjY1YjEyODM4NmY4OGIxN2Q4ZTFkNDI5NDI4NTFmN2NmZjBlOApib2R5CXRlc3RzL3VudXNlZC1uYW1lcy50ZXN0Lm1qcwlhIHBhdGggZ2l0IHF1b3RlcyBpcyBuYW1lZCBhcyB1bnJlYWQsIG5vdCBza2lwcGVkCWJmZGI4ODhhYzczNzgzMDY4M2M0MmNhYzZkMzg2YzM0NTE1N2I1ZTFmZDkxZDcwMGM5Yjg0MmU1NzY1MmRkYjkKYm9keQl0ZXN0cy91bnVzZWQtbmFtZXMudGVzdC5tanMJYSBydWZmIHRoYXQgaXMgbm90IHRoZSBwaW5uZWQgdmVyc2lvbiBpcyBub3QgdXNlZAljOGY4MDdkMWQyMTkwZTdkNjkxNGUxYWMxNDdmOTM1NjA1OTIzYWRkZDVmYTQyMWFjMjIzM2IxOTlhNzM2ZDFiCmJvZHkJdGVzdHMvdW51c2VkLW5hbWVzLnRlc3QubWpzCWEgdHJlZSB3aXRoIG5vIGZpbGUgb2YgYSBjbGFzcyByZWFkIG5vdGhpbmcgdGhlcmUsIHdoaWNoIGlzIFVOUlVOLCBub3QgY2xlYW4JZWQxNjczODc5MTQzZDdiZmNjY2Q4ZjhhZWMwMzE2ZjA5OTAwYTg1NGE1NmM1NzZlZjA1YzhkMWJiZjY2ZGQ5NApib2R5CXRlc3RzL3VudXNlZC1uYW1lcy50ZXN0Lm1qcwlhIHZlcmRpY3QgaXMgdGhlIHRvb2wncyBvd24gc3VtbWFyeSBsaW5lLCBub3QgaXRzIHdvcmRzIGFueXdoZXJlIGluIHRoZSBvdXRwdXQJNzRkNTZkN2Y2ZmJlYTdlMDdmZTY5ZjVlY2M3YmQzYzQzMGU1YTFlY2UwOTYzZTE5YmRmNmQ3Mjg5YzViMDg4NApib2R5CXRlc3RzL3VudXNlZC1uYW1lcy50ZXN0Lm1qcwlhbiB1bnJlYWNoYWJsZSBzdGF0ZW1lbnQgaXMgYSBmaW5kaW5nLCBhbmQgaXRzIGNsZWFuIHR3aW4gaXMgbm90CTM3ODM5MTdiNDc1MmFiMTYyZGY2ZWQ4ZDlhZWE0ZGE3MDUwNDFmN2ZiODdkMDdlNzIxMWM3Mzg1YWUzZmZiOTEKYm9keQl0ZXN0cy91bnVzZWQtbmFtZXMudGVzdC5tanMJdGhlIGdhdGUsIHRoZSByZWxlYXNlIHNjYW4gYW5kIGV2ZXJ5IENJIGpvYiB0aGF0IHJ1bnMgdGhlIHRlc3RzIGFyZSB3aXJlZCB0byBpdAkwNzcwZDAwOTkxMmEyMzNhZWFjMTViNzA1YTU4Zjg2YmYzZmYxMWVjMGJiYmNjNGQwNzUyMTk0YThmNDExYTMwCmJvZHkJdGVzdHMvdW51c2VkLW5hbWVzLnRlc3QubWpzCXRoZSBzYW1lIGZpbGVzIHdpdGggZXZlcnkgbmFtZSByZWFkIGFyZSBjbGVhbgljMTcwYzAyNGRiOThhYTMzYTA4MTQxZjcyODZlZGMyMjJmZWFiYzA2ZTg2ZWNiNTQyNmIxMDNkNmM4ZDJmZjBlCmJvZHkJdGVzdHMvdW51c2VkLW5hbWVzLnRlc3QubWpzCXdpdGggbm8gdG9vbHMgb24gUEFUSCBpdCBpcyBVTlJVTiwgbmFtaW5nIGVhY2ggbGludGVyLCBuZXZlciBjbGVhbgljODExMTY3YWViODU3MWNmZDk1YjM4NTQzYjhjNzk1MzJlMzQzMjZlYTVhYTcwMGVmODMzZDI5N2ViOThmZDI2
  ```
  ```
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs tests/dead-code-scan.test.mjs tests/unused-names.test.mjs tests/review-contract.test.mjs 2>&1) \ …` · acceptance-sha256:46426624354984efeffaa01f0bf627bbefd332c4a719d68abf65c7f7dc86138e · ms:8133
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs tests/dead-code-scan.test.mjs tests/unused-names.test.mjs tests/review-contract.test.mjs 2>&1) \ …` · acceptance-sha256:46426624354984efeffaa01f0bf627bbefd332c4a719d68abf65c7f7dc86138e · ms:8313
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs tests/dead-code-scan.test.mjs tests/unused-names.test.mjs tests/review-contract.test.mjs 2>&1) \ …` · acceptance-sha256:46426624354984efeffaa01f0bf627bbefd332c4a719d68abf65c7f7dc86138e · ms:8330
