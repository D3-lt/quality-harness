# Task ADR-059-T5: A variable inside a redirect target is still a changed path

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the redirect-operand test in the reference scan`, `a read operand staying a read`, `each named test actually running`, `the regression suites that pin path extraction`

Added 2026-09-17 from a Codex review (`gpt-6-astra`, xhigh) of `e813f0a...ecd7852`. T3 counted a reference as a write only when `>` or `>> "` came immediately before `$NAME`. So `T=README.md; printf x > "./$T"` returned `README.md` at `e813f0a` and nothing at `2c69766`, although the command writes README.md.

## Goal

A reference to an assigned name marks it written when the shell word containing the reference is the operand of a `>`/`>>` redirect, whatever that word holds before the reference (`./`, a directory variable, quotes).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `assignedNamesAWriterMayUse` asks `isRedirectOperand(text, at)` instead of testing the text right before the reference |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins read operands and passes before the change; S3's mutants show it can fail.
2. [S2] Add `isRedirectOperand(text, at)`: find the shell word (quoted runs included) that spans `at`, and test whether the text before that word ends in `>` and optional spaces.
3. [S3] Run the fence green and record mutants: restore the old immediate-prefix test; treat any `>` earlier in the segment as a redirect; make the helper always false. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a variable inside a redirect target is still a changed path|a variable in a read operand is still not a changed path)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a variable inside a redirect target is still a changed path' 'a variable in a read operand is still not a changed path'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a variable inside a redirect target is still a changed path` | `tests/read-only-arguments.test.mjs` | `T=README.md; printf x > "./$T"`, `T=docs/a.md; cat notes.md > ./"$T"`, `T=docs/a.md; cat notes.md >> "./docs/../$T"` and `T="docs/my notes.md"; echo x > "./$T"` still yield the assigned path | — | S1, S2 |
| `a variable in a read operand is still not a changed path` | `tests/read-only-arguments.test.mjs` | `T=docs/a.md; cat "./$T" > notes.md; touch b.log`, `T=docs/a.md; head -2 ./"$T" >> README.md` and `T=docs/a.md; cat notes.md >README.md "./$T"` classify `mutation` and do not yield the assigned path | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `bashMarkdownMutationPaths` asks `assignedNamesAWriterMayUse` for every assigned `.md` value; S3's mutants break the operand test |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | commit and Stop advisories for commands that write through a variable |

## Mutation Log
- 2026-09-17 · dbd9979* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the immediate-prefix test returns, so > "./$T" is dropped again · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · covers:the redirect-operand test in the reference scan
- 2026-09-17 · dbd9979* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · no reference is ever a redirect operand, so echo x > "./$T" is dropped · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · covers:the redirect-operand test in the reference scan
- 2026-09-17 · dbd9979* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · any earlier > counts, so cat notes.md >README.md "./$T" marks the read as a write · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · covers:a read operand staying a read
- 2026-09-17 · dbd9979* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · covers:each named test actually running
- 2026-09-17 · dbd9979* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a git revision under a used channel resolves as a changed path; the pin in tests/advice-accuracy.test.mjs kills it · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · covers:the regression suites that pin path extraction

## Invariants

- T3's kept and dropped cases keep their answers; `tests/read-only-arguments.test.mjs` runs whole in the fence's named tests' file.

## Risks

- A redirect written as `>file` directly followed by the reference in another word (`>out "$T"`) is not an operand of that redirect and stays a read, as the shell treats it.

## Stop Condition

Stop and ask if a `tests/lifecycle.test.mjs` assignment case goes red.

## Out of Scope

- `tee`, `cp` and other writers that take the variable as an argument rather than a redirect; T3 already marks their segments as writes (permanent: boundary: a non-reading segment marks every reference written)

