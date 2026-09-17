# Task ADR-059-T10: A continued redirect target keeps its path, and the quote strip stays as released

**Depends-on:** T7
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an escaped newline in the redirect-operand word scan`, `the released quote strip seeing an ANSI-C quoted redirect`, `the released quote strip seeing an escaped dev-null prefix`, `each named test actually running`

Added 2026-09-17. Tasks T8 (`1f823d0`) and T9 (`57b8182`) are reverted here. Each changed `withoutQuotedSegments` to honour a backslash, and each Codex review round (`gpt-6-astra`, high) found a new fail-open it introduced, measured against `e31187e`:
- **T8** erased an escape to a space, so `echo x > \./dev/null` read as a `/dev/null` redirect. It also let a quoted run continue across a backslash-newline, hiding the redirect in `echo "$(printf x > README.md)\` + newline + `"`.
- **T9** masked escapes with `__`, so `echo $'\'\'' >README.md ''` classified `neither`, recorded authorship `none`, and passed the reviewer guard. The same review saw `echo \" "$(printf x >README.md)"` lose its write too.

The owner chose on 2026-09-17 to return `withoutQuotedSegments` to its released form, the one in `v2.99.6`. `T=README.md; printf \" > "$T"` therefore stays unrecorded, as it was in every release (BACKLOG §228).

One part of T8 is kept. T7 matched an escape in `isRedirectOperand` as `\\.`, and `.` does not match a newline, so `T=README.md; printf x > "./\` + newline + `$T"` lost its path at `0dea421`, while its parent `8d45cec` returned it. That was a regression T7 introduced, and this task re-applies T8's fix for it: `\\[\s\S]`. Neither T8/T9 review found a problem in `isRedirectOperand`.

## Goal

`isRedirectOperand` treats a backslash and any next character, newline included, as part of a word. `withoutQuotedSegments` stays byte-for-byte as released, and four inputs the reverted attempts broke keep recording a write.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `isRedirectOperand` matches `\\[\s\S]` |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins the released strip and passes before the change; S3's mutants show it can fail.
2. [S2] Change both escape alternatives in `isRedirectOperand` from `\\.` to `\\[\s\S]`.
3. [S3] Run the fence green and record mutants: restore `\\.`; replace the strip with T9's masked form; replace it with T8's erasing form; rename a test so it selects nothing. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a continued redirect target keeps its path|the released quote strip still sees these writes)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a continued redirect target keeps its path' 'the released quote strip still sees these writes'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/classify.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a continued redirect target keeps its path` | `tests/read-only-arguments.test.mjs` | `T=README.md; printf x > "./\` + newline + `$T"` yields README.md | — | S1, S2 |
| `the released quote strip still sees these writes` | `tests/read-only-arguments.test.mjs` | `echo x > \./dev/null`, `echo "$(printf x > README.md)\` + newline + `"`, `echo $'\'\'' >README.md ''` and `echo \" "$(printf x >README.md)"` classify `mutation`, record authorship `bash`, and the reviewer guard refuses them (exit 2) | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `assignedNamesAWriterMayUse` calls `isRedirectOperand`; `isPotentialMutationCommand` calls `withoutQuotedSegments`; the tests reach both through `bashMarkdownMutationPaths`, `classifyCommand`, `analyzeTranscript` and the guard process; S3's mutants break each |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every commit and Stop advisory and every reviewer Bash call |

## Mutation Log
- 2026-09-17 · 57b8182* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the escape no longer matches a newline, so a continued redirect target drops README.md again · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · covers:an escaped newline in the redirect-operand word scan
- 2026-09-17 · 57b8182* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · T9's masked strip returns, so the ANSI-C quoted redirect to README.md is no write and passes the guard · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · covers:the released quote strip seeing an ANSI-C quoted redirect
- 2026-09-17 · 57b8182* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · T8's erasing strip returns, so echo x > \./dev/null reads as /dev/null and is no write · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · covers:the released quote strip seeing an escaped dev-null prefix
- 2026-09-17 · 57b8182* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · covers:each named test actually running

## Invariants

- `withoutQuotedSegments` is identical to `v2.99.6`'s.
- T5's and T7's cases keep their answers.

## Risks

- `printf \" > "$T"` and the other older gaps in BACKLOG §227 stay open.

## Stop Condition

Stop and ask if a `tests/classify.test.mjs` or `tests/reviewer-guard.test.mjs` case goes red.

## Out of Scope

- Making `withoutQuotedSegments` honour a backslash (deferred: docs/BACKLOG.md §228)

