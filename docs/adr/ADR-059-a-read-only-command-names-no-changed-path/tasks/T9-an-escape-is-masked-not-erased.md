# Task ADR-059-T9: An escape is masked, not erased

**Depends-on:** T8
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a masked escape keeping its word in the redirect target`, `a quoted run stopping at a backslash-newline`, `an unmasked escape not reading as a redirect`, `each named test actually running`

Added 2026-09-17 from a Codex review (`gpt-6-astra`, high) of T8 (`1f823d0` against `e31187e`), which found two fail-opens T8 introduced:
- **Erased escape:** T8 replaced an escaped character with a space. `echo x > \./dev/null` writes `./dev/null` in bash (checked in a scratch directory with a `dev` directory), but the scanned target became `/dev/null`, which `WRITE_REDIRECT` exempts. Classification went from `mutation` to `neither`, authorship from `bash` to `none`, and the reviewer guard's exit from 2 to 0. `\a/dev/null` behaves the same.
- **Hidden substitution:** T8 let a double-quoted run's escape match a newline. So `echo "$(printf x > README.md)\` + newline + `"` became one quoted run, and its redirect was stripped. Classification went from `mutation` to `neither` and authorship from `bash` to `none`.

A prototype of this task's strip gave the expected redirect answer, the answer bash's behaviour gives, on 14 inputs: the two above, T8's five, the parent's quoted and `/dev/null` cases, `printf "\"" > a.md`, and a line-continued `echo x \` + newline + `> a.md`.

## Goal

`withoutQuotedSegments` replaces an unquoted escaped character with `__`, a non-space placeholder that is not an operator, so the escape stays part of its word. A double-quoted run's escape stays `\\.`, as at T8's parent, so a run does not continue across a backslash-newline.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `withoutQuotedSegments` masks escapes with `__` and keeps `\\.` inside double quotes |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins T8's escaped `>` and plain `/dev/null` reads and passes before the change; S3's mutants show it can fail.
2. [S2] Replace with a callback: `__` for a match starting with a backslash, a space otherwise. Restore `\\.` in the double-quoted alternative.
3. [S3] Run the fence green and record mutants: mask with a space; let the quoted run's escape match a newline; return an escape unmasked; rename a test so it selects nothing. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a masked escape keeps a write visible|a masked escape is still no redirect)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a masked escape keeps a write visible' 'a masked escape is still no redirect'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/classify.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a masked escape keeps a write visible` | `tests/read-only-arguments.test.mjs` | `echo x > \./dev/null` and `echo x > \a/dev/null` classify `mutation`, record authorship `bash`, and the reviewer guard refuses them (exit 2). `echo "$(printf x > README.md)\` + newline + `"` classifies `mutation` and records authorship `bash` | — | S1, S2 |
| `a masked escape is still no redirect` | `tests/read-only-arguments.test.mjs` | `echo \> notes.txt`, `echo x > /dev/null` and `echo x 2>/dev/null` classify `neither` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `isPotentialMutationCommand` tests `WRITE_REDIRECT` on `withoutQuotedSegments`'s output; the tests reach it through `classifyCommand`, `analyzeTranscript` and the guard process; S3's mutants break each |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every commit and Stop advisory and every reviewer Bash call |

## Mutation Log
- 2026-09-17 · 1f823d0* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an escape is erased to a space again, so echo x > \./dev/null reads as /dev/null and is no write · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · covers:a masked escape keeping its word in the redirect target
- 2026-09-17 · 1f823d0* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a quoted run continues across a backslash-newline again and hides the $(printf x > README.md) redirect · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · covers:a quoted run stopping at a backslash-newline
- 2026-09-17 · 1f823d0* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an escape is left unmasked, so echo \> notes.txt reads as a redirect · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · covers:an unmasked escape not reading as a redirect
- 2026-09-17 · 1f823d0* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · covers:each named test actually running

## Invariants

- T8's cases keep their answers.

## Risks

- `echo "$(printf x > README.md)"` on one line was already classified `neither` at T8's parent; that older gap stays (BACKLOG §227).

## Stop Condition

Stop and ask if a `tests/classify.test.mjs` or `tests/reviewer-guard.test.mjs` case goes red.

## Out of Scope

- A redirect inside a `$(…)` in double quotes on one line, `echo x ->README.md`, and Markdown extraction from a backslash path (deferred: docs/BACKLOG.md §227)