## Verification Log
- 2026-09-17 · dbd9979* · exit 1 · `set -o pipefail …` · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · ms:278 · test-lock-sha256:6ca452d92dd6948d69f2bd6db207abd9107f94377bd28706af405bf432287244 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYW1pbHkgdGhhdCBjYW4gd3JpdGUgbmFtZXMgbm8gY2hhbmdlZCBwYXRoIHVudGlsIGl0IHVzZXMgdGhhdCBjaGFubmVsCThkNjZkMDcwOTk5OTAxZDUwYWZhODc5ZjhjMDE5YTBmNmZkOGM5NGQ4NjQ5N2I2NDYzYTJiZjk4NGZiMTUwMmMKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgcmVhZCB3aXRob3V0IGl0cyBjaGFubmVsIGlzIHN0aWxsIG5vdCBhIHdyaXRlCWI5YTUyODBmMGI3NWI2NzZiZjZkYjQ1NWU2NDExMmMyOWYyNzRkZjUwNWEyNGE0MDU0NjJkMjE0MThiZTA1ZWMKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgcmVkaXJlY3QgYmVzaWRlIGEgY2hhbm5lbC1mcmVlIHJlYWQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJMTczYjI0ZGE2YjFmZjJiODk5NGJkNTlkZjY3YjUzZTdkNzcyM2RjOWE3NjA4M2E0OWVhM2FjYzFmMDdiNTJlNwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB1c2VkIHdyaXRlIGNoYW5uZWwgaXMgYSB3cml0ZSB0byB0aGUgY2xhc3NpZmllciBhbmQgdGhlIGd1YXJkCTgwMmY0NTkxNzE0N2M1YTFjYWRjNDZjNDc3NDhlNWIzN2MxMzNkMzdhODdkOWY4ZTk0NGY3YWU0YWJkMjA0Y2QKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdXNlZCB3cml0ZSBjaGFubmVsIGtlZXBzIGV2ZXJ5IGNhbmRpZGF0ZQk0Y2U0YThlYzIwZjU3ZjkzODBmNjQ0OGY5YzdlNDQ3ZjQ0NTI1OTkyMWUwYzlhNTU2OWVkMTVlMDk2MGMyYjAyCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHZhcmlhYmxlIGluIGEgcmVhZCBvcGVyYW5kIGlzIHN0aWxsIG5vdCBhIGNoYW5nZWQgcGF0aAkxM2RkODU3YmQ2NjFjMzAzZGJmZGU2NzVkNWJlYjdlY2M2NDgzMGViMzU4OWMxMzg3OGZkNzE3ZTIzYzc2ZTMxCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHZhcmlhYmxlIGluc2lkZSBhIHJlZGlyZWN0IHRhcmdldCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAllNjdkNGNiNTJmNmYxMzg3ZDI4MzQ3ZDMzOTYzZDNjZjE0YjZkODA0NTVmMTY1YjlmYzk2NzgwOWRjMjE1ZjFiCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBhc3NpZ25lZCBwYXRoIHVzZWQgb25seSBieSByZWFkcyBpcyBub3QgYSBjaGFuZ2VkIHBhdGgJYThmZmE2NTMyZjVmYWY4MzdhYWY3N2NiMDhlNmNjYWQ5MTkwNDZkMTEwMzdmNDA1ODBjOGJlNGRmYjRjNDFiNgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gYXNzaWduZWQgcGF0aCB3cml0dGVuLCBoaWRkZW4sIGV4cG9ydGVkIG9yIG5ldmVyIHJlZmVyZW5jZWQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJM2Q5ZjNmYmZlMGE0MzlhYzY3YWE1OGExNDQ1YzgxZTljMWZkM2Y0MzI0NTJlZjU1YWUxMzhiYTcwNGU3ZTZlOQ
  ```
  ```