## Verification Log
- 2026-09-17 · 57b8182* · exit 1 · `set -o pipefail …` · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · ms:367 · test-lock-sha256:a8619d89c6415fe6b57c3e458067a1b99b1c8024ef4d958493a3d3c4e5429e7d · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjb250aW51ZWQgcmVkaXJlY3QgdGFyZ2V0IGtlZXBzIGl0cyBwYXRoCTY4NWQ4NjAzNTczY2Y1MTViODM3ZTUwNjJiZDFiZWEwMWJkYTM5MTViZTUxOTdkNjAyNzQ3ZmM1ZDM1MTdiMDEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFpbGVkIGNvbW1hbmQgdGhhdCBhbHNvIHdyaXRlcyBpcyBzdGlsbCBhIHdyaXRlCWI2MzE3YWUwY2U1MmZjMWMwN2Y5MDBhMDBiMmJkMGVlYjNjYzNlYjY1M2YyMDM2YmY4MTllZTk2ZWUzMTJkNDYKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFpbGVkIGNvbW1hbmQgd2l0aCBubyB3cml0ZSBpcyBzdGlsbCBubyB3cml0ZQk1MGE0M2UyOWY4ODVlN2ZlNzY3NDU0ZWQ0ZTQ3NjRiODkzYTI1MGQ3Zjk4NzA3Y2NiYWJhZWUxYWU5MzIzOGE4CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIGZhbWlseSB0aGF0IGNhbiB3cml0ZSBuYW1lcyBubyBjaGFuZ2VkIHBhdGggdW50aWwgaXQgdXNlcyB0aGF0IGNoYW5uZWwJOGQ2NmQwNzA5OTk5MDFkNTBhZmE4NzlmOGMwMTlhMGY2ZmQ4Yzk0ZDg2NDk3YjY0NjNhMmJmOTg0ZmIxNTAyYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWFkIHdpdGhvdXQgaXRzIGNoYW5uZWwgaXMgc3RpbGwgbm90IGEgd3JpdGUJYjlhNTI4MGYwYjc1YjY3NmJmNmRiNDU1ZTY0MTEyYzI5ZjI3NGRmNTA1YTI0YTQwNTQ2MmQyMTQxOGJlMDVlYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWRpcmVjdCBiZXNpZGUgYSBjaGFubmVsLWZyZWUgcmVhZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkxNzNiMjRkYTZiMWZmMmI4OTk0YmQ1OWRmNjdiNTNlN2Q3NzIzZGM5YTc2MDgzYTQ5ZWEzYWNjMWYwN2I1MmU3CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBpcyBhIHdyaXRlIHRvIHRoZSBjbGFzc2lmaWVyIGFuZCB0aGUgZ3VhcmQJODAyZjQ1OTE3MTQ3YzVhMWNhZGM0NmM0Nzc0OGU1YjM3YzEzM2QzN2E4N2Q5ZjhlOTQ0ZjdhZTRhYmQyMDRjZApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB1c2VkIHdyaXRlIGNoYW5uZWwga2VlcHMgZXZlcnkgY2FuZGlkYXRlCTRjZTRhOGVjMjBmNTdmOTM4MGY2NDQ4ZjljN2U0NDdmNDQ1MjU5OTIxZTBjOWE1NTY5ZWQxNWUwOTYwYzJiMDIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdmFyaWFibGUgaW4gYSByZWFkIG9wZXJhbmQgaXMgc3RpbGwgbm90IGEgY2hhbmdlZCBwYXRoCTEzZGQ4NTdiZDY2MWMzMDNkYmZkZTY3NWQ1YmViN2VjYzY0ODMwZWIzNTg5YzEzODc4ZmQ3MTdlMjNjNzZlMzEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdmFyaWFibGUgaW5zaWRlIGEgcmVkaXJlY3QgdGFyZ2V0IGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWU2N2Q0Y2I1MmY2ZjEzODdkMjgzNDdkMzM5NjNkM2NmMTRiNmQ4MDQ1NWYxNjViOWZjOTY3ODA5ZGMyMTVmMWIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggdXNlZCBvbmx5IGJ5IHJlYWRzIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAlhOGZmYTY1MzJmNWZhZjgzN2FhZjc3Y2IwOGU2Y2NhZDkxOTA0NmQxMTAzN2Y0MDU4MGM4YmU0ZGZiNGM0MWI2CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBhc3NpZ25lZCBwYXRoIHdyaXR0ZW4sIGhpZGRlbiwgZXhwb3J0ZWQgb3IgbmV2ZXIgcmVmZXJlbmNlZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkzZDlmM2ZiZmUwYTQzOWFjNjdhYTU4YTE0NDVjODFlOWMxZmQzZjQzMjQ1MmVmNTVhZTEzOGJhNzA0ZTdlNmU5CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIGRvZXMgbm90IGhpZGUgYSByZWRpcmVjdCB0YXJnZXQJNTM1NGFiMjJlNDQxYmZlODU3NDAzMjRhYWQxOWVkNmM4MjJjMGU0N2I0NWY1Nzc3OWM0ZTIzNDg4Zjg5ODM5Nwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gZXNjYXBlZCBxdW90ZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBhIHJlYWQJMjdhOTMzYzVhNDZiZWEzYTNjYTU2MzE3Y2Y2MmZhNWQ4NWQ3Y2VkZGEyMWEyNWYwODlmNzkwZGVlOTFhZTZlYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJdGhlIHJlbGVhc2VkIHF1b3RlIHN0cmlwIHN0aWxsIHNlZXMgdGhlc2Ugd3JpdGVzCTIyNWE5YzcyNGM0N2U1ZjliYTA1YzVlZjM5ZWRhY2IzOTA0YWM3OTc5MTY4ZjMxYjEwNTU1NWNiMDQwZmExOTM
  ```
  ```
- 2026-09-17 · 57b8182* · exit 0 · `set -o pipefail …` · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · ms:33885
- 2026-09-17 · 57b8182* · exit 0 · `set -o pipefail …` · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · ms:27013
- 2026-09-17 · 57b8182* · exit 0 · `set -o pipefail …` · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · ms:27349
- 2026-09-17 · 57b8182* · exit 0 · `set -o pipefail …` · acceptance-sha256:df344a4f249c442fc5adc98bc7a321d03fd9b5c0d69affe21f25499e42f96e71 · ms:29882
