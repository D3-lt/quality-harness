# Task ADR-059-T6: A failed command that also writes is still a write

**Depends-on:** T5
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a failed unrecognised command's definite write in the transcript`, `a failed command with no write staying no write`, `each named test actually running`, `the regression suites that pin transcript authorship`

Added 2026-09-17 from a Codex re-review (`gpt-6-astra`, xhigh) of ADR-058 T7 and ADR-059 T4/T5, P1 and a fail-open. With a failed tool result, `printf x > plugin/scripts/classify-command.mjs; rg --pre false x README.md` classified `unrecognised` at `a7c5e57` (T4 made `rg --pre` a program channel). `analyzeTranscript` records a failed `unrecognised` call as authorship `none`, so the overwrite left no pending write and the commit advisory was silent. Before T4 the same command classified `mutation` and warned.

The class is wider than T4. Measured 2026-09-17 at `9cf862f`: `printf x > a.js; mytool --flag` and `printf x > a.js; pwsh -Command ls` also classify `unrecognised` and record `none` when they fail. `classifyCommand` returns `unrecognised` before its mutation check at five places (`grep -n "return 'unrecognised'\|return inner" plugin/scripts/classify-command.mjs`: lines 50, 63, 68, 86, 95, 101). Its consumers are listed by `grep -n "classifyCommand(" plugin/scripts/*.mjs`:
- `lifecycle.mjs:2322` returns false for `unrecognised`, which is the safe side;
- `lifecycle.mjs:2498` asks only whether the command is a validation;
- `lifecycle.mjs:4574` (the reviewer guard) refuses `unrecognised`;
- `lifecycle.mjs:2452` (`analyzeTranscript`) is the one that drops the write.

So the fix is in `analyzeTranscript`, not in the classifier, whose `unrecognised` keeps the guard closed.

## Goal

A failed Bash call classified `unrecognised` records a write when `isPotentialMutationCommand` finds one, as a `mutation` does. A failed `unrecognised` call with no detectable write still records nothing, and a successful one stays UNPROVEN (ADR-047).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `analyzeTranscript` treats a failed `unrecognised` call with a detectable write as a Bash mutation |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins failed reads and passes before the change; S3's mutants show it can fail.
2. [S2] In `analyzeTranscript`, extend the Bash mutation branch to a failed `unrecognised` call for which `isPotentialMutationCommand(command)` is true.
3. [S3] Run the fence green and record mutants: drop the new clause; drop the `isPotentialMutationCommand` condition, so every failed `unrecognised` call is a write. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a failed command that also writes is still a write|a failed command with no write is still no write)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a failed command that also writes is still a write' 'a failed command with no write is still no write'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a failed command that also writes is still a write` | `tests/read-only-arguments.test.mjs` | In a git repository with a check, each of `printf x > a.js; rg --pre false x README.md`, `printf x > a.js; sort --compress-program=gzip README.md`, `printf x > a.js; git grep -O x`, `printf x > a.js; mytool --flag` and `printf x > a.js && bash -c "rg --pre false x notes.txt"`, with a failed result, gives authorship `bash`; the PreToolUse hook for `git commit -m test`, run as a process, warns that it would publish unchecked | — | S1, S2 |
| `a failed command with no write is still no write` | `tests/read-only-arguments.test.mjs` | `rg --pre false x README.md`, `pwsh -Command ls` and `mytool --flag`, with a failed result, give authorship `none`, and the same PreToolUse hook does not warn | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | the PreToolUse hook reads the transcript through `analyzeTranscript`; the tests run it as a process; S3's mutants break the clause |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | commit and Stop advisories after a failed command that wrote |

## Mutation Log
- 2026-09-17 · 9cf862f* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a failed unrecognised call records no write again, so printf x > a.js; rg --pre false x README.md is silent · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · covers:a failed unrecognised command's definite write in the transcript
- 2026-09-17 · 9cf862f* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · every failed unrecognised call is a write, so a failed rg --pre false x README.md alone warns · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · covers:a failed command with no write staying no write
- 2026-09-17 · 9cf862f* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · scratch writes under the temp root become repository edits; tests/lifecycle.test.mjs pins the exemption in the authorship branch · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · covers:the regression suites that pin transcript authorship
- 2026-09-17 · 9cf862f* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · covers:each named test actually running

## Invariants

- `classifyCommand` is unchanged, so the reviewer guard still refuses `unrecognised` commands.
- A successful `unrecognised` call still records UNPROVEN authorship.

## Risks

- A failed foreign-shell command whose text looks mutating (`pwsh -Command "rm x"`) now records a Bash write. That is the safe side: it asks for a check a failed command may not have needed.

## Stop Condition

Stop and ask if a `tests/lifecycle.test.mjs` authorship case goes red.

## Out of Scope

- Recording the definite write of a successful `unrecognised` call as Bash authorship instead of UNPROVEN (permanent: boundary: UNPROVEN already makes the advisory speak, and ADR-060 replaces this path)

