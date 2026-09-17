# Task ADR-059-T8: An escaped character is part of its word in every redirect scan

**Depends-on:** T7
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an escaped newline in the redirect-operand word scan`, `an escape in the quoted-segment strip before the redirect test`, `an escaped redirect character staying a read`, `each named test actually running`

Added 2026-09-17 from a Codex review (`gpt-6-astra`, high) of T6 and T7:
- **A regression in T7 (fail-open):** `isRedirectOperand` matched an escape as `\\.`, and `.` does not match a newline. `T=README.md; printf x > "./\` followed by a newline and `$T"` returned `README.md` at `8d45cec` and nothing at `0dea421`.
- **An older gap (fail-open):** `T=README.md; printf \" > "$T"` writes README.md (run in `bash -c`), but it classifies `neither` with authorship `none` at `0dea421`, and did so at `v2.99.6` too. T7 had fixed only its path extraction. `withoutQuotedSegments` (`lifecycle.mjs:98`) strips quoted runs before `WRITE_REDIRECT` is tested, and reads an unquoted `\"` as an opening quote. So `" > "` is stripped, and the redirect with it.

T7's record says its two helpers were the only members of the class. That claim was wrong: the sweep command it records, a `grep` with `\|` alternation, matched only the `quote ===` lines. The sweep was redone with fixed-string searches, `rg -n -F -- '<pattern>' plugin/scripts/lifecycle.mjs plugin/scripts/classify-command.mjs plugin/scripts/reviewer-guard.mjs`, for `"[^"]*"`, `"(?:[^"\\]|\\.)*"`, `'[^']*'`, `quote ===`, `[^"\\]` and `\\.`. It lists these shell-quote members:
- the character scanners at `lifecycle.mjs:364`, `:414` and `:475`, which honour a backslash;
- `withoutQuotedSegments` (`:98`) and `isRedirectOperand` (`:1377`), fixed here;
- `CD_ONLY` (`:1064`), `ASSIGNMENT_ONLY` and `ASSIGNMENT_PREFIX` (`:1090`–`:1091`), `REDIRECT_TARGET` (`:2080`), `SHELL_ASSIGNMENT` (`:2120`), `NAVIGATION_PREFIX` (`:2380`), the quote trackers ending at `:749` and `:770`, and `innerCommands` (`:4572`).

The last group is left for BACKLOG §226 with its failure direction unassessed. `:1556`, `:1587` and `:1602` match Python or JavaScript string literals, not shell words.

## Goal

A backslash escapes any next character, newline included, in `isRedirectOperand`'s word scan. `withoutQuotedSegments` removes an escaped character before it strips quoted runs, so an escaped quote opens no run and an escaped `>` is no redirect.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `isRedirectOperand` matches `\\[\s\S]`; `withoutQuotedSegments` strips `\\[\s\S]` before quoted runs |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins escaped redirect characters and fails before the change on `echo \> notes.txt`, which classifies `mutation` although bash writes nothing.
2. [S2] Change both escape alternatives in `isRedirectOperand` to `\\[\s\S]`, and add `\\[\s\S]` as the first alternative in `withoutQuotedSegments`, with the double-quoted run's escape also `\\[\s\S]`.
3. [S3] Run the fence green and record mutants: restore `\\.` in `isRedirectOperand`; drop the escape alternative from `withoutQuotedSegments`; let the strip's escape skip `>`; rename a test so it selects nothing. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(an escaped quote or newline does not hide a write|an escaped redirect character is not a write)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'an escaped quote or newline does not hide a write' 'an escaped redirect character is not a write'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/classify.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an escaped quote or newline does not hide a write` | `tests/read-only-arguments.test.mjs` | `T=README.md; printf x > "./\` + newline + `$T"` yields README.md. `T=README.md; printf \" > "$T"`, `printf a\"b > "$T"` and `T=README.md; echo \" >> "x.md"` classify `mutation`, record authorship `bash`, and the reviewer guard refuses them (exit 2) | — | S1, S2 |
| `an escaped redirect character is not a write` | `tests/read-only-arguments.test.mjs` | `echo \> notes.txt` and `echo \\"x > y"`, which write nothing in bash, classify `neither` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `isPotentialMutationCommand` calls `withoutQuotedSegments`, and `assignedNamesAWriterMayUse` calls `isRedirectOperand`; the tests reach both through `classifyCommand`, `analyzeTranscript`, the guard process and `bashMarkdownMutationPaths`; S3's mutants break each |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every commit and Stop advisory and every reviewer Bash call |

## Mutation Log
- 2026-09-17 · e31187e* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the escape no longer matches a newline, so a continued redirect target drops README.md again · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · covers:an escaped newline in the redirect-operand word scan
- 2026-09-17 · e31187e* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an unquoted escaped quote opens a run again, so printf \" > "$T" classifies neither · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · covers:an escape in the quoted-segment strip before the redirect test
- 2026-09-17 · e31187e* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an escaped > survives the strip and reads as a redirect, so echo \> notes.txt is a mutation · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · covers:an escaped redirect character staying a read
- 2026-09-17 · e31187e* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · covers:each named test actually running

## Invariants

- A quoted `>` (`echo "a > b"`, `echo 'x > y'`) is still no redirect, and `2>/dev/null` is still no write.

## Risks

- `$'…'` ANSI-C quoting is not modelled.

## Stop Condition

Stop and ask if a `tests/classify.test.mjs` or `tests/reviewer-guard.test.mjs` case goes red.

## Out of Scope

- The unassessed members of the sweep above (deferred: docs/BACKLOG.md §226)

## Verification Log
- 2026-09-17 · e31187e* · exit 1 · `set -o pipefail …` · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · ms:103 · test-lock-sha256:b4f51d6fee94d24e6186308fece36fd9dc0a6b06ddbb153ff16055c25585bbf5 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB0aGF0IGFsc28gd3JpdGVzIGlzIHN0aWxsIGEgd3JpdGUJYjYzMTdhZTBjZTUyZmMxYzA3ZjkwMGEwMGIyYmQwZWViM2NjM2ViNjUzZjIwMzZiZjgxOWVlOTZlZTMxMmQ0Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB3aXRoIG5vIHdyaXRlIGlzIHN0aWxsIG5vIHdyaXRlCTUwYTQzZTI5Zjg4NWU3ZmU3Njc0NTRlZDRlNDc2NGI4OTNhMjUwZDdmOTg3MDdjY2JhYmFlZTFhZTkzMjM4YTgKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFtaWx5IHRoYXQgY2FuIHdyaXRlIG5hbWVzIG5vIGNoYW5nZWQgcGF0aCB1bnRpbCBpdCB1c2VzIHRoYXQgY2hhbm5lbAk4ZDY2ZDA3MDk5OTkwMWQ1MGFmYTg3OWY4YzAxOWEwZjZmZDhjOTRkODY0OTdiNjQ2M2EyYmY5ODRmYjE1MDJjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlYWQgd2l0aG91dCBpdHMgY2hhbm5lbCBpcyBzdGlsbCBub3QgYSB3cml0ZQliOWE1MjgwZjBiNzViNjc2YmY2ZGI0NTVlNjQxMTJjMjlmMjc0ZGY1MDVhMjRhNDA1NDYyZDIxNDE4YmUwNWVjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlZGlyZWN0IGJlc2lkZSBhIGNoYW5uZWwtZnJlZSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTE3M2IyNGRhNmIxZmYyYjg5OTRiZDU5ZGY2N2I1M2U3ZDc3MjNkYzlhNzYwODNhNDllYTNhY2MxZjA3YjUyZTcKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdXNlZCB3cml0ZSBjaGFubmVsIGlzIGEgd3JpdGUgdG8gdGhlIGNsYXNzaWZpZXIgYW5kIHRoZSBndWFyZAk4MDJmNDU5MTcxNDdjNWExY2FkYzQ2YzQ3NzQ4ZTViMzdjMTMzZDM3YTg3ZDlmOGU5NDRmN2FlNGFiZDIwNGNkCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBrZWVwcyBldmVyeSBjYW5kaWRhdGUJNGNlNGE4ZWMyMGY1N2Y5MzgwZjY0NDhmOWM3ZTQ0N2Y0NDUyNTk5MjFlMGM5YTU1NjllZDE1ZTA5NjBjMmIwMgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBub3QgYSBjaGFuZ2VkIHBhdGgJMTNkZDg1N2JkNjYxYzMwM2RiZmRlNjc1ZDViZWI3ZWNjNjQ4MzBlYjM1ODljMTM4NzhmZDcxN2UyM2M3NmUzMQpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbnNpZGUgYSByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJZTY3ZDRjYjUyZjZmMTM4N2QyODM0N2QzMzk2M2QzY2YxNGI2ZDgwNDU1ZjE2NWI5ZmM5Njc4MDlkYzIxNWYxYgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gYXNzaWduZWQgcGF0aCB1c2VkIG9ubHkgYnkgcmVhZHMgaXMgbm90IGEgY2hhbmdlZCBwYXRoCWE4ZmZhNjUzMmY1ZmFmODM3YWFmNzdjYjA4ZTZjY2FkOTE5MDQ2ZDExMDM3ZjQwNTgwYzhiZTRkZmI0YzQxYjYKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggd3JpdHRlbiwgaGlkZGVuLCBleHBvcnRlZCBvciBuZXZlciByZWZlcmVuY2VkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTNkOWYzZmJmZTBhNDM5YWM2N2FhNThhMTQ0NWM4MWU5YzFmZDNmNDMyNDUyZWY1NWFlMTM4YmE3MDRlN2U2ZTkKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGVzY2FwZWQgcXVvdGUgZG9lcyBub3QgaGlkZSBhIHJlZGlyZWN0IHRhcmdldAk1MzU0YWIyMmU0NDFiZmU4NTc0MDMyNGFhZDE5ZWQ2YzgyMmMwZTQ3YjQ1ZjU3Nzc5YzRlMjM0ODhmODk4Mzk3CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIGluIGEgcmVhZCBvcGVyYW5kIGlzIHN0aWxsIGEgcmVhZAkyN2E5MzNjNWE0NmJlYTNhM2NhNTYzMTdjZjYyZmE1ZDg1ZDdjZWRkYTIxYTI1ZjA4OWY3OTBkZWU5MWFlNmVjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIG9yIG5ld2xpbmUgZG9lcyBub3QgaGlkZSBhIHdyaXRlCWFkN2U0NDhmZjAzMzRiMjBjNGViNWFmNzdhMWU5Mzk3NjAwOTAxZGVhYmRmMjAxOTFmOWNkZTliZTg0YmUxNjAKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGVzY2FwZWQgcmVkaXJlY3QgY2hhcmFjdGVyIGlzIG5vdCBhIHdyaXRlCTllYTlkMWFkMzMwZTljODc2NjhjYjJlNDE0MzRjNTcwZDQzYzRmNDczMDMwMTNlZTdkNWI2NDA2ZjI2YzEyYmQ
  ```
  ```
- 2026-09-17 · e31187e* · exit 0 · `set -o pipefail …` · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · ms:23654
- 2026-09-17 · e31187e* · exit 0 · `set -o pipefail …` · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · ms:23183
- 2026-09-17 · e31187e* · exit 0 · `set -o pipefail …` · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · ms:23264
- 2026-09-17 · e31187e* · exit 0 · `set -o pipefail …` · acceptance-sha256:343b58c0ce9652f44fb64e60a65e2268ee44d7e8e7745a0660bb7135f3a4c564 · ms:23344
