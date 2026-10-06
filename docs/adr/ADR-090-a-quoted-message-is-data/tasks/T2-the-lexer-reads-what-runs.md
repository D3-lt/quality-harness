# Task ADR-090-T2: the lexer reads a heredoc body, a quoted substitution and a function body as the shell runs them

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (the lexer, its differential test, the publish tests and campaign entries)
**Owner:** unassigned
**Produces:** `shellWords()` readings: an unquoted heredoc body's substitutions, a parameter-adjacent substitution in double quotes, and a `function` body's commands
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an unquoted heredoc body's substitution is a command`, `a substitution after a parameter in double quotes is recorded`, `a function keyword body is read as commands`

## Goal

A publish the shell runs from an unquoted heredoc body, from `"$x$(…)"`, or from a `function NAME { … }` body
is refused on an unchecked tree, as the same publish written plainly already is; a quoted heredoc body, an
escaped `\$(`, and a `function` spelled as data stay data.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/shell-words.mjs` | edit | the three readings of ADR-090 Decision 2; no new field |
| `plugin/scripts/lifecycle.mjs` | edit | only if the walk needs it: `publishInCommand` (`:4181`) already recurses into `substitutions`, which is what selects the new readings |
| `tests/shell-words.test.mjs` | edit | one new test beside the 3 locks, using ADR-067 T1's recording stand-ins under bash and zsh |
| `tests/publish-command.test.mjs` | edit | two new tests beside the locks |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py` on both test files, then write the three tests and record the red
   run (TDD red). Red today: `publishCommandIn` returns null for `cat <<EOF⏎$(git push)⏎EOF`,
   `echo "$x$(git push)"` and `function g { git push; }⏎g` (measured 2026-10-06 at 73f930f).
2. [S2] In `shellWords`, lex the body of a heredoc whose delimiter is unquoted for `$(…)` and backtick spans,
   skipping a backslash-escaped `$` or backtick, and append each to its command's `substitutions`. A quoted
   delimiter's body is untouched.
3. [S3] In `shellWords`, record a `$(…)` right after a parameter expansion inside double quotes (`"$x$(…)"`), as
   `"$x $(…)"` and `"${x}$(…)"` already are.
4. [S4] In `shellWords`, read `function NAME {` and `function NAME () {` as a definition whose body's commands
   are commands, as `NAME() {` already is.
