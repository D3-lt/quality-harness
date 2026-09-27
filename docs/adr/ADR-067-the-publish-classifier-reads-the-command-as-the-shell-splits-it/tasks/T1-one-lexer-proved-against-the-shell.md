# Task ADR-067-T1: One lexer, proved against the shell

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (a new module and its test)
**Owner:** unassigned
**Produces:** `shellWords()` in `plugin/scripts/shell-words.mjs`; the differential test and its row corpus
**Consumes:** none
**Data dependency:** hermetic (needs `bash`; `zsh` is used where present and its absence is logged)
**Proof map:** v1
**Rests-on:** `argv equals the shell's`, `data is not a command`, `an incomplete lex is reported`, `no real git runs`

## Goal

`shellWords(text)` returns the simple commands a POSIX shell runs, with `argv`, `assignments`, `dynamic`, `heredocs`, `substitutions`, per-word quote provenance, pipeline position and `complete`, as ADR-067 Decision 1 defines them. On the lexing fixtures, its argv equals the argv a real `bash`, and `zsh` where present, hands a recording stand-in. The expected execution differences (Decision 2) are data in the test, not exceptions in the lexer.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/shell-words.mjs` | new | the lexer |
| `tests/shell-words.test.mjs` | new | unit rows and the differential test against real shells |
| `tests/mutations.json` | edit | lexer mutants |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red): the module does not exist, so each fails on its import.
2. [S2] Write the differential harness (ADR-067 Decision 2):
   - a scratch working directory, and `PATH` holding only a directory of recording stand-ins (`git`, `echo`, `printf`, `cat`, `node`, `python3`), each appending its name and argv, NUL-separated, to a file named by an environment variable;
   - the shell invoked by its absolute path;
   - rows naming git by an absolute path, or needing a real runtime, rewritten to the stand-in or marked lex-only, and never executed as written.

   Before any row runs, a probe row (`/usr/bin/env git --version`) must reach the stand-in, or the harness stops. That is the `no real git runs` check.
3. [S3] Implement `shellWords`: one pass over the text, with quotes, backslash escapes, backslash-newline, operators, comments, heredocs (`<<`, `<<-`, a quoted delimiter), `$(…)` and backtick spans (nested), and brace expansion of comma lists. Words holding `$`, a backtick, a glob or a `{a..b}` range are marked dynamic, not expanded.
4. [S4] Measure what `bash -c` and `zsh -c` run before an unclosed quote or heredoc, and write it into the incomplete-lex test as data. [proof: acceptance]
5. [S5] Record mutants with `adr-verify --mutant`:
   - a double-quoted backslash no longer escapes;
   - a heredoc body is lexed as commands;
   - brace expansion drops its second alternative;
   - `complete` is always true.
   [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/shell-words.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (the lexer.s argv is the argv the shell hands git|quoted text, heredoc bodies and comments are data, not commands|an incomplete lex says so and keeps what it read)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the lexer's argv is the argv the shell hands git` | `tests/shell-words.test.mjs` | on the lexing fixtures, the lexer's argv equals the recorded argv under bash (and zsh when present), including `git {-c,x=y} push` → `git -c x=y push` and `eval "git push" "-h"` → `git push -h`; the listed execution differences (a push behind an OR-list whose left side succeeds, the lex-only rows) are asserted as differences; the isolation probe reaches the stand-in (the dirty twin: a lexer that splits inside quotes fails it) | none | S1, S2, S3 |
| `quoted text, heredoc bodies and comments are data, not commands` | `tests/shell-words.test.mjs` | the six data rows of `KNOWN_FALSE_REFUSALS` (all but the `eval … -h` row, whose git runs for help) yield no command whose argv starts with git, and carry their quote provenance; the same text unquoted does yield one (the dirty twin); an `echo` whose output is piped to `bash` is marked as feeding a shell | none | S1, S2, S3 |
| `an incomplete lex says so and keeps what it read` | `tests/shell-words.test.mjs` | an unclosed quote or heredoc sets `complete: false` and returns the commands before it; a closed one sets `complete: true` | none | S1, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `shellWords` |
| 2 — something selects it | nothing until T2; T1 alone ships no served-path change |
| 3 — the caller can discover it | T2 imports it |
| 4 — it is used | T2's tables |