- 2026-09-17 · dbd9979* · exit 0 · `set -o pipefail …` · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · ms:29193
- 2026-09-17 · dbd9979* · exit 0 · `set -o pipefail …` · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · ms:29286
- 2026-09-17 · dbd9979* · exit 0 · `set -o pipefail …` · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · ms:27199
- 2026-09-17 · dbd9979* · exit 0 · `set -o pipefail …` · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · ms:31950
- 2026-09-17 · dbd9979* · exit 0 · `set -o pipefail …` · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · ms:26531
- 2026-09-17 · 4850fa0* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · ms:0 · test-lock-sha256:4f71a7e1646d52be08499c42b3b003d245bd9b2bb8f72ab7df62127d09fa7ae1 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjb250aW51ZWQgcmVkaXJlY3QgdGFyZ2V0IGtlZXBzIGl0cyBwYXRoCTY4NWQ4NjAzNTczY2Y1MTViODM3ZTUwNjJiZDFiZWEwMWJkYTM5MTViZTUxOTdkNjAyNzQ3ZmM1ZDM1MTdiMDEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFpbGVkIGNvbW1hbmQgdGhhdCBhbHNvIHdyaXRlcyBpcyBzdGlsbCBhIHdyaXRlCWI2MzE3YWUwY2U1MmZjMWMwN2Y5MDBhMDBiMmJkMGVlYjNjYzNlYjY1M2YyMDM2YmY4MTllZTk2ZWUzMTJkNDYKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFpbGVkIGNvbW1hbmQgd2l0aCBubyB3cml0ZSBpcyBzdGlsbCBubyB3cml0ZQk1MGE0M2UyOWY4ODVlN2ZlNzY3NDU0ZWQ0ZTQ3NjRiODkzYTI1MGQ3Zjk4NzA3Y2NiYWJhZWUxYWU5MzIzOGE4CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIGZhbWlseSB0aGF0IGNhbiB3cml0ZSBuYW1lcyBubyBjaGFuZ2VkIHBhdGggdW50aWwgaXQgdXNlcyB0aGF0IGNoYW5uZWwJOGQ2NmQwNzA5OTk5MDFkNTBhZmE4NzlmOGMwMTlhMGY2ZmQ4Yzk0ZDg2NDk3YjY0NjNhMmJmOTg0ZmIxNTAyYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWFkIHdpdGhvdXQgaXRzIGNoYW5uZWwgaXMgc3RpbGwgbm90IGEgd3JpdGUJYjlhNTI4MGYwYjc1YjY3NmJmNmRiNDU1ZTY0MTEyYzI5ZjI3NGRmNTA1YTI0YTQwNTQ2MmQyMTQxOGJlMDVlYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWRpcmVjdCBiZXNpZGUgYSBjaGFubmVsLWZyZWUgcmVhZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkxNzNiMjRkYTZiMWZmMmI4OTk0YmQ1OWRmNjdiNTNlN2Q3NzIzZGM5YTc2MDgzYTQ5ZWEzYWNjMWYwN2I1MmU3CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBpcyBhIHdyaXRlIHRvIHRoZSBjbGFzc2lmaWVyIGFuZCB0aGUgZ3VhcmQJNTE4NDJlZDZiNmI0YWE1M2Y0OTE2MDcyNGMyYTIxNjgxNWEzM2EwNzM5ODY2YzVmZWM3YWFlZWMwMjJmMWQyZgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB1c2VkIHdyaXRlIGNoYW5uZWwga2VlcHMgZXZlcnkgY2FuZGlkYXRlCTRjZTRhOGVjMjBmNTdmOTM4MGY2NDQ4ZjljN2U0NDdmNDQ1MjU5OTIxZTBjOWE1NTY5ZWQxNWUwOTYwYzJiMDIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdmFyaWFibGUgaW4gYSByZWFkIG9wZXJhbmQgaXMgc3RpbGwgbm90IGEgY2hhbmdlZCBwYXRoCTEzZGQ4NTdiZDY2MWMzMDNkYmZkZTY3NWQ1YmViN2VjYzY0ODMwZWIzNTg5YzEzODc4ZmQ3MTdlMjNjNzZlMzEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdmFyaWFibGUgaW5zaWRlIGEgcmVkaXJlY3QgdGFyZ2V0IGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWU2N2Q0Y2I1MmY2ZjEzODdkMjgzNDdkMzM5NjNkM2NmMTRiNmQ4MDQ1NWYxNjViOWZjOTY3ODA5ZGMyMTVmMWIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggdXNlZCBvbmx5IGJ5IHJlYWRzIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAlhOGZmYTY1MzJmNWZhZjgzN2FhZjc3Y2IwOGU2Y2NhZDkxOTA0NmQxMTAzN2Y0MDU4MGM4YmU0ZGZiNGM0MWI2CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBhc3NpZ25lZCBwYXRoIHdyaXR0ZW4sIGhpZGRlbiwgZXhwb3J0ZWQgb3IgbmV2ZXIgcmVmZXJlbmNlZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkzZDlmM2ZiZmUwYTQzOWFjNjdhYTU4YTE0NDVjODFlOWMxZmQzZjQzMjQ1MmVmNTVhZTEzOGJhNzA0ZTdlNmU5CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIGRvZXMgbm90IGhpZGUgYSByZWRpcmVjdCB0YXJnZXQJNTM1NGFiMjJlNDQxYmZlODU3NDAzMjRhYWQxOWVkNmM4MjJjMGU0N2I0NWY1Nzc3OWM0ZTIzNDg4Zjg5ODM5Nwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gZXNjYXBlZCBxdW90ZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBhIHJlYWQJMjdhOTMzYzVhNDZiZWEzYTNjYTU2MzE3Y2Y2MmZhNWQ4NWQ3Y2VkZGEyMWEyNWYwODlmNzkwZGVlOTFhZTZlYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJdGhlIHJlbGVhc2VkIHF1b3RlIHN0cmlwIHN0aWxsIHNlZXMgdGhlc2Ugd3JpdGVzCTYxZTRkOWMyYWYwMDkyYzJmYmVjNmVlNWY4MTNmMTdjZmQwNzllZTlmZWMzY2E5YzkzYzZjNjQ5MWY0NWYyZTA · test-lock-kind:replace
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:29da128775f9ae0562f778729d6fa5807f81db0990f6d4477dd53b9ca3201a65 · ms:26219
