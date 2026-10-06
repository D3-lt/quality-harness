# Task ADR-090-T3: a wrapper named by its absolute path is that wrapper

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one function in one file, its tests and a campaign entry)
**Owner:** unassigned
**Produces:** `programIndex` matching its wrappers by `programName` for an absolute path
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a wrapper named by an absolute path is read as that wrapper`, `a relative path is not a wrapper`

## Goal

`/usr/bin/env git push`, and every other wrapper `programIndex` knows when written as an absolute path, is the
publish it runs and is refused on an unchecked tree; a relative path or a look-alike name stays a mention.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `programIndex` (`:3800`): compare `programName(word)` when `word` is an absolute path; `publishInCommand` (`:4193`) calls it and is what selects it |
| `tests/publish-command.test.mjs` | edit | two new tests beside the locks |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/publish-command.test.mjs`, then write the two tests and
   record the red run (TDD red). Red today: `publishCommandIn('/usr/bin/env git push')` is null (measured
   2026-10-06 at 73f930f).
2. [S2] In `programIndex`, read an absolute-path word (POSIX `/…`, and a Windows drive path, normalised as
   CLAUDE.md §7 asks) by its `programName` for `exec`, `nohup`, `doas`, `command`, `time`, `nice`, `sudo`,
   `timeout`, `xargs` and `env`. A relative path is unchanged.