5. [S5] Record one killed mutant per Rests-on name and add each to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/shell-words.test.mjs tests/publish-command.test.mjs 2>&1) \
  && for t in 'a heredoc body, a quoted substitution and a function body are lexed as the shell runs them' 'a publish run from a heredoc body, a quoted substitution or a function body is refused' 'a heredoc body, a parameter and a function name that only hold a publish stay data'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a heredoc body, a quoted substitution and a function body are lexed as the shell runs them` | `tests/shell-words.test.mjs` | each row of the next two tests, plus the CR-delimited csn rows `cat <<EOF⏎EOF\r⏎cat <<'EOF'⏎$(git push --force)⏎EOF` (behavioral-contract-cases.ts:1009) and `cat <<EOF\r⏎$(git push)\r⏎EOF\r⏎` (:1045), run under bash and zsh with recording stand-ins on `PATH` in a scratch directory: the argv each shell hands the stand-in `git` equals what `publishCommandIn` names, or null when the stand-in records nothing. A row whose shell is absent is skipped with that reason. This measures the record's reading of these rows | none | S1, S2, S3, S4 |
| `a publish run from a heredoc body, a quoted substitution or a function body is refused` | `tests/publish-command.test.mjs` | unarmed and unchecked, each is `deny`: `cat <<EOF⏎$(git push)⏎EOF`, ``cat <<EOF⏎`git push`⏎EOF``, `cat <<-EOF⏎⇥$(git push)⏎⇥EOF`, `echo "$x$(git push)"`, `echo "${x}$(git push)"` (refused today: a regression row), `function g { git push; }⏎g`, `function g () { git push; }; g`. CLEAN twin: after `qh-check`, none is `deny` | none | S1, S2, S3, S4 |
| `a heredoc body, a parameter and a function name that only hold a publish stay data` | `tests/publish-command.test.mjs` | unarmed and unchecked, none is `deny`, and each gets the mention advisory: `cat <<'EOF'⏎$(git push)⏎EOF`, `cat <<"EOF"⏎$(git push)⏎EOF`, `cat <<EOF⏎\$(git push)⏎EOF`, `echo "$x"`, `echo '$x$(git push)'`, `echo function g { git push; }` | none | S1, S2, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `publishInCommand` recurses into every command's `substitutions` and walks every command; the refusal test drives the real PreToolUse hook, so dropping a reading turns its rows red |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the PreToolUse decision |
| 4 — it is used | nothing measures this yet |

## Mutation Log
- 2026-10-06 · 2cb2d28* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · an unquoted heredoc body is data again: its substitution runs unread · acceptance-sha256:85f6711cf84972b49b1c593b23327755cc3063c51f09f15798015fcdfd3d3a3f · covers:an unquoted heredoc body's substitution is a command
- 2026-10-06 · 2cb2d28* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · a parameter swallows the $ of the substitution after it · acceptance-sha256:85f6711cf84972b49b1c593b23327755cc3063c51f09f15798015fcdfd3d3a3f · covers:a substitution after a parameter in double quotes is recorded
- 2026-10-06 · 2cb2d28* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · the function keyword is a program again and its body one command · acceptance-sha256:85f6711cf84972b49b1c593b23327755cc3063c51f09f15798015fcdfd3d3a3f · covers:a function keyword body is read as commands

## Invariants

- A quoted heredoc delimiter's body is never read as code.
- No new field in `shellWords`' result; `complete` keeps its meaning.
- ADR-067's differential test stays green row for row.

## Risks

- `freshDirectoryVariables` (`lifecycle.mjs:5034`) and `commitOnlyCommand` read `substitutions`; a heredoc
  command is already excluded by both (`:5047`, `:823`), so more substitutions there change neither. The full
  `tests/publish-command.test.mjs` run in the fence shows it.
- A shell whose heredoc reading differs from bash's: zsh is measured beside bash, and a difference is recorded
  per row, as ADR-067 Decision 2 does.

## Stop Condition

Stop and ask if bash or zsh runs a publish from a row this task calls data, or none from a row it refuses; or if
a locked test would have to change.

## Out of Scope

- `${ cmd; }` (bash 5.3 or later) — ADR-090 Out of Scope. A path-named wrapper — T3.

## Verification Log
- 2026-10-06 · 2cb2d28* · exit 1 · `out=$(node --test --test-reporter=tap tests/shell-words.test.mjs tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:85f6711cf84972b49b1c593b23327755cc3063c51f09f15798015fcdfd3d3a3f · ms:78515 · test-lock-sha256:b01326beb5b8332eccb7bd227f92f0ffb7f281068bf853cfb977900ed66ff424 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCVBvd2VyU2hlbGwsIGFuIG9mZmVyZWQtb25seSBzZXNzaW9uIGFuZCB0aGUgcmV2aWV3ZXIgZ3VhcmQgYXJlIHVuY2hhbmdlZAk4MWY0NmEyYzU1NDBkMTZjNGFjMzQwZGFiMDMwOTdlOGRiY2IyMDM3MTgxNmJiMDdiNzJmNmU3M2VlMjAzN2U2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCVdpbmRvd3Mgc3BlbGxpbmdzIG9mIGEgcHVibGlzaCBhcmUgcmVjb2duaXNlZCwgYW5kIGxvb2stYWxpa2VzIGFyZSBub3QJOWMzNDFiN2FjZTZlYzdlMzA0YTY4ZWFjM2U5MGI3NzQxMDc5ZDYzYWEzODRlOGEyZDZjYzc0NDRkZjRjMGIyYQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIGJyYWNlLWJ1aWx0IHB1Ymxpc2ggaXMgcmVmdXNlZAkwYThlNGQ5ZDAzZjg4MGM3NmI3OGNhNzc1OTRlOWNhNDQwNmY0NjBiMDdkYzY3ZjAxYmM2ZDk4OTI5MGNlYWU3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgaGVyZWRvYyBib2R5LCBhIHBhcmFtZXRlciBhbmQgYSBmdW5jdGlvbiBuYW1lIHRoYXQgb25seSBob2xkIGEgcHVibGlzaCBzdGF5IGRhdGEJNjU5Y2EzZjZhYzc4ZDdhMjk3MTEwMTUxOWNmZWExYmJjMDk5OTIzZjhmNDEzNDliMjUwMTgyNDg4ODBkNzhiYgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIG1lc3NhZ2UgdmFsdWUgdGhhdCBjYW4gcnVuIGNvZGUga2VlcHMgdGhlIHJlZnVzYWwJNTgyZWFlMTZlYjBmZGM0ZTAyYjMzMzBlNzQ0NzkzNjZiMzY2ZmUyOGNhODNhMDA0MWJiMDc5NmM4Y2FkMWQ5Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHB1Ymxpc2ggaXMgZm91bmQgYnkgYXJndiwgYXMgdGhlIHNoZWxsIHJ1bnMgaXQJZDdhNmJhYzRjM2ZhYzQyYzU4NGQyMDFlMmY5YjRkMzZjZmVmNWU5ZWQ4NDNiMmI1N2M0YzYyNGRiOWQzZmI5Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHB1Ymxpc2ggcnVuIGZyb20gYSBoZXJlZG9jIGJvZHksIGEgcXVvdGVkIHN1YnN0aXR1dGlvbiBvciBhIGZ1bmN0aW9uIGJvZHkgaXMgcmVmdXNlZAlhNDJlNzY1NWJiNjQyODc5YTBlNDkwMGE4YTEyNmIwMTI3Y2UxZDUyNGYwYjQyODJkMWNjNmU0MDkyMWUxOTE3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgcXVvdGVkIGNvbW1pdCBtZXNzYWdlIGlzIGRhdGEgdG8gdGhlIGFybWVkIGFuZCBmcmVzaC1yZXBvc2l0b3J5IGRvd25ncmFkZXMJZjdjYWZjYzFlOGI4YmMxMDFmYzkxZTYwMzNmMDQwOWMzYmNlYjA1YzhhNGY3NmM1MTMyZjhlZDlkNmFiNWFhMwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHNpbmdsZSB0ZXJtaW5hbCBuZXdsaW5lIGVuZHMgYW4gdW5hcm1lZCBmcmVzaCBjb21taXQgbGlrZSB0aGUgZW5kIG9mIHRoZSB0ZXh0CWQ1ZTRhNGE1MjUwY2Y5Y2E5Y2FmMjEyYzdkMjU2YTc2ZWFiMDU4MTA2N2JkMTkzZGRmN2UzNTIwYjYyMGNlYTAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYSBzdHJpbmcgaGFuZGVkIHRvIGEgc2hlbGwgYnkgb3Muc3lzdGVtIG9yIG9zLnBvcGVuIGlzIHJlYWQgYXMgdGhhdCBzaGVsbCByZWFkcyBpdAllNzFkY2YxNGI4OTlmZGQ3NTJhZjc2YmQwNzc1YTBlYmNhZGUyYzA1YTdhNWNhNzcxMmE4ZWNmYjBjNjcxMDA3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgdGFyZ2V0IHJlcG9zaXRvcnkgY29uZmlnIGRvZXMgbm90IHN3aXRjaCBvZmYgdGhlIGluamVjdGVkIGhvb2sJODVmYjZhOTkyMDU5ZDVmNzc4OTgwMzkwNDRiNmMwOGRkNzQ2Mzk0MzlkNDRiODNkMTA2MzAzZjI0ZmQ3Mzc0Zgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhbGlhcyBpcyByZWFkIGFzIGdpdCBleHBhbmRzIGl0LCBhbmQgYSBjYWxsIGluc2lkZSBhIHN0cmluZyBpcyBkYXRhCTEyYmEyNjBmOGM0Mjk5YTQ5MDg2Y2M4MjA5YTIzYzk2MzIwNGQ1YTgzYzdhNGZkZDljZmJmNmQyMjA2YjA1MDMKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJndiBsaXN0IGluIG5vZGUgb3IgcGVybCwgYW5kIGFuIGFsaWFzIHNldCB3aXRoIC1jLCBhcmUgcmVhZCBhcyB0aGUgcHVibGlzaCB0aGV5IHJ1bgk5ZGI2ZjNiMjk5MzIyZGYzNWU4NzhhMjBiMTQxNWJiMTI2NjQwMzgwZTJhYjFkMzg0ODcyOTAzYTY4ODUxYjUyCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gbGVhdmVzIGEgY29tbWl0IGludG8gYSBta3RlbXAgZGlyZWN0b3J5IHRvIGdpdAk0NWFiNjMyMTlkYjdlMWMyNmQ0MDg5ZTZhNTRmNmEwNmY3OTA2YjVkNTFlY2RlODRmM2NiZWYxZDcyYTU1ZDRkCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gbGVhdmVzIGEgcGxhaW4gaW52b2NhdGlvbiB0byBnaXQJMTQ4NDY0NTA3MmYwMWQyMDVmNGJhZWFmZmNkNTc5N2QxMjczNGI0NWZmODIzOWQ0ZTYyZDJhZGYwMzA3MTZjMApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHJlZnVzZXMgYSBxdW90ZWQsIGVzY2FwZWQgb3Igc3Vic3RpdHV0ZWQgaG9vayBieXBhc3MJY2RjODAwYzE0MWNjNzFiYzVkNzVhNTczMjFlMzg4NjdlZWEwMDJiNjkzYmY5YWExYzRhMzg2MTg4MTY2ZDkxMgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHJlZnVzZXMgYSByZWRpcmVjdGlvbiBvciBhbiBhdHRhY2hlZCB2YWx1ZSB0aGF0IGhpZGVzIGEgYnlwYXNzCTY4NjI4ODFkZmY4Nzc0NWI4NTQ3MDcyYmFjMzk2NGM5MmU4YjZiMTIzYzllOWEzN2UxMzc4YTkyYzdiY2VmYzMKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgd3JhcHBlZCBnaXQgYW5kIGEgcmVhc3NpZ25lZCBob29rIHZhcmlhYmxlCTFlMzZiYWQwNDIwOWE2ZmJlZDkxMTYwMzA3OGEyMWEwYjE0ZDdmOWQxOWVhMTkzMWM4ZWIzMjg5ODk4YzY4Y2MKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGFyaXRobWV0aWMsIHdoaWNoIGNhbiBhc3NpZ24gYSB2YXJpYWJsZSBuYW1lZCBvbmx5IGluIGEgdmFsdWUJMzMzMTU2ZTBkYzg0YmIxOTliYjk5MjYwYjVhYzU2OGYzYjI4Y2U0YWI2M2I1OTZiM2M2YzE4MmVlZDlmZjNjOQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHJlZnVzZXMgd2hhdCB0aGUgc2hlbGwgZXhwYW5kcyBiZWZvcmUgZ2l0IHNlZXMgaXQJMjg1NzIyMmYzMmM2ZmIwNjQ4ZWEzMGY4YWM4ZDhkODQ3YzNkMGQ2N2FkYjA0YjllYzZhMDU3Y2FiZTU0ODU4ZQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHN0aWxsIHJlZnVzZXMgYSBkb2xsYXIgaXQgY2Fubm90IHBsYWNlIGFzIGEgZGlyZWN0b3J5CTk0MTBmM2M4YzU3ZjRmY2JiMWFjYTRiM2ZjZTFmYjdmNGI3MzFkZDNlZDJlOWNkMzNkN2QyODI4N2M2OTU1MDIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiBzdGlsbCByZWZ1c2VzIGV2ZXJ5IGZvcm0gdGhhdCBjYW4gZGlzYWJsZSB0aGUgaG9vawliMDczZGViYTA2OGI4MzNhZTU0NWFiMDQyNGY2OWM3MjU3NjAyZjMwM2UzMWVlZDk5NjIwY2NiYzUwMmFjMTczCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGluaGVyaXRlZCBnaXQgb3IgYmFzaCBlbnZpcm9ubWVudCBrZWVwcyBhbiB1bmFybWVkIGZyZXNoIGNvbW1pdCByZWZ1c2VkCThiNWRkYTMwMzg2YzdkNzg1MzI0OTA2MTY4YzZhMmNjOTM0MmMzNzZmZTBhOGQ4YTQxZmFlNjU5Y2YzY2ExMjkKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gb3ZlcnNpemVkIGNvbW1hbmQgaXMgc3RpbGwgcmVhZDogdGhlIHB1Ymxpc2ggYXQgaXRzIGVuZCBpcyByZWZ1c2VkLCBub3QgY3Jhc2hlZCBwYXN0CTVhOGZjY2IyYzMxNTZlNDQxYWYwZmMyNDFlYjFmNzYwYjEwZWQ5Y2NjOWJkYzhmYjVjNDMzYTk4ZmRiZTQ2N2QKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gdW5hcm1lZCBjaGFpbiB0aGUgdGV4dCBjYW5ub3QgcGxhY2UgaW4gYSBmcmVzaCByZXBvc2l0b3J5IGlzIHN0aWxsIHJlZnVzZWQJMTc1ZGJjYmExZTk3ZmRlMDBkOThjZDc1MzFlN2MyZWI3ZTliYmZmZTZiMjU3MzkwNDA1YjUwYTc2MDlmMTdjMApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiB1bmFybWVkIGNvbW1pdCBpbnRvIGEgcmVwb3NpdG9yeSB0aGUgY29tbWFuZCBjcmVhdGVzIGlzIGFkdmlzZWQsIG5vdCByZWZ1c2VkCTdiMzQ2YWIxNjAxM2MxZmJiYzMwOWUyNzdkNDM2ODNlNGVlZTMxZmVjYjEyMzZkYjhhMjNjYmZmZjNkNmFhMTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gdW5hcm1lZCBmcmVzaCBjb21taXQgaXMgcmVmdXNlZCB3aGVuIGFyaXRobWV0aWMgY2FuIHJlYXNzaWduIGl0cyBkaXJlY3RvcnkJNGM3MWI1NzM0OTQwMTc0MThmNDJiM2Q2MTJkMzRkMWI1YWZhZTY2Mzg0ZmQ2Njk4N2E1YTY4ZTVhMzI5Y2FmMwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiB1bmFybWVkIGZyZXNoIHN1YnN0aXR1dGlvbiBpcyBvbmUgZm9yZWdyb3VuZCBta3RlbXAgYW5kIG5vdGhpbmcgYWZ0ZXIgaXQJYTg3OWIwOGY2NTJlNjE2MjllN2RiNTM4YmQxNDE1N2MyZDdmOWZiYmQzYWZlNTcxZDcyYTM3N2M1ZmRlMTJjMwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlkYXRhIHRoYXQgbmFtZXMgYSBwdWJsaXNoIGlzIG5vdCByZWZ1c2VkLCBhbmQgdGhlIGtub3duIGZhbHNlIHJlZnVzYWxzIGFyZSBnb25lCWNhNGM2YzBjYzY4N2IzZmNkZTFiMmUxNjQwYmE1N2E1NWRmNjIyNGNiZjg2MDFkNDExNTkxNmQwN2U1OTFmYTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZHluYW1pYyBpbnZvY2F0aW9ucyBhcmUgbm90IHJlZnVzZWQsIGFuZCB0aGlzIHRlc3QgcGlucyB0aGF0IHRoZXkgYXJlIGEgbWVudGlvbiBhdCBtb3N0CWJlODY0N2IzNTczMzQ3OTgzNmU5OTQ4ODg5NWViNzliMDljMjNjN2FmNGI1OTZiZGUwOTQwOTJkOWU5MjdmZDAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZXZhbCBydW5zIGl0cyBzdHJpbmcsIHNvIGEgcHVibGlzaCBpbiBpdCBpcyBpbnZva2VkCWJmYWZiOGY4NjJhZjAxOTFkNjZiODNjNTcyYjdlYTczM2EwNjAyYzMwOTFjODdmOGJhNTE0MDY2NDg1MjgyYTkKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZXZlcnkgcHVibGlzaCBmb3JtIGlzIHJlY29nbmlzZWQsIHdpdGggdGhlIGludm9jYXRpb24gbmFtZWQJZjNlOGVkZmIwN2NkNWI1MTM5OWIzMzY1ZTQxN2JkNGY0MWVlYTU1NTIzNDgzNjE0ZDk3ZDk2NTVmYzdmZDgxYgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlnaXQgaXMgcmVjb2duaXNlZCBpbiBhbnkgY2FzZSBhbmQgdGhyb3VnaCBhIC5jbWQgc2hpbQlmMzNjZmVkMmQxZGI4ZGU4MGY5NWQ1OTEwMjdkOTdhNDdlOTBkMDhhNmIwZGUzOWE5MmI4NmI3ZjI5NzM2ZTJkCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCW5vdGhpbmcgdGhhdCBvbmx5IG1lbnRpb25zIGEgcHVibGlzaCBpcyByZWZ1c2VkCTdhZjhlNjlhOGJkZDZmZTg5ZWJhNDhkZjBmNTE0Mjc4OTRlZmRlNWIwNTJkOGMxZjEyNTI0ZDUzNmFlYTIyOTcKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJb25lIGxleGVyIHJlYWRzIHNoZWxsIHRleHQgZm9yIHJ1bGUgUAllMDFlMDAyNjYxNjkwMjk1ZjM1NGFmNjIzMzc1ZDk3NmUzNzU5NzhmMzE0NWExNjU1NjdiYzNhNDM5MjYzZmViCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRleHQgcGlwZWQgaW50byBhIHNoZWxsIGlzIHJlYWQgYXMgdGhlIHNoZWxsIHJlYWRzIGl0CWExMjNiNWY3OTMyYmYwYWNjOGNkNWMwY2MxMWM1YjE4NGI4NWZkMDkzODNiODRhNDllNzM4OGQzZTg5OTUwYmEKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGFkdmlzb3J5IGFybSBzZWVzIHRoZSB3b3JkcyBhcyB3b3JkcyDigJQgd2FybmVkIGFib3V0LCBuZXZlciByZWZ1c2VkCWEyMmYzMzFhOWU3YTlkYWVkNzIwZWEyYzJmY2NmMjQ1NmVmOTQ0YTQwYWNmZWZjYTFkZTExMTA3MjcyNjczOTYKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGFybWVkIGNoZWNrIGlzIGEgZ3JhbW1hciBvZiBwbGFpbiBmb3Jtcywgbm90IGEgbGlzdCBvZiBkYW5nZXJvdXMgb25lcwlmMGE0M2MyNWE4Y2EyMjc0Nzc0Yzc3NTI4OTdiOGNjY2YzNTA2Y2RmNWEyODc3NWZmZTcxNWZkZTZlOWFjMDM5CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBhcm1lZCBncmFtbWFyIHJlYWRzIHdvcmRzLCBxdW90ZWQgY29kZSBhbmQgaGVyZWRvY3MgYXMgdGhlIHNoZWxsIGRvZXMJZTM1ZjQ1NmZjYzA0YzkzZjNkZmNiNTE0NzQzOGIwZWI5NDhkZTg2Y2NmNjIwN2VmYWVmYWQxODFjMjYwNzZiYwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgY2hhb3Mgcm91bmQgb2YgNjI2OTM0YTogd2hhdCB0aGUgc2hlbGwgcmFuIGlzIHdoYXQgdGhlIGNsYXNzaWZpZXIgcmVhZHMJNDc5NDUyMjVlNDE1ZjQ0YjkzNTg1MmM0ZWYyN2RhN2VkOTNkNmNlOTJhMmViNDkwNThmNTEyNTM4YmUxYzg3Mgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgY2xhc3NpZmllciBzdGF5cyBsaW5lYXIgb24gYSBsb25nIGludGVycHJldGVyIHNjcmlwdAk0MTA2MDM1MmM2Y2QzOGJmMGIwMTgxMWJlODE4NmNhMmFmYzliOTg1YjgwMWZkNWUwNDNhN2ZmOGM1NGE0Njg0CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBjbGFzc2lmaWVyIHN0YXlzIHVuZGVyIGl0cyBjb3N0IGJvdW5kCWIwZGVmMDA5NGU2Yzg2NWM3MWFkYjdiNjA3ZTU3OGFmNzk4MzNlYThhMmMwYWMxMzM2ZTUxNmM2ZjUyNzQwZjkKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGZyZXNoLXJlcG9zaXRvcnkgcm93cyBjb21taXQgd2hlcmUgdGhlIGNsYXNzaWZpZXIgc2F5cyB0aGV5IGRvCWY3MTg3OWI2MTljMzI4MjEyOWQzMjM5MTM3NTc4ZWJiZjc0MjkwMzQ1NGMyMTA4M2E0NjRjNjhkNGZiZWY2ZDgKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIG1hc2tlZCBmcmVzaC1yZXBvc2l0b3J5IHJvd3MgY29tbWl0IHdoZXJlIHRoZSBjbGFzc2lmaWVyIHNheXMgdGhleSBkbwk2ZGU3YzBlNDBjYTQ3YzI0YmIyNmZiZjBjMDI5ZDhiMWJmMmZlNDQzMzg5ZTQ3MjkwYWMyNTJkMWNkNTgyNmYyCmJvZHkJdGVzdHMvc2hlbGwtd29yZHMudGVzdC5tanMJYSBoZXJlZG9jIGJvZHksIGEgcXVvdGVkIHN1YnN0aXR1dGlvbiBhbmQgYSBmdW5jdGlvbiBib2R5IGFyZSBsZXhlZCBhcyB0aGUgc2hlbGwgcnVucyB0aGVtCWFiYTk2ZTdiNDhjNDg3NDA2NWY0MzMzNzE2YTU5NTBiZTlhN2Q5NDIxMTJkMTc3NzBjMzhmZmVkMTU1NGEwYmMKYm9keQl0ZXN0cy9zaGVsbC13b3Jkcy50ZXN0Lm1qcwlhbiBpbmNvbXBsZXRlIGxleCBzYXlzIHNvIGFuZCBrZWVwcyB3aGF0IGl0IHJlYWQJMmIwNDRhMzRjMGIzYmU5M2Q0Yjg2M2JlMGFjNTg3Yzk4NDQ0Y2UwYzUyOWI1OGFkYzNlZmYwNThjZjNjNWNiYQpib2R5CXRlc3RzL3NoZWxsLXdvcmRzLnRlc3QubWpzCXF1b3RlZCB0ZXh0LCBoZXJlZG9jIGJvZGllcyBhbmQgY29tbWVudHMgYXJlIGRhdGEsIG5vdCBjb21tYW5kcwk2NWZjZTAyOWIxNmU1OGU3ZThmMTgzYjFhNjM3YWJhZjU3YjAwZGYzNGQ1YTUwYTVhODRkZDBlOTM5NWM3OGRhCmJvZHkJdGVzdHMvc2hlbGwtd29yZHMudGVzdC5tanMJdGhlIGxleGVyJ3MgYXJndiBpcyB0aGUgYXJndiB0aGUgc2hlbGwgaGFuZHMgZ2l0CWU5MmJjOGM3ZjIyMDI0N2Y3OThjZjkxMzAzZTQyMTEyMWNmYmFlNjY2OGY5NzAwMzNiY2I5MDg3OTVjMjRiMDI
  ```
  ```
- 2026-10-06 · 2cb2d28* · exit 0 · `out=$(node --test --test-reporter=tap tests/shell-words.test.mjs tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:85f6711cf84972b49b1c593b23327755cc3063c51f09f15798015fcdfd3d3a3f · ms:61440
- 2026-10-06 · 2cb2d28* · exit 0 · `out=$(node --test --test-reporter=tap tests/shell-words.test.mjs tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:85f6711cf84972b49b1c593b23327755cc3063c51f09f15798015fcdfd3d3a3f · ms:81331
- 2026-10-06 · 2cb2d28* · exit 0 · `out=$(node --test --test-reporter=tap tests/shell-words.test.mjs tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:85f6711cf84972b49b1c593b23327755cc3063c51f09f15798015fcdfd3d3a3f · ms:67437