## Verification Log
- 2026-09-17 · 1f823d0* · exit 1 · `set -o pipefail …` · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · ms:99 · test-lock-sha256:139f47256b277553b3c3aa264c80d334a9160e9d74069d60a693a1f6d599eadc · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB0aGF0IGFsc28gd3JpdGVzIGlzIHN0aWxsIGEgd3JpdGUJYjYzMTdhZTBjZTUyZmMxYzA3ZjkwMGEwMGIyYmQwZWViM2NjM2ViNjUzZjIwMzZiZjgxOWVlOTZlZTMxMmQ0Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB3aXRoIG5vIHdyaXRlIGlzIHN0aWxsIG5vIHdyaXRlCTUwYTQzZTI5Zjg4NWU3ZmU3Njc0NTRlZDRlNDc2NGI4OTNhMjUwZDdmOTg3MDdjY2JhYmFlZTFhZTkzMjM4YTgKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFtaWx5IHRoYXQgY2FuIHdyaXRlIG5hbWVzIG5vIGNoYW5nZWQgcGF0aCB1bnRpbCBpdCB1c2VzIHRoYXQgY2hhbm5lbAk4ZDY2ZDA3MDk5OTkwMWQ1MGFmYTg3OWY4YzAxOWEwZjZmZDhjOTRkODY0OTdiNjQ2M2EyYmY5ODRmYjE1MDJjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIG1hc2tlZCBlc2NhcGUgaXMgc3RpbGwgbm8gcmVkaXJlY3QJN2FmNTZlYWVhYWU4NjdjZTBmNWYyNTMyZWIwYWVjYmI0M2Y3NGFiYjg2MWNjNmJhNGIzNTg5ODI5NDUzYTcyNgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBtYXNrZWQgZXNjYXBlIGtlZXBzIGEgd3JpdGUgdmlzaWJsZQkzNzRjNTUzMzEzOTgwYWFkZjRlYjE4NjI3MGYzN2RjNjhjMzZmYmUxYjRiY2YzYWM4YTc5NzhmYjUzMDdkMTA5CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlYWQgd2l0aG91dCBpdHMgY2hhbm5lbCBpcyBzdGlsbCBub3QgYSB3cml0ZQliOWE1MjgwZjBiNzViNjc2YmY2ZGI0NTVlNjQxMTJjMjlmMjc0ZGY1MDVhMjRhNDA1NDYyZDIxNDE4YmUwNWVjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlZGlyZWN0IGJlc2lkZSBhIGNoYW5uZWwtZnJlZSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTE3M2IyNGRhNmIxZmYyYjg5OTRiZDU5ZGY2N2I1M2U3ZDc3MjNkYzlhNzYwODNhNDllYTNhY2MxZjA3YjUyZTcKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdXNlZCB3cml0ZSBjaGFubmVsIGlzIGEgd3JpdGUgdG8gdGhlIGNsYXNzaWZpZXIgYW5kIHRoZSBndWFyZAk4MDJmNDU5MTcxNDdjNWExY2FkYzQ2YzQ3NzQ4ZTViMzdjMTMzZDM3YTg3ZDlmOGU5NDRmN2FlNGFiZDIwNGNkCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBrZWVwcyBldmVyeSBjYW5kaWRhdGUJNGNlNGE4ZWMyMGY1N2Y5MzgwZjY0NDhmOWM3ZTQ0N2Y0NDUyNTk5MjFlMGM5YTU1NjllZDE1ZTA5NjBjMmIwMgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBub3QgYSBjaGFuZ2VkIHBhdGgJMTNkZDg1N2JkNjYxYzMwM2RiZmRlNjc1ZDViZWI3ZWNjNjQ4MzBlYjM1ODljMTM4NzhmZDcxN2UyM2M3NmUzMQpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbnNpZGUgYSByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJZTY3ZDRjYjUyZjZmMTM4N2QyODM0N2QzMzk2M2QzY2YxNGI2ZDgwNDU1ZjE2NWI5ZmM5Njc4MDlkYzIxNWYxYgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gYXNzaWduZWQgcGF0aCB1c2VkIG9ubHkgYnkgcmVhZHMgaXMgbm90IGEgY2hhbmdlZCBwYXRoCWE4ZmZhNjUzMmY1ZmFmODM3YWFmNzdjYjA4ZTZjY2FkOTE5MDQ2ZDExMDM3ZjQwNTgwYzhiZTRkZmI0YzQxYjYKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggd3JpdHRlbiwgaGlkZGVuLCBleHBvcnRlZCBvciBuZXZlciByZWZlcmVuY2VkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTNkOWYzZmJmZTBhNDM5YWM2N2FhNThhMTQ0NWM4MWU5YzFmZDNmNDMyNDUyZWY1NWFlMTM4YmE3MDRlN2U2ZTkKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGVzY2FwZWQgcXVvdGUgZG9lcyBub3QgaGlkZSBhIHJlZGlyZWN0IHRhcmdldAk1MzU0YWIyMmU0NDFiZmU4NTc0MDMyNGFhZDE5ZWQ2YzgyMmMwZTQ3YjQ1ZjU3Nzc5YzRlMjM0ODhmODk4Mzk3CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIGluIGEgcmVhZCBvcGVyYW5kIGlzIHN0aWxsIGEgcmVhZAkyN2E5MzNjNWE0NmJlYTNhM2NhNTYzMTdjZjYyZmE1ZDg1ZDdjZWRkYTIxYTI1ZjA4OWY3OTBkZWU5MWFlNmVjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIG9yIG5ld2xpbmUgZG9lcyBub3QgaGlkZSBhIHdyaXRlCWFkN2U0NDhmZjAzMzRiMjBjNGViNWFmNzdhMWU5Mzk3NjAwOTAxZGVhYmRmMjAxOTFmOWNkZTliZTg0YmUxNjAKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGVzY2FwZWQgcmVkaXJlY3QgY2hhcmFjdGVyIGlzIG5vdCBhIHdyaXRlCTllYTlkMWFkMzMwZTljODc2NjhjYjJlNDE0MzRjNTcwZDQzYzRmNDczMDMwMTNlZTdkNWI2NDA2ZjI2YzEyYmQ
  ```
  ```
- 2026-09-17 · 1f823d0* · exit 0 · `set -o pipefail …` · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · ms:23756
- 2026-09-17 · 1f823d0* · exit 0 · `set -o pipefail …` · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · ms:23258
- 2026-09-17 · 1f823d0* · exit 0 · `set -o pipefail …` · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · ms:23316
- 2026-09-17 · 1f823d0* · exit 0 · `set -o pipefail …` · acceptance-sha256:a925941d9a0ccb7c53661f89db52ce818882ad9ba62708309ff38b84dcedb510 · ms:23392