## Verification Log
- 2026-09-17 · 9cf862f* · exit 1 · `set -o pipefail …` · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · ms:289 · test-lock-sha256:f1f21aa688a17c85e85eed60b9841f726a9b6f6175dd4c6c424ec02b4f4043f3 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB0aGF0IGFsc28gd3JpdGVzIGlzIHN0aWxsIGEgd3JpdGUJYjYzMTdhZTBjZTUyZmMxYzA3ZjkwMGEwMGIyYmQwZWViM2NjM2ViNjUzZjIwMzZiZjgxOWVlOTZlZTMxMmQ0Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB3aXRoIG5vIHdyaXRlIGlzIHN0aWxsIG5vIHdyaXRlCTUwYTQzZTI5Zjg4NWU3ZmU3Njc0NTRlZDRlNDc2NGI4OTNhMjUwZDdmOTg3MDdjY2JhYmFlZTFhZTkzMjM4YTgKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFtaWx5IHRoYXQgY2FuIHdyaXRlIG5hbWVzIG5vIGNoYW5nZWQgcGF0aCB1bnRpbCBpdCB1c2VzIHRoYXQgY2hhbm5lbAk4ZDY2ZDA3MDk5OTkwMWQ1MGFmYTg3OWY4YzAxOWEwZjZmZDhjOTRkODY0OTdiNjQ2M2EyYmY5ODRmYjE1MDJjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlYWQgd2l0aG91dCBpdHMgY2hhbm5lbCBpcyBzdGlsbCBub3QgYSB3cml0ZQliOWE1MjgwZjBiNzViNjc2YmY2ZGI0NTVlNjQxMTJjMjlmMjc0ZGY1MDVhMjRhNDA1NDYyZDIxNDE4YmUwNWVjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlZGlyZWN0IGJlc2lkZSBhIGNoYW5uZWwtZnJlZSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTE3M2IyNGRhNmIxZmYyYjg5OTRiZDU5ZGY2N2I1M2U3ZDc3MjNkYzlhNzYwODNhNDllYTNhY2MxZjA3YjUyZTcKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdXNlZCB3cml0ZSBjaGFubmVsIGlzIGEgd3JpdGUgdG8gdGhlIGNsYXNzaWZpZXIgYW5kIHRoZSBndWFyZAk4MDJmNDU5MTcxNDdjNWExY2FkYzQ2YzQ3NzQ4ZTViMzdjMTMzZDM3YTg3ZDlmOGU5NDRmN2FlNGFiZDIwNGNkCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBrZWVwcyBldmVyeSBjYW5kaWRhdGUJNGNlNGE4ZWMyMGY1N2Y5MzgwZjY0NDhmOWM3ZTQ0N2Y0NDUyNTk5MjFlMGM5YTU1NjllZDE1ZTA5NjBjMmIwMgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBub3QgYSBjaGFuZ2VkIHBhdGgJMTNkZDg1N2JkNjYxYzMwM2RiZmRlNjc1ZDViZWI3ZWNjNjQ4MzBlYjM1ODljMTM4NzhmZDcxN2UyM2M3NmUzMQpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbnNpZGUgYSByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJZTY3ZDRjYjUyZjZmMTM4N2QyODM0N2QzMzk2M2QzY2YxNGI2ZDgwNDU1ZjE2NWI5ZmM5Njc4MDlkYzIxNWYxYgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gYXNzaWduZWQgcGF0aCB1c2VkIG9ubHkgYnkgcmVhZHMgaXMgbm90IGEgY2hhbmdlZCBwYXRoCWE4ZmZhNjUzMmY1ZmFmODM3YWFmNzdjYjA4ZTZjY2FkOTE5MDQ2ZDExMDM3ZjQwNTgwYzhiZTRkZmI0YzQxYjYKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggd3JpdHRlbiwgaGlkZGVuLCBleHBvcnRlZCBvciBuZXZlciByZWZlcmVuY2VkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTNkOWYzZmJmZTBhNDM5YWM2N2FhNThhMTQ0NWM4MWU5YzFmZDNmNDMyNDUyZWY1NWFlMTM4YmE3MDRlN2U2ZTk
  ```
  ```
