# Task ADR-059-T7: An escaped quote does not hide a redirect target

**Depends-on:** T6
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a backslash escape in the redirect-operand word scan`, `a backslash escape in the single-quote strip`, `an escaped quote in a read operand staying a read`, `each named test actually running`

Added 2026-09-17 from a Codex re-review (`gpt-6-astra`, xhigh) of ADR-058 T7 and ADR-059 T4/T5, P2 and a fail-open. `T=README.md; printf \" > "$T"` writes README.md, but `bashMarkdownMutationPaths` returned it at T3 and returns nothing at `a7c5e57`. T5's `isRedirectOperand` reads `\"` as an opening quote, so the quoted run swallows the `>`.

Measured 2026-09-17 at `9cf862f`, each command run in `bash -c` against a scratch repository:
- `T=docs/a.md; printf "\"" > "$T"` writes `"` into docs/a.md, and the path is dropped the same way.
- `T=docs/a.md; printf "$T" \' > "$T"` writes docs/a.md, and the path is dropped because `withoutSingleQuoted` reads `\'` as an opening single quote and strips the redirect.

Class: a quote scanner that does not treat a backslash as an escape. `grep -n 'quote === \|"\[^"\]\*"' plugin/scripts/lifecycle.mjs` lists the scanners at lines 364, 414, 475 and 1349, plus the word pattern in `isRedirectOperand`. The scanners at 360, 410 and 483 already honour a backslash outside single quotes. The two ADR-059 added, `withoutSingleQuoted` and `isRedirectOperand`, do not; they are the members fixed here.

## Goal

Outside single quotes, a backslash escapes the next character in `withoutSingleQuoted` and in `isRedirectOperand`'s word scan, as the shell does. An escaped quote no longer opens a quoted run, so the redirect after it is seen.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `withoutSingleQuoted` and `isRedirectOperand` honour a backslash escape |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins escaped quotes in read operands and passes before the change; S3's mutants show it can fail.
2. [S2] In `withoutSingleQuoted`, keep a backslash and the character after it without changing the quote state, outside single quotes. In `isRedirectOperand`, match `\\.` as a word part, and let a double-quoted run contain escaped characters.
3. [S3] Run the fence green and record mutants: restore the escape-blind word pattern; restore the escape-blind single-quote strip; let an escape swallow the rest of the text; rename a test so it selects nothing. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(an escaped quote does not hide a redirect target|an escaped quote in a read operand is still a read)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'an escaped quote does not hide a redirect target' 'an escaped quote in a read operand is still a read'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an escaped quote does not hide a redirect target` | `tests/read-only-arguments.test.mjs` | `T=README.md; printf \" > "$T"`, `T=docs/a.md; printf "\"" > "$T"` and `T=docs/a.md; printf "$T" \' > "$T"` yield the assigned path | — | S1, S2 |
| `an escaped quote in a read operand is still a read` | `tests/read-only-arguments.test.mjs` | `T=docs/a.md; cat \" "$T" > notes.md` and `T=docs/a.md; cat "\"" "$T" > notes.md` do not yield docs/a.md | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `bashMarkdownMutationPaths` asks `assignedNamesAWriterMayUse`, which calls both helpers; S3's mutants break each |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | commit and Stop advisories for commands that write through a variable |

## Mutation Log
- 2026-09-17 · 26efafe* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the escape-blind word pattern returns, so printf \" > "$T" drops README.md again · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · covers:a backslash escape in the redirect-operand word scan
- 2026-09-17 · 26efafe* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the single-quote strip ignores escapes again, so \' hides the redirect in printf "$T" \' > "$T" · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · covers:a backslash escape in the single-quote strip
- 2026-09-17 · 26efafe* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an escaped quote before a read operand counts as a redirect, so cat \" "$T" > notes.md names docs/a.md · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · covers:an escaped quote in a read operand staying a read
- 2026-09-17 · 26efafe* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · covers:each named test actually running

## Invariants

- T3's and T5's kept and dropped cases keep their answers.

## Risks

- `$'…'` ANSI-C quoting is not modelled; a reference inside it is treated as unquoted text, which errs toward keeping the path.

## Stop Condition

Stop and ask if a `tests/lifecycle.test.mjs` assignment case goes red.

## Out of Scope

- The other shell scanners in `lifecycle.mjs` (permanent: boundary: they already honour a backslash, per the sweep above)

