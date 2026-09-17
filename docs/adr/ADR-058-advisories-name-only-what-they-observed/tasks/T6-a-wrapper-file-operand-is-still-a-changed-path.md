# Task ADR-058-T6: A wrapper's file operand is still a changed path

**Depends-on:** T5
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the wrapper-operand check before printsOnly`, `a read without a wrapper operand still skipping its arguments`, `each named test actually running`, `the regression suites that pin path extraction`

Added 2026-09-17. A cold review of ADR-059's draft found that T3 and T5 skip every token of a print-only or read-only segment except a redirect target, including the words `commandInvocation` peels off before the command: a wrapper and its options. Measured the same day in a scratch repository on macOS: `/usr/bin/time -o docs/timing.md wc -l docs/a.md` creates `docs/timing.md`, and `/usr/bin/time wc -l docs/a.md` changes nothing. At `4e9c79a`, `bashMarkdownMutationPaths` returns no path for `touch b.log; /usr/bin/time -o docs/timing.md wc -l docs/BACKLOG.md` or for `touch b.log; time -o docs/timing.md echo x`. Before T3 and T5 it named `docs/timing.md`. That is a real write left unnamed — the fail-open direction.

## Goal

A segment is print-only or read-only only when no word before its command (a wrapper, a wrapper option or operand, an environment assignment) names a Markdown file; otherwise every candidate in it stays.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the test below |
| `plugin/scripts/lifecycle.mjs` | edit | `printsOnly` in `bashMarkdownMutationPaths` is false when a word before `invocation.index` names a Markdown file |

## Ordered Steps

1. [S1] Add the test with real assertions and see it fail on an assertion (TDD red).
2. [S2] Compute whether any of `invocation.words.slice(0, invocation.index)` passes the extractor's own Markdown test, and make `printsOnly` false when one does.
3. [S3] Run the fence green and record mutants: drop the wrapper check; check the words after the command instead of before. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a wrapper file operand is still a changed path)$' tests/advice-accuracy.test.mjs 2>&1) \
  && for name in 'a wrapper file operand is still a changed path'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/advice-accuracy.test.mjs tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a wrapper file operand is still a changed path` | `tests/advice-accuracy.test.mjs` | `/usr/bin/time -o docs/timing.md wc -l docs/BACKLOG.md`, `time -o docs/timing.md echo x` and `/usr/bin/time -o docs/timing.md mrw read notes.md` beside a write yield `docs/timing.md`; `/usr/bin/time wc -l docs/BACKLOG.md` beside a write still yields no path | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `analyzeTranscript` records these paths for every mutation; S3's mutants remove the check |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | commit and Stop advisories on a session that bounds a read with `time -o` |