## Mutation Log
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · a double-quoted backslash no longer escapes · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · covers:argv equals the shell's
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · a heredoc body is lexed as commands · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · covers:data is not a command
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · brace expansion drops every alternative after the first · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · covers:argv equals the shell's
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · an incomplete lex is reported complete · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · covers:an incomplete lex is reported
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · a quoted operator no longer marks the word as code · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · covers:data is not a command
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · a pipe no longer says which command it feeds · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · covers:data is not a command
- 2026-09-27 · 826ec94* · mutant killed · exit 1 · `tests/shell-words.test.mjs` · the harness inherits the real PATH, so a row could reach a real git; the isolation probe must stop it · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · covers:no real git runs

## Invariants

- Pure: no process, no file, no environment read.
- One linear pass: a 6,000-line heredoc lexes within the test's time bound.

## Risks

- A shell difference between bash 3.2 (macOS), bash 5 (Linux CI) and zsh. Every row runs under every shell present, and a difference is recorded as data rather than smoothed over.
- Windows CI has no POSIX shell to diff against: the differential test is skipped there with that reason, and the unit rows still run.

## Stop Condition

Stop and ask if a `PUBLISHES` row's argv under a real shell differs from what the table claims the command publishes.

## Out of Scope

- Expanding variables (permanent: boundary: ADR-067 Alternatives)
- Arithmetic, `case`, function definitions (deferred: docs/BACKLOG.md §301, no table row uses them)

## Verification Log
- 2026-09-27 · 826ec94* · exit 1 · `set -o pipefail …` · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · ms:347 · test-lock-sha256:fa1b8f7dd3e7da61d05ce6db94bcdbf8e5adea86c17e1b3e0b8737affe0a66dd · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3NoZWxsLXdvcmRzLnRlc3QubWpzCWFuIGluY29tcGxldGUgbGV4IHNheXMgc28gYW5kIGtlZXBzIHdoYXQgaXQgcmVhZAkyYjA0NGEzNGMwYjNiZTkzZDRiODYzYmUwYWM1ODdjOTg0NDRjZTBjNTI5YjU4YWRjM2VmZjA1OGNmM2M1Y2JhCmJvZHkJdGVzdHMvc2hlbGwtd29yZHMudGVzdC5tanMJcXVvdGVkIHRleHQsIGhlcmVkb2MgYm9kaWVzIGFuZCBjb21tZW50cyBhcmUgZGF0YSwgbm90IGNvbW1hbmRzCTY1ZmNlMDI5YjE2ZTU4ZTdlOGYxODNiMWE2MzdhYmFmNTdiMDBkZjM0ZDVhNTBhNWE4NGRkMGU5Mzk1Yzc4ZGEKYm9keQl0ZXN0cy9zaGVsbC13b3Jkcy50ZXN0Lm1qcwl0aGUgbGV4ZXIncyBhcmd2IGlzIHRoZSBhcmd2IHRoZSBzaGVsbCBoYW5kcyBnaXQJZTkyYmM4YzdmMjIwMjQ3Zjc5OGNmOTEzMDNlNDIxMTIxY2ZiYWU2NjY4Zjk3MDAzM2JjYjkwODc5NWMyNGIwMg
  ```
  --- last 10 line(s) of stderr (of 40 after folding 40 raw)
    ...
  1..1
  # tests 1
  # suites 0
  # pass 0
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 156.427375
  ```
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · ms:630
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · ms:804
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · ms:1336
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · ms:779
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · ms:924
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · ms:766
- 2026-09-27 · 826ec94* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a3009ea65ccf7cd8a7640381db987abae2786ad59cc9ba0c9e981c637281efa · ms:1297