## Verification Log
- 2026-09-17 · 26efafe* · exit 1 · `set -o pipefail …` · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · ms:108 · test-lock-sha256:3d194e6370accf5554d71eab78da5d22bc48b8aa0c0e3eb6ef4a8ee90b8fbf6d · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB0aGF0IGFsc28gd3JpdGVzIGlzIHN0aWxsIGEgd3JpdGUJYjYzMTdhZTBjZTUyZmMxYzA3ZjkwMGEwMGIyYmQwZWViM2NjM2ViNjUzZjIwMzZiZjgxOWVlOTZlZTMxMmQ0Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB3aXRoIG5vIHdyaXRlIGlzIHN0aWxsIG5vIHdyaXRlCTUwYTQzZTI5Zjg4NWU3ZmU3Njc0NTRlZDRlNDc2NGI4OTNhMjUwZDdmOTg3MDdjY2JhYmFlZTFhZTkzMjM4YTgKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFtaWx5IHRoYXQgY2FuIHdyaXRlIG5hbWVzIG5vIGNoYW5nZWQgcGF0aCB1bnRpbCBpdCB1c2VzIHRoYXQgY2hhbm5lbAk4ZDY2ZDA3MDk5OTkwMWQ1MGFmYTg3OWY4YzAxOWEwZjZmZDhjOTRkODY0OTdiNjQ2M2EyYmY5ODRmYjE1MDJjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlYWQgd2l0aG91dCBpdHMgY2hhbm5lbCBpcyBzdGlsbCBub3QgYSB3cml0ZQliOWE1MjgwZjBiNzViNjc2YmY2ZGI0NTVlNjQxMTJjMjlmMjc0ZGY1MDVhMjRhNDA1NDYyZDIxNDE4YmUwNWVjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlZGlyZWN0IGJlc2lkZSBhIGNoYW5uZWwtZnJlZSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTE3M2IyNGRhNmIxZmYyYjg5OTRiZDU5ZGY2N2I1M2U3ZDc3MjNkYzlhNzYwODNhNDllYTNhY2MxZjA3YjUyZTcKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdXNlZCB3cml0ZSBjaGFubmVsIGlzIGEgd3JpdGUgdG8gdGhlIGNsYXNzaWZpZXIgYW5kIHRoZSBndWFyZAk4MDJmNDU5MTcxNDdjNWExY2FkYzQ2YzQ3NzQ4ZTViMzdjMTMzZDM3YTg3ZDlmOGU5NDRmN2FlNGFiZDIwNGNkCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBrZWVwcyBldmVyeSBjYW5kaWRhdGUJNGNlNGE4ZWMyMGY1N2Y5MzgwZjY0NDhmOWM3ZTQ0N2Y0NDUyNTk5MjFlMGM5YTU1NjllZDE1ZTA5NjBjMmIwMgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBub3QgYSBjaGFuZ2VkIHBhdGgJMTNkZDg1N2JkNjYxYzMwM2RiZmRlNjc1ZDViZWI3ZWNjNjQ4MzBlYjM1ODljMTM4NzhmZDcxN2UyM2M3NmUzMQpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbnNpZGUgYSByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJZTY3ZDRjYjUyZjZmMTM4N2QyODM0N2QzMzk2M2QzY2YxNGI2ZDgwNDU1ZjE2NWI5ZmM5Njc4MDlkYzIxNWYxYgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gYXNzaWduZWQgcGF0aCB1c2VkIG9ubHkgYnkgcmVhZHMgaXMgbm90IGEgY2hhbmdlZCBwYXRoCWE4ZmZhNjUzMmY1ZmFmODM3YWFmNzdjYjA4ZTZjY2FkOTE5MDQ2ZDExMDM3ZjQwNTgwYzhiZTRkZmI0YzQxYjYKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggd3JpdHRlbiwgaGlkZGVuLCBleHBvcnRlZCBvciBuZXZlciByZWZlcmVuY2VkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTNkOWYzZmJmZTBhNDM5YWM2N2FhNThhMTQ0NWM4MWU5YzFmZDNmNDMyNDUyZWY1NWFlMTM4YmE3MDRlN2U2ZTkKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGVzY2FwZWQgcXVvdGUgZG9lcyBub3QgaGlkZSBhIHJlZGlyZWN0IHRhcmdldAk1MzU0YWIyMmU0NDFiZmU4NTc0MDMyNGFhZDE5ZWQ2YzgyMmMwZTQ3YjQ1ZjU3Nzc5YzRlMjM0ODhmODk4Mzk3CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIGluIGEgcmVhZCBvcGVyYW5kIGlzIHN0aWxsIGEgcmVhZAkyN2E5MzNjNWE0NmJlYTNhM2NhNTYzMTdjZjYyZmE1ZDg1ZDdjZWRkYTIxYTI1ZjA4OWY3OTBkZWU5MWFlNmVj
  ```
  ```
- 2026-09-17 · 26efafe* · exit 0 · `set -o pipefail …` · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · ms:25044
- 2026-09-17 · 26efafe* · exit 0 · `set -o pipefail …` · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · ms:32642
- 2026-09-17 · 26efafe* · exit 0 · `set -o pipefail …` · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · ms:29346
- 2026-09-17 · 26efafe* · exit 0 · `set -o pipefail …` · acceptance-sha256:a47c28e269a37e39abd07644b4d6da4a3b9763366cd2bdd09e0e8ead76647248 · ms:28172
