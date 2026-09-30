# Task ADR-075-T3: A campaign in the checkout names who it exposes

**Depends-on:** T2
**Covers:** F-11, UC3-S1, UC3-S2, UC3-S3
**Estimated scope:** S (one listing, one line)
**Owner:** unassigned
**Produces:** none
**Consumes:** `--in-place` and `QUALITY_HARNESS_CAMPAIGN_CHILD` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `exposed processes are named`, `nobody exposed says nothing`, `an unreadable list is said`

## Goal

Before a run applies its first mutant in the checkout — `--in-place`, `--repoint --write` or `--narrow --write`, never the isolated child — it names every other process whose command line names the checkout, as advice, and runs. Where it cannot list processes, it says so and runs.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | the listing before the first mutant applied in the checkout |
| `tests/mutate-isolation.test.mjs` | edit | remove `todo` from the exposure test |

## Ordered Steps

1. [S1] Remove `todo` from the exposure test and record the red run with `adr-verify` (TDD red). [proof: acceptance]
2. [S2] Before the first mutant applied in the checkout, list processes with `ps -Ao pid=,args=`; `QUALITY_HARNESS_PROCESS_LIST` names another lister, the test's seam. Keep those whose arguments contain the root's real path, and drop this process, its ancestors and its children. For each one left, say "mutate: an in-place mutant is live for pid N (<command>)". The isolated child skips this, because its tree is private.
3. [S3] If the lister cannot start or exits non-zero, say "mutate: could not look for processes running this checkout (<reason>)" and run. Windows has no `ps`, so it takes this arm, and the test asserts that arm there instead of skipping: a skipped test prints `# SKIP`, which the Acceptance count would read as missing.
4. [S4] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/mutate-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (an in-place campaign names the processes running this checkout, and says when it could not look)' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an in-place campaign names the processes running this checkout, and says when it could not look` | `tests/mutate-isolation.test.mjs` | no line when nobody is exposed; both sleepers named; could-not-look (and only that arm on win32) | F-11, UC3-S1, UC3-S2, UC3-S3 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the listing and its test |
| 2 — something selects it | every run that applies a mutant in the checkout; deleting the call removes the line and the test goes red |
| 3 — the caller can discover it | the stderr lines |
| 4 — it is used | nothing measures this yet |

## Mutation Log
- 2026-09-30 · dea560e* · mutant killed · exit 1 · `scripts/mutate.mjs` · no exposed process is ever named · acceptance-sha256:7b54f7c65d8e284a9cea30dcb6e351675f7aaf1736463fe4d4089a6e920632e8 · covers:exposed processes are named
- 2026-09-30 · dea560e* · mutant killed · exit 1 · `scripts/mutate.mjs` · the campaign names itself, so a run nobody else sees still prints an exposure line · acceptance-sha256:7b54f7c65d8e284a9cea30dcb6e351675f7aaf1736463fe4d4089a6e920632e8 · covers:nobody exposed says nothing
- 2026-09-30 · dea560e* · mutant killed · exit 1 · `scripts/mutate.mjs` · an unreadable process list is silence, read as nobody exposed · acceptance-sha256:7b54f7c65d8e284a9cea30dcb6e351675f7aaf1736463fe4d4089a6e920632e8 · covers:an unreadable list is said

## Invariants

- Nothing is refused for exposure (spec UC-3 postcondition; CLAUDE.md §3).
- Class sweep, 2026-09-30: the runs that apply a mutant in the checkout are the ones `isolating` is false for — `--in-place`, `--repoint --write` and `--narrow --write` — and all three pass the one listing, placed after the in-place refusal. Only `--in-place` has a test; the two `--write` modes reach the same line and are not exercised here.

## Risks

- A process that names the checkout through a relative path or a symlink is not seen. The line is advice, and it says what it looked for.

## Stop Condition

Stop and ask if `ps` output differs between the macOS and Linux runners in a way the path match cannot absorb.

## Out of Scope

- A Windows lister (permanent: boundary: ADR-075 Out of Scope)