- 2026-09-17 · 9cf862f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · ms:32133
- 2026-09-17 · 9cf862f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · ms:33597
- 2026-09-17 · 9cf862f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · ms:27894
- 2026-09-17 · 9cf862f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · ms:26594
- 2026-09-17 · 4850fa0* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · ms:0 · test-lock-sha256:4f71a7e1646d52be08499c42b3b003d245bd9b2bb8f72ab7df62127d09fa7ae1 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjb250aW51ZWQgcmVkaXJlY3QgdGFyZ2V0IGtlZXBzIGl0cyBwYXRoCTY4NWQ4NjAzNTczY2Y1MTViODM3ZTUwNjJiZDFiZWEwMWJkYTM5MTViZTUxOTdkNjAyNzQ3ZmM1ZDM1MTdiMDEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFpbGVkIGNvbW1hbmQgdGhhdCBhbHNvIHdyaXRlcyBpcyBzdGlsbCBhIHdyaXRlCWI2MzE3YWUwY2U1MmZjMWMwN2Y5MDBhMDBiMmJkMGVlYjNjYzNlYjY1M2YyMDM2YmY4MTllZTk2ZWUzMTJkNDYKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFpbGVkIGNvbW1hbmQgd2l0aCBubyB3cml0ZSBpcyBzdGlsbCBubyB3cml0ZQk1MGE0M2UyOWY4ODVlN2ZlNzY3NDU0ZWQ0ZTQ3NjRiODkzYTI1MGQ3Zjk4NzA3Y2NiYWJhZWUxYWU5MzIzOGE4CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIGZhbWlseSB0aGF0IGNhbiB3cml0ZSBuYW1lcyBubyBjaGFuZ2VkIHBhdGggdW50aWwgaXQgdXNlcyB0aGF0IGNoYW5uZWwJOGQ2NmQwNzA5OTk5MDFkNTBhZmE4NzlmOGMwMTlhMGY2ZmQ4Yzk0ZDg2NDk3YjY0NjNhMmJmOTg0ZmIxNTAyYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWFkIHdpdGhvdXQgaXRzIGNoYW5uZWwgaXMgc3RpbGwgbm90IGEgd3JpdGUJYjlhNTI4MGYwYjc1YjY3NmJmNmRiNDU1ZTY0MTEyYzI5ZjI3NGRmNTA1YTI0YTQwNTQ2MmQyMTQxOGJlMDVlYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWRpcmVjdCBiZXNpZGUgYSBjaGFubmVsLWZyZWUgcmVhZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkxNzNiMjRkYTZiMWZmMmI4OTk0YmQ1OWRmNjdiNTNlN2Q3NzIzZGM5YTc2MDgzYTQ5ZWEzYWNjMWYwN2I1MmU3CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBpcyBhIHdyaXRlIHRvIHRoZSBjbGFzc2lmaWVyIGFuZCB0aGUgZ3VhcmQJNTE4NDJlZDZiNmI0YWE1M2Y0OTE2MDcyNGMyYTIxNjgxNWEzM2EwNzM5ODY2YzVmZWM3YWFlZWMwMjJmMWQyZgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB1c2VkIHdyaXRlIGNoYW5uZWwga2VlcHMgZXZlcnkgY2FuZGlkYXRlCTRjZTRhOGVjMjBmNTdmOTM4MGY2NDQ4ZjljN2U0NDdmNDQ1MjU5OTIxZTBjOWE1NTY5ZWQxNWUwOTYwYzJiMDIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdmFyaWFibGUgaW4gYSByZWFkIG9wZXJhbmQgaXMgc3RpbGwgbm90IGEgY2hhbmdlZCBwYXRoCTEzZGQ4NTdiZDY2MWMzMDNkYmZkZTY3NWQ1YmViN2VjYzY0ODMwZWIzNTg5YzEzODc4ZmQ3MTdlMjNjNzZlMzEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdmFyaWFibGUgaW5zaWRlIGEgcmVkaXJlY3QgdGFyZ2V0IGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWU2N2Q0Y2I1MmY2ZjEzODdkMjgzNDdkMzM5NjNkM2NmMTRiNmQ4MDQ1NWYxNjViOWZjOTY3ODA5ZGMyMTVmMWIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggdXNlZCBvbmx5IGJ5IHJlYWRzIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAlhOGZmYTY1MzJmNWZhZjgzN2FhZjc3Y2IwOGU2Y2NhZDkxOTA0NmQxMTAzN2Y0MDU4MGM4YmU0ZGZiNGM0MWI2CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBhc3NpZ25lZCBwYXRoIHdyaXR0ZW4sIGhpZGRlbiwgZXhwb3J0ZWQgb3IgbmV2ZXIgcmVmZXJlbmNlZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkzZDlmM2ZiZmUwYTQzOWFjNjdhYTU4YTE0NDVjODFlOWMxZmQzZjQzMjQ1MmVmNTVhZTEzOGJhNzA0ZTdlNmU5CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIGRvZXMgbm90IGhpZGUgYSByZWRpcmVjdCB0YXJnZXQJNTM1NGFiMjJlNDQxYmZlODU3NDAzMjRhYWQxOWVkNmM4MjJjMGU0N2I0NWY1Nzc3OWM0ZTIzNDg4Zjg5ODM5Nwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gZXNjYXBlZCBxdW90ZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBhIHJlYWQJMjdhOTMzYzVhNDZiZWEzYTNjYTU2MzE3Y2Y2MmZhNWQ4NWQ3Y2VkZGEyMWEyNWYwODlmNzkwZGVlOTFhZTZlYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJdGhlIHJlbGVhc2VkIHF1b3RlIHN0cmlwIHN0aWxsIHNlZXMgdGhlc2Ugd3JpdGVzCTYxZTRkOWMyYWYwMDkyYzJmYmVjNmVlNWY4MTNmMTdjZmQwNzllZTlmZWMzY2E5YzkzYzZjNjQ5MWY0NWYyZTA · test-lock-kind:replace
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:e84fec18bc83fdc899b22d89f567bca162ec94ac30830a97abef9de5d0309af9 · ms:27760