## Mutation Log
- 2026-09-17 · 4e9c79a* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the check is never applied, so time -o docs/timing.md is dropped again · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · covers:the wrapper-operand check before printsOnly
- 2026-09-17 · 4e9c79a* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the words after the command are checked, so a plain wc -l docs/BACKLOG.md names its argument again · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · covers:a read without a wrapper operand still skipping its arguments
- 2026-09-17 · 4e9c79a* · mutant killed · exit 1 · `tests/advice-accuracy.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · covers:each named test actually running
- 2026-09-17 · 4e9c79a* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a git revision such as origin/main:docs/x.md resolves as a changed path; tests/lifecycle.test.mjs kills it · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · covers:the regression suites that pin path extraction

## Invariants

- T3 and T5 keep skipping the arguments of a segment with no Markdown word before its command.

## Risks

- A wrapper whose file operand is not `.md`-shaped (`time -o timing.txt`) was never a candidate and stays outside this extractor.

## Stop Condition

Stop and ask if a `tests/lifecycle.test.mjs` test about Markdown-only changes (BACKLOG §174) goes red.

## Out of Scope

- The rest of ADR-059's class (deferred: docs/adr/ADR-059-a-read-only-command-names-no-changed-path.md)

## Verification Log
- 2026-09-17 · 4e9c79a* · exit 1 · `set -o pipefail …` · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · ms:205 · test-lock-sha256:a923f6bd667225940e1cab7acb6e4740ce66fd0cff55cdfbfd3f27fff2510e71 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIGNvbW1pdCBpbiBhbm90aGVyIHJlcG9zaXRvcnkgZG9lcyBub3QgYXJtIHRoaXMgcmVwb3NpdG9yeSdzIGNvbW1pdCBhZHZpc29yeQlmYjEwMTkyMjNiNDQ1YmJkNWQyY2FjNTk1Y2RhNGU3MmExNzk1ZDAwZTYxMzgyZDRlYzg5MWJjOTJkOThhMTViCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgY29tbWl0IHdob3NlIHJlcG9zaXRvcnkgY2Fubm90IGJlIHJlc29sdmVkIHN0aWxsIGFkdmlzZXMJZDk2MjUxOWI4OWUwOTNlZTA1OGJhZGI0Zjc2NDEwNDFmMjM1YzE5ZDI4MGUxZDU5MTViMTRlZWUxODc5YTRjNQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQgd3JhcHBlciBkb2VzIG5vdCBsYXVuZGVyIGEgbXV0YXRpb24JOTdjM2NlOTJhMDYyMTFlNWNmMDcyNzE3ZTQ5YzI5MDA5MTcwZWJmMDI4MzI5ZDIxNjgzYjliYjg2YTE0NGMxMgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQtd3JhcHBlZCBjaGVjayBpcyBhIGNoZWNrCTBjMWM2MzZlMTBmZDYzNGIwMTUwODcxZjUzYjdjMjY2YmE3YjQzZjI1NjNjN2ZiZjUwZDE4NDI5MWY4ZTViN2QKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYSB3cmFwcGVyIGZpbGUgb3BlcmFuZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAliMGJhNjY2OTdkY2ZjYWY0ZWE0YmM0OTQ5MzlmN2U2NWIxMzU4ZWI3YmIyZTJmZTVmZWU3YzM2MDAzNWJhNzQ0CmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgd3JpdGUgYmVzaWRlIGEgcmVhZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAk0MjE0MmE4NjA2ZmQ2MWIzNTYwOTYyODFhNmFiZGFiYzlmYWQ5ZmU1NjcxYzFjOTJjZGM3M2NiNzI3Yjg4NTYzCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWFuIGVjaG8gcmVkaXJlY3QgdGFyZ2V0IGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTRiNjI4ZDYwOGQ2MGU5YTVmNzFlMjViM2JkZjRjNjQ2YzZkNTc2N2RiMmE0NDViNzY1NDAyYzU5Nzg3Y2FmM2UKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJZWNobyBhbmQgcHJpbnRmIGFyZ3VtZW50cyBhcmUgbm90IGNoYW5nZWQgcGF0aHMJZDU1NmNjNzIyMDQ2Zjg3YjIwYzRlOTk3Y2MzMDA3NTZjMjAwY2MwYWM1Y2EzNTliNTgzY2JhZmIzNzkxMmM2ZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwltcncgcmVhZCBpcyBhIHJlYWQsIG5vdCBhbiB1bnByb3ZlbiB3cml0ZQliOWMyNjJiNGU2MzdiM2JlNTA1N2M1YzU4OGFmZTFiM2IxYTAwMWNmMWYwYzdmNWVjMmM1MzUzOWQ1YTI4MDcyCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCW1ydyB3cml0ZSBpcyBzdGlsbCBqdWRnZWQgYXMgYSB3cml0ZQk4MTljNTZkYzg3YTczZDI0MzlkMDY5MjlhNTAyZjVkMGQ4MzcwNWQ2OGE2Mzk4MmUyNGFiODNmZDc0MWFmYzQzCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCXJlYWQtb25seSBhcmd1bWVudHMgYXJlIG5vdCBjaGFuZ2VkIHBhdGhzCTExMTUwYTY3ZWUzOTBiZGM2M2UzMTA2YWExODcwNmVmNDEyOWM1NjM5MzQzYzc2NGU3NDVhM2MxZmU2ZjAwNGMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJdGhlIGNvbW1pdCBnYXRlIGlzIHNpbGVudCBhZnRlciBhIHBhc3NpbmcgdGltZW91dC13cmFwcGVkIGNoZWNrCTY3MGEwODYxZDA2YTYzM2FiYWIwMzUzNmZkN2JhYmU2MjMzMjFjOWMwODE3ZDRkOGQxM2RiMTMwZmQwNWY4M2U
  ```
  ```
- 2026-09-17 · 4e9c79a* · exit 0 · `set -o pipefail …` · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · ms:23983
- 2026-09-17 · 4e9c79a* · exit 0 · `set -o pipefail …` · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · ms:23427
- 2026-09-17 · 4e9c79a* · exit 0 · `set -o pipefail …` · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · ms:23395
- 2026-09-17 · 4e9c79a* · exit 0 · `set -o pipefail …` · acceptance-sha256:62fd35f368c9f4d53556dcbe728db6405246bec5844a37552e6522bd26429c5e · ms:23562