3. [S3] Record one killed mutant per Rests-on name and add each to `tests/mutations.json`: one that drops the
   absolute-path reading (the refusal test goes red), and one that reads any path by its name (the `./env`
   row goes red). The fence's first segment only runs the suite; its two checks are the two tests, one per
   Rests-on name, so the third segment adr-lint counts rests on no mechanism of its own. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \
  && for t in 'a wrapper named by its absolute path runs the publish it wraps' 'a relative path or a look-alike wrapper name stays a mention'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a wrapper named by its absolute path runs the publish it wraps` | `tests/publish-command.test.mjs` | unarmed and unchecked, each is `deny` and names `git push`: `/usr/bin/env git push`, `/usr/bin/env -- git push` (csn behavioral-contract-cases.ts:591, :603), `/usr/bin/env -S "git push"`, `/bin/env git push`, `/usr/bin/sudo git push`, `/usr/bin/time git push`, `/usr/bin/nice git push`, `/usr/bin/nohup git push`. The `env`, `time` and `nice` rows also run under bash with a recording stand-in `git` on `PATH`, which must record `push`; `sudo` is lexed only, never executed (ADR-067 Decision 2). CLEAN twin: after `qh-check`, none is `deny` | none | S1, S2 |
| `a relative path or a look-alike wrapper name stays a mention` | `tests/publish-command.test.mjs` | unarmed and unchecked, none is `deny`: `./env git push`, `/usr/bin/envsubst git push`, `echo /usr/bin/env git push` | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `publishInCommand` calls `programIndex` for every command; the refusal test drives the real PreToolUse hook |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the PreToolUse decision |
| 4 — it is used | nothing measures this yet |

## Mutation Log
- 2026-10-06 · 2cb2d28* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an absolute path is never a wrapper again · acceptance-sha256:a123e078cfd53e4f7df1dd2bd0c488430866749e1f70f47f31417a9b0e15f413 · covers:a wrapper named by an absolute path is read as that wrapper
- 2026-10-06 · 2cb2d28* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · any path is read by its name, ./env included · acceptance-sha256:a123e078cfd53e4f7df1dd2bd0c488430866749e1f70f47f31417a9b0e15f413 · covers:a relative path is not a wrapper

## Invariants

- A relative path is never read as a wrapper.
- A bare wrapper word is read exactly as today.

## Risks

- A program the user installed at an absolute path named like a wrapper, which does not run its arguments:
  refused on an unchecked tree, the conservative side; ADR-090 Risks names it.

## Stop Condition

Stop and ask if any data row is `deny`, or if a test the steps edit has become locked.

## Out of Scope

- Wrappers the classifier does not model (`find -exec`, `parallel`) — ADR-090 Out of Scope.

## Verification Log
- 2026-10-06 · 2cb2d28* · exit 1 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:a123e078cfd53e4f7df1dd2bd0c488430866749e1f70f47f31417a9b0e15f413 · ms:62708 · test-lock-sha256:a0a51aed323036c718b9786253a634167bcc7d93c24b562f73c902b9c42bc679 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCVBvd2VyU2hlbGwsIGFuIG9mZmVyZWQtb25seSBzZXNzaW9uIGFuZCB0aGUgcmV2aWV3ZXIgZ3VhcmQgYXJlIHVuY2hhbmdlZAk4MWY0NmEyYzU1NDBkMTZjNGFjMzQwZGFiMDMwOTdlOGRiY2IyMDM3MTgxNmJiMDdiNzJmNmU3M2VlMjAzN2U2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCVdpbmRvd3Mgc3BlbGxpbmdzIG9mIGEgcHVibGlzaCBhcmUgcmVjb2duaXNlZCwgYW5kIGxvb2stYWxpa2VzIGFyZSBub3QJOWMzNDFiN2FjZTZlYzdlMzA0YTY4ZWFjM2U5MGI3NzQxMDc5ZDYzYWEzODRlOGEyZDZjYzc0NDRkZjRjMGIyYQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIGJyYWNlLWJ1aWx0IHB1Ymxpc2ggaXMgcmVmdXNlZAkwYThlNGQ5ZDAzZjg4MGM3NmI3OGNhNzc1OTRlOWNhNDQwNmY0NjBiMDdkYzY3ZjAxYmM2ZDk4OTI5MGNlYWU3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgaGVyZWRvYyBib2R5LCBhIHBhcmFtZXRlciBhbmQgYSBmdW5jdGlvbiBuYW1lIHRoYXQgb25seSBob2xkIGEgcHVibGlzaCBzdGF5IGRhdGEJNjU5Y2EzZjZhYzc4ZDdhMjk3MTEwMTUxOWNmZWExYmJjMDk5OTIzZjhmNDEzNDliMjUwMTgyNDg4ODBkNzhiYgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIG1lc3NhZ2UgdmFsdWUgdGhhdCBjYW4gcnVuIGNvZGUga2VlcHMgdGhlIHJlZnVzYWwJNTgyZWFlMTZlYjBmZGM0ZTAyYjMzMzBlNzQ0NzkzNjZiMzY2ZmUyOGNhODNhMDA0MWJiMDc5NmM4Y2FkMWQ5Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHB1Ymxpc2ggaXMgZm91bmQgYnkgYXJndiwgYXMgdGhlIHNoZWxsIHJ1bnMgaXQJZDdhNmJhYzRjM2ZhYzQyYzU4NGQyMDFlMmY5YjRkMzZjZmVmNWU5ZWQ4NDNiMmI1N2M0YzYyNGRiOWQzZmI5Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHB1Ymxpc2ggcnVuIGZyb20gYSBoZXJlZG9jIGJvZHksIGEgcXVvdGVkIHN1YnN0aXR1dGlvbiBvciBhIGZ1bmN0aW9uIGJvZHkgaXMgcmVmdXNlZAlhNDJlNzY1NWJiNjQyODc5YTBlNDkwMGE4YTEyNmIwMTI3Y2UxZDUyNGYwYjQyODJkMWNjNmU0MDkyMWUxOTE3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgcXVvdGVkIGNvbW1pdCBtZXNzYWdlIGlzIGRhdGEgdG8gdGhlIGFybWVkIGFuZCBmcmVzaC1yZXBvc2l0b3J5IGRvd25ncmFkZXMJZjdjYWZjYzFlOGI4YmMxMDFmYzkxZTYwMzNmMDQwOWMzYmNlYjA1YzhhNGY3NmM1MTMyZjhlZDlkNmFiNWFhMwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHJlbGF0aXZlIHBhdGggb3IgYSBsb29rLWFsaWtlIHdyYXBwZXIgbmFtZSBzdGF5cyBhIG1lbnRpb24JYWM0MGRkMDYxOTAyNmI5YTA1ODk3NmJkN2JkOTIwODMyMTBkOTZmNTlkYTI1NzNmNDk2ZjMxM2VmOTI3YzhkNgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHNpbmdsZSB0ZXJtaW5hbCBuZXdsaW5lIGVuZHMgYW4gdW5hcm1lZCBmcmVzaCBjb21taXQgbGlrZSB0aGUgZW5kIG9mIHRoZSB0ZXh0CWQ1ZTRhNGE1MjUwY2Y5Y2E5Y2FmMjEyYzdkMjU2YTc2ZWFiMDU4MTA2N2JkMTkzZGRmN2UzNTIwYjYyMGNlYTAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYSBzdHJpbmcgaGFuZGVkIHRvIGEgc2hlbGwgYnkgb3Muc3lzdGVtIG9yIG9zLnBvcGVuIGlzIHJlYWQgYXMgdGhhdCBzaGVsbCByZWFkcyBpdAllNzFkY2YxNGI4OTlmZGQ3NTJhZjc2YmQwNzc1YTBlYmNhZGUyYzA1YTdhNWNhNzcxMmE4ZWNmYjBjNjcxMDA3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgdGFyZ2V0IHJlcG9zaXRvcnkgY29uZmlnIGRvZXMgbm90IHN3aXRjaCBvZmYgdGhlIGluamVjdGVkIGhvb2sJODVmYjZhOTkyMDU5ZDVmNzc4OTgwMzkwNDRiNmMwOGRkNzQ2Mzk0MzlkNDRiODNkMTA2MzAzZjI0ZmQ3Mzc0Zgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHdyYXBwZXIgbmFtZWQgYnkgaXRzIGFic29sdXRlIHBhdGggcnVucyB0aGUgcHVibGlzaCBpdCB3cmFwcwkwOWRhNTJiYmE2NjAzOWI2ZjliZGI5ZGZhYzVkZmRlYjJkMmMxYTI3NjEwOGU0ZjIwNjdlMWM3NDA0OTNkZmViCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFsaWFzIGlzIHJlYWQgYXMgZ2l0IGV4cGFuZHMgaXQsIGFuZCBhIGNhbGwgaW5zaWRlIGEgc3RyaW5nIGlzIGRhdGEJMTJiYTI2MGY4YzQyOTlhNDkwODZjYzgyMDlhMjNjOTYzMjA0ZDVhODNjN2E0ZmRkOWNmYmY2ZDIyMDZiMDUwMwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcmd2IGxpc3QgaW4gbm9kZSBvciBwZXJsLCBhbmQgYW4gYWxpYXMgc2V0IHdpdGggLWMsIGFyZSByZWFkIGFzIHRoZSBwdWJsaXNoIHRoZXkgcnVuCTlkYjZmM2IyOTkzMjJkZjM1ZTg3OGEyMGIxNDE1YmIxMjY2NDAzODBlMmFiMWQzODQ4NzI5MDNhNjg4NTFiNTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiBsZWF2ZXMgYSBjb21taXQgaW50byBhIG1rdGVtcCBkaXJlY3RvcnkgdG8gZ2l0CTQ1YWI2MzIxOWRiN2UxYzI2ZDQwODllNmE1NGY2YTA2Zjc5MDZiNWQ1MWVjZGU4NGYzY2JlZjFkNzJhNTVkNGQKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiBsZWF2ZXMgYSBwbGFpbiBpbnZvY2F0aW9uIHRvIGdpdAkxNDg0NjQ1MDcyZjAxZDIwNWY0YmFlYWZmY2Q1Nzk3ZDEyNzM0YjQ1ZmY4MjM5ZDRlNjJkMmFkZjAzMDcxNmMwCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyBhIHF1b3RlZCwgZXNjYXBlZCBvciBzdWJzdGl0dXRlZCBob29rIGJ5cGFzcwljZGM4MDBjMTQxY2M3MWJjNWQ3NWE1NzMyMWUzODg2N2VlYTAwMmI2OTNiZjlhYTFjNGEzODYxODgxNjZkOTEyCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyBhIHJlZGlyZWN0aW9uIG9yIGFuIGF0dGFjaGVkIHZhbHVlIHRoYXQgaGlkZXMgYSBieXBhc3MJNjg2Mjg4MWRmZjg3NzQ1Yjg1NDcwNzJiYWMzOTY0YzkyZThiNmIxMjNjOWU5YTM3ZTEzNzhhOTJjN2JjZWZjMwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHJlZnVzZXMgYSB3cmFwcGVkIGdpdCBhbmQgYSByZWFzc2lnbmVkIGhvb2sgdmFyaWFibGUJMWUzNmJhZDA0MjA5YTZmYmVkOTExNjAzMDc4YTIxYTBiMTRkN2Y5ZDE5ZWExOTMxYzhlYjMyODk4OThjNjhjYwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHJlZnVzZXMgYXJpdGhtZXRpYywgd2hpY2ggY2FuIGFzc2lnbiBhIHZhcmlhYmxlIG5hbWVkIG9ubHkgaW4gYSB2YWx1ZQkzMzMxNTZlMGRjODRiYjE5OWJiOTkyNjBiNWFjNTY4ZjNiMjhjZTRhYjYzYjU5NmIzYzZjMTgyZWVkOWZmM2M5CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyB3aGF0IHRoZSBzaGVsbCBleHBhbmRzIGJlZm9yZSBnaXQgc2VlcyBpdAkyODU3MjIyZjMyYzZmYjA2NDhlYTMwZjhhYzhkOGQ4NDdjM2QwZDY3YWRiMDRiOWVjNmEwNTdjYWJlNTQ4NThlCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gc3RpbGwgcmVmdXNlcyBhIGRvbGxhciBpdCBjYW5ub3QgcGxhY2UgYXMgYSBkaXJlY3RvcnkJOTQxMGYzYzhjNTdmNGZjYmIxYWNhNGIzZmNlMWZiN2Y0YjczMWRkM2VkMmU5Y2QzM2Q3ZDI4Mjg3YzY5NTUwMgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHN0aWxsIHJlZnVzZXMgZXZlcnkgZm9ybSB0aGF0IGNhbiBkaXNhYmxlIHRoZSBob29rCWIwNzNkZWJhMDY4YjgzM2FlNTQ1YWIwNDI0ZjY5YzcyNTc2MDJmMzAzZTMxZWVkOTk2MjBjY2JjNTAyYWMxNzMKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gaW5oZXJpdGVkIGdpdCBvciBiYXNoIGVudmlyb25tZW50IGtlZXBzIGFuIHVuYXJtZWQgZnJlc2ggY29tbWl0IHJlZnVzZWQJOGI1ZGRhMzAzODZjN2Q3ODUzMjQ5MDYxNjhjNmEyY2M5MzQyYzM3NmZlMGE4ZDhhNDFmYWU2NTljZjNjYTEyOQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBvdmVyc2l6ZWQgY29tbWFuZCBpcyBzdGlsbCByZWFkOiB0aGUgcHVibGlzaCBhdCBpdHMgZW5kIGlzIHJlZnVzZWQsIG5vdCBjcmFzaGVkIHBhc3QJNWE4ZmNjYjJjMzE1NmU0NDFhZjBmYzI0MWViMWY3NjBiMTBlZDljY2M5YmRjOGZiNWM0MzNhOThmZGJlNDY3ZApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiB1bmFybWVkIGNoYWluIHRoZSB0ZXh0IGNhbm5vdCBwbGFjZSBpbiBhIGZyZXNoIHJlcG9zaXRvcnkgaXMgc3RpbGwgcmVmdXNlZAkxNzVkYmNiYTFlOTdmZGUwMGQ5OGNkNzUzMWU3YzJlYjdlOWJiZmZlNmIyNTczOTA0MDViNTBhNzYwOWYxN2MwCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIHVuYXJtZWQgY29tbWl0IGludG8gYSByZXBvc2l0b3J5IHRoZSBjb21tYW5kIGNyZWF0ZXMgaXMgYWR2aXNlZCwgbm90IHJlZnVzZWQJN2IzNDZhYjE2MDEzYzFmYmJjMzA5ZTI3N2Q0MzY4M2U0ZWVlMzFmZWNiMTIzNmRiOGEyM2NiZmZmM2Q2YWExMgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiB1bmFybWVkIGZyZXNoIGNvbW1pdCBpcyByZWZ1c2VkIHdoZW4gYXJpdGhtZXRpYyBjYW4gcmVhc3NpZ24gaXRzIGRpcmVjdG9yeQk0YzcxYjU3MzQ5NDAxNzQxOGY0MmIzZDYxMmQzNGQxYjVhZmFlNjYzODRmZDY2OTg3YTVhNjhlNWEzMjljYWYzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIHVuYXJtZWQgZnJlc2ggc3Vic3RpdHV0aW9uIGlzIG9uZSBmb3JlZ3JvdW5kIG1rdGVtcCBhbmQgbm90aGluZyBhZnRlciBpdAlhODc5YjA4ZjY1MmU2MTYyOWU3ZGI1MzhiZDE0MTU3YzJkN2Y5ZmJiZDNhZmU1NzFkNzJhMzc3YzVmZGUxMmMzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWRhdGEgdGhhdCBuYW1lcyBhIHB1Ymxpc2ggaXMgbm90IHJlZnVzZWQsIGFuZCB0aGUga25vd24gZmFsc2UgcmVmdXNhbHMgYXJlIGdvbmUJY2E0YzZjMGNjNjg3YjNmY2RlMWIyZTE2NDBiYTU3YTU1ZGY2MjI0Y2JmODYwMWQ0MTE1OTE2ZDA3ZTU5MWZhMgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlkeW5hbWljIGludm9jYXRpb25zIGFyZSBub3QgcmVmdXNlZCwgYW5kIHRoaXMgdGVzdCBwaW5zIHRoYXQgdGhleSBhcmUgYSBtZW50aW9uIGF0IG1vc3QJYmU4NjQ3YjM1NzMzNDc5ODM2ZTk5NDg4ODk1ZWI3OWIwOWMyM2M3YWY0YjU5NmJkZTA5NDA5MmQ5ZTkyN2ZkMApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlldmFsIHJ1bnMgaXRzIHN0cmluZywgc28gYSBwdWJsaXNoIGluIGl0IGlzIGludm9rZWQJYmZhZmI4Zjg2MmFmMDE5MWQ2NmI4M2M1NzJiN2VhNzMzYTA2MDJjMzA5MWM4N2Y4YmE1MTQwNjY0ODUyODJhOQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlldmVyeSBwdWJsaXNoIGZvcm0gaXMgcmVjb2duaXNlZCwgd2l0aCB0aGUgaW52b2NhdGlvbiBuYW1lZAlmM2U4ZWRmYjA3Y2Q1YjUxMzk5YjMzNjVlNDE3YmQ0ZjQxZWVhNTU1MjM0ODM2MTRkOTdkOTY1NWZjN2ZkODFiCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWdpdCBpcyByZWNvZ25pc2VkIGluIGFueSBjYXNlIGFuZCB0aHJvdWdoIGEgLmNtZCBzaGltCWYzM2NmZWQyZDFkYjhkZTgwZjk1ZDU5MTAyN2Q5N2E0N2U5MGQwOGE2YjBkZTM5YTkyYjg2YjdmMjk3MzZlMmQKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJbm90aGluZyB0aGF0IG9ubHkgbWVudGlvbnMgYSBwdWJsaXNoIGlzIHJlZnVzZWQJN2FmOGU2OWE4YmRkNmZlODllYmE0OGRmMGY1MTQyNzg5NGVmZGU1YjA1MmQ4YzFmMTI1MjRkNTM2YWVhMjI5Nwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlvbmUgbGV4ZXIgcmVhZHMgc2hlbGwgdGV4dCBmb3IgcnVsZSBQCWUwMWUwMDI2NjE2OTAyOTVmMzU0YWY2MjMzNzVkOTc2ZTM3NTk3OGYzMTQ1YTE2NTU2N2JjM2E0MzkyNjNmZWIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGV4dCBwaXBlZCBpbnRvIGEgc2hlbGwgaXMgcmVhZCBhcyB0aGUgc2hlbGwgcmVhZHMgaXQJYTEyM2I1Zjc5MzJiZjBhY2M4Y2Q1YzBjYzExYzViMTg0Yjg1ZmQwOTM4M2I4NGE0OWU3Mzg4ZDNlODk5NTBiYQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgYWR2aXNvcnkgYXJtIHNlZXMgdGhlIHdvcmRzIGFzIHdvcmRzIOKAlCB3YXJuZWQgYWJvdXQsIG5ldmVyIHJlZnVzZWQJYTIyZjMzMWE5ZTdhOWRhZWQ3MjBlYTJjMmZjY2YyNDU2ZWY5NDRhNDBhY2ZlZmNhMWRlMTExMDcyNzI2NzM5Ngpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgYXJtZWQgY2hlY2sgaXMgYSBncmFtbWFyIG9mIHBsYWluIGZvcm1zLCBub3QgYSBsaXN0IG9mIGRhbmdlcm91cyBvbmVzCWYwYTQzYzI1YThjYTIyNzQ3NzRjNzc1Mjg5N2I4Y2NjZjM1MDZjZGY1YTI4Nzc1ZmZlNzE1ZmRlNmU5YWMwMzkKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGFybWVkIGdyYW1tYXIgcmVhZHMgd29yZHMsIHF1b3RlZCBjb2RlIGFuZCBoZXJlZG9jcyBhcyB0aGUgc2hlbGwgZG9lcwllMzVmNDU2ZmNjMDRjOTNmM2RmY2I1MTQ3NDM4YjBlYjk0OGRlODZjY2Y2MjA3ZWZhZWZhZDE4MWMyNjA3NmJjCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBjaGFvcyByb3VuZCBvZiA2MjY5MzRhOiB3aGF0IHRoZSBzaGVsbCByYW4gaXMgd2hhdCB0aGUgY2xhc3NpZmllciByZWFkcwk0Nzk0NTIyNWU0MTVmNDRiOTM1ODUyYzRlZjI3ZGE3ZWQ5M2Q2Y2U5MmEyZWI0OTA1OGY1MTI1MzhiZTFjODcyCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBjbGFzc2lmaWVyIHN0YXlzIGxpbmVhciBvbiBhIGxvbmcgaW50ZXJwcmV0ZXIgc2NyaXB0CTQxMDYwMzUyYzZjZDM4YmYwYjAxODExYmU4MTg2Y2EyYWZjOWI5ODViODAxZmQ1ZTA0M2E3ZmY4YzU0YTQ2ODQKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGNsYXNzaWZpZXIgc3RheXMgdW5kZXIgaXRzIGNvc3QgYm91bmQJYjBkZWYwMDk0ZTZjODY1YzcxYWRiN2I2MDdlNTc4YWY3OTgzM2VhOGEyYzBhYzEzMzZlNTE2YzZmNTI3NDBmOQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgZnJlc2gtcmVwb3NpdG9yeSByb3dzIGNvbW1pdCB3aGVyZSB0aGUgY2xhc3NpZmllciBzYXlzIHRoZXkgZG8JZjcxODc5YjYxOWMzMjgyMTI5ZDMyMzkxMzc1NzhlYmJmNzQyOTAzNDU0YzIxMDgzYTQ2NGM2OGQ0ZmJlZjZkOApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgbWFza2VkIGZyZXNoLXJlcG9zaXRvcnkgcm93cyBjb21taXQgd2hlcmUgdGhlIGNsYXNzaWZpZXIgc2F5cyB0aGV5IGRvCTZkZTdjMGU0MGNhNDdjMjRiYjI2ZmJmMGMwMjlkOGIxYmYyZmU0NDMzODllNDcyOTBhYzI1MmQxY2Q1ODI2ZjI
  ```
  ```
- 2026-10-06 · 2cb2d28* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:a123e078cfd53e4f7df1dd2bd0c488430866749e1f70f47f31417a9b0e15f413 · ms:70815
- 2026-10-06 · 2cb2d28* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:a123e078cfd53e4f7df1dd2bd0c488430866749e1f70f47f31417a9b0e15f413 · ms:70792
