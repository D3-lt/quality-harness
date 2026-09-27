# Task ADR-067-T2: The publish classifier reads argv, and the regex arms go

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one module, its tests and the catalogue)
**Owner:** unassigned
**Produces:** `publishCommandIn()` on `shellWords`; `NOT_PUBLISHES` holding the seven former known false refusals; the brace row in `PUBLISHES`
**Consumes:** `shellWords()` and its differential test (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `no publish row moves to not-refused`, `the known false refusals are allowed`, `the brace publish is refused`, `the cost stays bounded`

## Goal

`publishCommandIn` walks `shellWords(command)` as ADR-067 Decision 3 says, and every `PUBLISH_*` regex except `PUBLISH_MENTION` is deleted with its catalogue mutants. `KNOWN_FALSE_REFUSALS` is emptied into `NOT_PUBLISHES`. The four of those rows that also stand in `LEFT_TO_GIT` move out of it, because the locked armed test requires every `LEFT_TO_GIT` row to be a matched publish. `git {-c,x=y} push` and the pipe-into-a-shell forms join `PUBLISHES`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `publishCommandIn` on `shellWords`; the regex arms and `quotedStringEnd` deleted |
| `tests/publish-command.test.mjs` | edit | table moves; three new tests beside the locked ones |
| `tests/mutations.json` | edit | regex mutants replaced by walk mutants |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red): the seven rows are refused today and the brace row is not.
2. [S2] Rewrite `publishCommandIn` over `shellWords`: prefixes, git options, the verb, `-h`/`--help`, and the bounded recursion into `-c` strings (`shellRuns`), `eval`, heredocs fed to a shell, substitutions, `-Command`, `cmd /c`, `wsl -e` and the interpreter call spellings.
3. [S3] Move the rows, including the four out of `LEFT_TO_GIT`, delete the regex constants and `quotedStringEnd`, and grep that no `PUBLISH_` name except `PUBLISH_MENTION` remains. The locked test bodies do not change; only the constants they loop over do. [proof: acceptance]
4. [S4] Measure the mean cost per call over the test file's string literals, as ADR-067 Context did, and assert it under 25 µs in a test that reports the number. [proof: acceptance]
5. [S5] Replace the regex arms' catalogue mutants with walk mutants and record them with `adr-verify --mutant`:
   - drop the recursion into `eval`;
   - drop the recursion into a heredoc fed to a shell;
   - read `-h` after the verb as a publish;
   - skip brace expansion (T1's) on git's options.
   [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (a publish is found by argv, as the shell runs it|data that names a publish is not refused, and the known false refusals are gone|a brace-built publish is refused|text piped into a shell is read as the shell reads it|the classifier stays under its cost bound|every publish form is recognised, with the invocation named|nothing that only mentions a publish is refused|an armed session leaves a plain invocation to git)' | grep -qx 8
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a publish is found by argv, as the shell runs it` | `tests/publish-command.test.mjs` | every `PUBLISHES` and `WINDOWS_PUBLISHES` row returns the same invocation it returns at 826ec94, recorded in the test as data | none | S1, S2 |
| `data that names a publish is not refused, and the known false refusals are gone` | `tests/publish-command.test.mjs` | the seven former `KNOWN_FALSE_REFUSALS` rows return null in an unarmed AND an armed session, and the list is empty; the same words run as commands are refused (the dirty twin) | none | S1, S2, S3 |
| `text piped into a shell is read as the shell reads it` | `tests/publish-command.test.mjs` | an `echo` of a `--no-verify` commit piped to `bash`, a `printf` of a push piped to `sh`, and a heredoc piped to `bash` each return an invocation and are denied unarmed; the `--no-verify` one is denied armed too, because it skips the hook (a plain push is left to git's pre-push hook, ADR-066); the same text piped to `cat` is not an invocation (the clean twin) | none | S1, S2 |
| `a brace-built publish is refused` | `tests/publish-command.test.mjs` | `git {-c,x=y} push` and `git {commit,-m,x}` return an invocation; `echo {git,push}` does not | none | S1, S2 |
| `the classifier stays under its cost bound` | `tests/publish-command.test.mjs` | mean µs per call over the file's literals is under 25, and the measured mean is printed | none | S4 |
| `every publish form is recognised, with the invocation named` | `tests/publish-command.test.mjs` | locked (ADR-066 T3), unchanged | none | — |
| `nothing that only mentions a publish is refused` | `tests/publish-command.test.mjs` | locked (ADR-066 T3), unchanged; its known-limit loop now reads an empty list | none | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the walk in `publishCommandIn` |
| 2 — something selects it | rule P and `publishVerdict` call `publishCommandIn` unchanged |
| 3 — the caller can discover it | the refusal text names the invocation it read |
| 4 — it is used | every PreToolUse:Bash and PowerShell call |

## Mutation Log
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · eval no longer runs its joined arguments · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · covers:no publish row moves to not-refused
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a help flag straight after the verb is read as a publish · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · covers:the known false refusals are allowed
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · brace expansion drops every alternative after the first · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · covers:the brace publish is refused
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the classifier does twenty times the work per call · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · covers:the cost stays bounded
- 2026-09-27 · 826ec94* · mutant survived · exit 0 · `plugin/scripts/lifecycle.mjs` · a heredoc fed to a shell is no longer read as its script · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · covers:no publish row moves to not-refused
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a heredoc or here-string fed to a shell is no longer read as its script · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · covers:no publish row moves to not-refused

## Invariants

- No `PUBLISHES`, `WINDOWS_PUBLISHES` or `DISABLES_THE_HOOK` row moves to not-refused.
- `$(which git) push` and `GIT=git; $GIT push` stay mentions (the locked dynamic test).

## Risks

- The locked `nothing that only mentions a publish is refused` loops over `KNOWN_FALSE_REFUSALS`; emptied, that loop asserts nothing. The new data test carries the assertion, and the empty list is where a newly found limit goes.
- The locked `an armed session leaves a plain invocation to git` loops over `LEFT_TO_GIT`; the four data rows leave it, and it keeps asserting the plain invocations. It is in the fence so a row left behind fails the task.

## Stop Condition

Stop and ask if any publish row cannot keep its verdict on the lexer.

## Out of Scope

- The armed grammar (deferred: T3)

## Verification Log
- 2026-09-27 · 826ec94* · exit 1 · `set -o pipefail …` · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · ms:40611 · test-lock-sha256:948af81c5a4c0ad2870799d751dcb4d97201d329a8d65e14132c2c61e29c8740 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlQb3dlclNoZWxsLCBhbiBvZmZlcmVkLW9ubHkgc2Vzc2lvbiBhbmQgdGhlIHJldmlld2VyIGd1YXJkIGFyZSB1bmNoYW5nZWQJODFmNDZhMmM1NTQwZDE2YzRhYzM0MGRhYjAzMDk3ZThkYmNiMjAzNzE4MTZiYjA3YjcyZjZlNzNlZTIwMzdlNgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlXaW5kb3dzIHNwZWxsaW5ncyBvZiBhIHB1Ymxpc2ggYXJlIHJlY29nbmlzZWQsIGFuZCBsb29rLWFsaWtlcyBhcmUgbm90CTljMzQxYjdhY2U2ZWM3ZTMwNGE2OGVhYzNlOTBiNzc0MTA3OWQ2M2FhMzg0ZThhMmQ2Y2M3NDQ0ZGY0YzBiMmEKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYSBicmFjZS1idWlsdCBwdWJsaXNoIGlzIHJlZnVzZWQJMGE4ZTRkOWQwM2Y4ODBjNzZiNzhjYTc3NTk0ZTljYTQ0MDZmNDYwYjA3ZGM2N2YwMWJjNmQ5ODkyOTBjZWFlNwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHB1Ymxpc2ggaXMgZm91bmQgYnkgYXJndiwgYXMgdGhlIHNoZWxsIHJ1bnMgaXQJZDdhNmJhYzRjM2ZhYzQyYzU4NGQyMDFlMmY5YjRkMzZjZmVmNWU5ZWQ4NDNiMmI1N2M0YzYyNGRiOWQzZmI5Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIGxlYXZlcyBhIHBsYWluIGludm9jYXRpb24gdG8gZ2l0CTE0ODQ2NDUwNzJmMDFkMjA1ZjRiYWVhZmZjZDU3OTdkMTI3MzRiNDVmZjgyMzlkNGU2MmQyYWRmMDMwNzE2YzAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgcXVvdGVkLCBlc2NhcGVkIG9yIHN1YnN0aXR1dGVkIGhvb2sgYnlwYXNzCWNkYzgwMGMxNDFjYzcxYmM1ZDc1YTU3MzIxZTM4ODY3ZWVhMDAyYjY5M2JmOWFhMWM0YTM4NjE4ODE2NmQ5MTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgcmVkaXJlY3Rpb24gb3IgYW4gYXR0YWNoZWQgdmFsdWUgdGhhdCBoaWRlcyBhIGJ5cGFzcwk2ODYyODgxZGZmODc3NDViODU0NzA3MmJhYzM5NjRjOTJlOGI2YjEyM2M5ZTlhMzdlMTM3OGE5MmM3YmNlZmMzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyBhIHdyYXBwZWQgZ2l0IGFuZCBhIHJlYXNzaWduZWQgaG9vayB2YXJpYWJsZQkxZTM2YmFkMDQyMDlhNmZiZWQ5MTE2MDMwNzhhMjFhMGIxNGQ3ZjlkMTllYTE5MzFjOGViMzI4OTg5OGM2OGNjCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyB3aGF0IHRoZSBzaGVsbCBleHBhbmRzIGJlZm9yZSBnaXQgc2VlcyBpdAkyODU3MjIyZjMyYzZmYjA2NDhlYTMwZjhhYzhkOGQ4NDdjM2QwZDY3YWRiMDRiOWVjNmEwNTdjYWJlNTQ4NThlCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gc3RpbGwgcmVmdXNlcyBldmVyeSBmb3JtIHRoYXQgY2FuIGRpc2FibGUgdGhlIGhvb2sJYjA3M2RlYmEwNjhiODMzYWU1NDVhYjA0MjRmNjljNzI1NzYwMmYzMDNlMzFlZWQ5OTYyMGNjYmM1MDJhYzE3Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlkYXRhIHRoYXQgbmFtZXMgYSBwdWJsaXNoIGlzIG5vdCByZWZ1c2VkLCBhbmQgdGhlIGtub3duIGZhbHNlIHJlZnVzYWxzIGFyZSBnb25lCWNhNGM2YzBjYzY4N2IzZmNkZTFiMmUxNjQwYmE1N2E1NWRmNjIyNGNiZjg2MDFkNDExNTkxNmQwN2U1OTFmYTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZHluYW1pYyBpbnZvY2F0aW9ucyBhcmUgbm90IHJlZnVzZWQsIGFuZCB0aGlzIHRlc3QgcGlucyB0aGF0IHRoZXkgYXJlIGEgbWVudGlvbiBhdCBtb3N0CWJlODY0N2IzNTczMzQ3OTgzNmU5OTQ4ODg5NWViNzliMDljMjNjN2FmNGI1OTZiZGUwOTQwOTJkOWU5MjdmZDAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZXZhbCBydW5zIGl0cyBzdHJpbmcsIHNvIGEgcHVibGlzaCBpbiBpdCBpcyBpbnZva2VkCWJmYWZiOGY4NjJhZjAxOTFkNjZiODNjNTcyYjdlYTczM2EwNjAyYzMwOTFjODdmOGJhNTE0MDY2NDg1MjgyYTkKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZXZlcnkgcHVibGlzaCBmb3JtIGlzIHJlY29nbmlzZWQsIHdpdGggdGhlIGludm9jYXRpb24gbmFtZWQJZjNlOGVkZmIwN2NkNWI1MTM5OWIzMzY1ZTQxN2JkNGY0MWVlYTU1NTIzNDgzNjE0ZDk3ZDk2NTVmYzdmZDgxYgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlub3RoaW5nIHRoYXQgb25seSBtZW50aW9ucyBhIHB1Ymxpc2ggaXMgcmVmdXNlZAk3YWY4ZTY5YThiZGQ2ZmU4OWViYTQ4ZGYwZjUxNDI3ODk0ZWZkZTViMDUyZDhjMWYxMjUyNGQ1MzZhZWEyMjk3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRleHQgcGlwZWQgaW50byBhIHNoZWxsIGlzIHJlYWQgYXMgdGhlIHNoZWxsIHJlYWRzIGl0CWExMjNiNWY3OTMyYmYwYWNjOGNkNWMwY2MxMWM1YjE4NGI4NWZkMDkzODNiODRhNDllNzM4OGQzZTg5OTUwYmEKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGFkdmlzb3J5IGFybSBzZWVzIHRoZSB3b3JkcyBhcyB3b3JkcyDigJQgd2FybmVkIGFib3V0LCBuZXZlciByZWZ1c2VkCWEyMmYzMzFhOWU3YTlkYWVkNzIwZWEyYzJmY2NmMjQ1NmVmOTQ0YTQwYWNmZWZjYTFkZTExMTA3MjcyNjczOTYKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGFybWVkIGNoZWNrIGlzIGEgZ3JhbW1hciBvZiBwbGFpbiBmb3Jtcywgbm90IGEgbGlzdCBvZiBkYW5nZXJvdXMgb25lcwlmMGE0M2MyNWE4Y2EyMjc0Nzc0Yzc3NTI4OTdiOGNjY2YzNTA2Y2RmNWEyODc3NWZmZTcxNWZkZTZlOWFjMDM5CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBhcm1lZCBncmFtbWFyIHJlYWRzIHdvcmRzLCBxdW90ZWQgY29kZSBhbmQgaGVyZWRvY3MgYXMgdGhlIHNoZWxsIGRvZXMJZTM1ZjQ1NmZjYzA0YzkzZjNkZmNiNTE0NzQzOGIwZWI5NDhkZTg2Y2NmNjIwN2VmYWVmYWQxODFjMjYwNzZiYwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgY2xhc3NpZmllciBzdGF5cyB1bmRlciBpdHMgY29zdCBib3VuZAliMGRlZjAwOTRlNmM4NjVjNzFhZGI3YjYwN2U1NzhhZjc5ODMzZWE4YTJjMGFjMTMzNmU1MTZjNmY1Mjc0MGY5
  ```
  --- last 10 line(s) of stderr (of 295 after folding 295 raw)
  # mean 8.39 µs per call over 465 literals
  1..20
  # tests 20
  # suites 0
  # pass 14
  # fail 6
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 40438.618584
  ```
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · ms:52048
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · ms:28170
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · ms:24338
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · ms:47782
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · ms:92255
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:d7698f801ef5dddcb26ee98ae13861548073ac3426ce86bd79bacb4d833cfd82 · ms:31486