## Verification Log
- 2026-09-30 · dea560e* · exit 1 · `set -o pipefail …` · acceptance-sha256:7b54f7c65d8e284a9cea30dcb6e351675f7aaf1736463fe4d4089a6e920632e8 · ms:22945 · test-lock-sha256:6973ef9546cdf685e6c99d1d31d57aa88fa5eb1e817c6b176a3036d1cabfb047 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSBjYW1wYWlnbiBsZWF2ZXMgdGhlIHdvcmtpbmcgdHJlZSBieXRlLWlkZW50aWNhbCBhbmQgaXRzIG11dGFudHMgbmV2ZXIgYXBwZWFyIHRoZXJlCTc2N2I1ZjMzYWQ5YWFhODY1MzIxOTU2NGQxNzNlMGNlYWYzOGE5ZmMxYjczNjAyMzdhNmIxMGMzYjFiZGEwYzkKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgY2FtcGFpZ24gc2F5cyBpdHMgbG9hZCBsaW5lIG9uY2UsIGluIHBsYWNlIGFuZCBpc29sYXRlZAk5OTE5NjdlMzQwZjk2ZmNmMjVhM2I1ODI3OGFlZTE5YTgyNGRlN2JhZjFmNzU1ODQxMWVmZTg5NzRlNjI0ZTllCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGNhbXBhaWduIHN0b3BwZWQgd2l0aCBTSUdURVJNIHJlbW92ZXMgaXRzIHdvcmt0cmVlCWJkNmVhNGU4YzE1ZjllOTZhZTg4MGZlMTkzYzM1NjVkNTE4MzY5ZDRiNGZmZTdhODc0ZWY0MmViOTRiNTRlYzYKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgY2FtcGFpZ24gdGhhdCBjYW5ub3QgaXNvbGF0ZSBzdG9wcyBhbmQgbmFtZXMgLS1pbi1wbGFjZSwgd3JpdGluZyBub3RoaW5nCWUxZjcxMmFhMDUwNWUwNWMzNzZmNjNkMzhlMWE5MDc1MzFmYjU1NDI2NDYyZjc0MjRiMWE0NjllZTQ5MDQzZWQKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEga2lsbGVkIGNhbXBhaWduJ3Mgd29ya3RyZWUgaXMgcmVtb3ZlZCBieSB0aGUgbmV4dCBydW4sIGFuZCBzYWlkCWNmYTIyYWY4NDU0ZDk3YzUzOWU1YmQ1M2MxZjU1ODZmNDExYWZmMDNmNTcxZDQ2Y2UzY2UxYmQ0OTM0MzJhZTkKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgc2Vjb25kIGNhbXBhaWduIHdhaXRzIHdoaWxlIGFuIG9ycGhhbmVkIGNoaWxkIG9mIHRoZSBmaXJzdCBzdGlsbCBydW5zCTQ0ZGI2MDhjYjU0N2I2MGU1N2QxM2Y2NzdmMmJiYjE4NzJiNzU1OWJjMDJmMzVhMTM2NDczNjA3MTRhNjlhOGMKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgdmVyZGljdCBjYWNoZSB0aGF0IGNhbm5vdCBiZSB3cml0dGVuIGJhY2sgaXMgbGVmdCBhcyBpdCB3YXMsIGFuZCBzYWlkCWYyZjQ4N2FkNTY2NTdlYTM4MGNjNWI5YjY4ZmQ0MGMzZDgxZDQ0ZGJiZTdkYTE2ODA2YzlkOGZkZDFjMWE3MGUKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWFuIGluLXBsYWNlIGNhbXBhaWduIG5hbWVzIHRoZSBwcm9jZXNzZXMgcnVubmluZyB0aGlzIGNoZWNrb3V0LCBhbmQgc2F5cyB3aGVuIGl0IGNvdWxkIG5vdCBsb29rCWY4YjUxOGQwYjZmNDkyMzBjOTY4MWU1OGVmYjI0OTViMWMyMDk3NDQ3ZmI3ZTBjOWE2MzI2YTdkZDY0YTA2Y2YKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWFuIGlzb2xhdGVkIGNhbXBhaWduIHJldXNlcyBhbmQgcmV0dXJucyB0aGUgY2hlY2tvdXQncyB2ZXJkaWN0IGNhY2hlCTg5YjM2MWJkYTBmMDc5MjE5NjlmZWQ3NzAxZmM1OGUwOTljNmQyYTQ3ZmEyY2ZjNTM5OWNjMjIzZTA1OTA4ODMKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWFuIGlzb2xhdGVkIGNhbXBhaWduIHJ1bnMgZXhhY3RseSB0aGUgZW50cmllcyBhbiBpbi1wbGFjZSBvbmUgc2VsZWN0cwk5NTgwZGIyZDgyYzRlZGI5NmUyNzNjN2VhYjQ4ZjBlMTMzMWMzYzVlMTkyYzc2MTkxMmQwMTYwNGU5OGQ0NzZiCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiBpc29sYXRlZCBjYW1wYWlnbidzIHdyaXR0ZW4tYmFjayBjYWNoZSBpcyBvbmUgQ0kncyBtZXJnZSBqb2IgY2FuIHJlYWQJNmZiMzZhOWZmNGVkNjFlMWIzOWMwODc0MjJiZWQzYmJiOGJkNDYxMmY2NTYzODQ0OTJjNWJmZDI2ODQ5NDcxNQpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYW4gaXNvbGF0ZWQgcnVuIGFuZCBhbiBpbi1wbGFjZSBydW4gb2YgdGhlIHNhbWUgZW50cmllcyBnaXZlIHRoZSBzYW1lIHZlcmRpY3RzCTgxNWE5Y2U5MjIxNTg1ODQyNWMxZWRhYzQ0ZDMzNzdmYjMzY2Y1YTRhYjViN2E3NWVjN2JiNDcyODA4MDUwZTgKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWFuIHVuY29tbWl0dGVkIHRlc3QgZWRpdCBhbmQgYW4gdW50cmFja2VkIHRlc3QgYXJlIGdyYWRlZCBhcyBhbiBpbi1wbGFjZSBydW4gZ3JhZGVzIHRoZW0JN2FhZWQ4Mjk4OTFiMDFkNjQ3NGU1OWE1YWI5MWQyNTVjN2RhZWQwZWQyZDFmNWY2OTdjYWM1OWVkZmIyNDgyNg
  ```
  --- last 10 line(s) of stdout (of 109 after folding 109 raw)
    ...
  1..13
  # tests 13
  # suites 0
  # pass 12
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 22886.792083
  ```
- 2026-09-30 · dea560e* · exit 0 · `set -o pipefail …` · acceptance-sha256:7b54f7c65d8e284a9cea30dcb6e351675f7aaf1736463fe4d4089a6e920632e8 · ms:36300
- 2026-09-30 · dea560e* · exit 0 · `set -o pipefail …` · acceptance-sha256:7b54f7c65d8e284a9cea30dcb6e351675f7aaf1736463fe4d4089a6e920632e8 · ms:35595
- 2026-09-30 · dea560e* · exit 0 · `set -o pipefail …` · acceptance-sha256:7b54f7c65d8e284a9cea30dcb6e351675f7aaf1736463fe4d4089a6e920632e8 · ms:35928
