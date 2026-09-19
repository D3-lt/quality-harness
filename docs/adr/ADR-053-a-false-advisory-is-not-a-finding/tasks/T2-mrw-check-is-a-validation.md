# Task ADR-053-T2: A passing mrw --check is a validation for the commit gate

**Status:** superseded by ADR-060 — the clause this task proved read a command's text, which nothing does any more; its test was deleted with the classifier, so its fence now selects nothing
**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the mrw --check success arm`

## Goal

A completed `mcp__mrw__mrw_write` with `check: true`, or Bash `mrw write … --check`, that `commandSucceeded` advances `lastSuccessfulValidation` and does not leave `unprovenWritePending`. A write without `--check` still advises. Failed `--check` does not count as a validation.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `analyzeTranscript` treats a succeeded mrw `--check` as a recognised check, not lastUnprovenWrite |
| `tests/unread-advice.test.mjs` | edit | MCP and Bash `--check` PASS; dirty write without `--check` |

## Ordered Steps

1. [S1] Confirm the failing test for this task exists and is red. [proof: acceptance]
2. [S2] On succeeded mrw `--check`, set lastSuccessfulValidation / lastValidation and do not advance lastUnprovenWrite. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a passing mrw --check is a validation for the commit gate' tests/unread-advice.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a passing mrw --check is a validation for the commit gate` | `tests/unread-advice.test.mjs` | MCP and Bash `--check` PASS silence the commit gate; write without `--check` still advises | none — no spec | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | mrw `--check` arm in `analyzeTranscript` |
| 2 — something selects it | MCP `check: true` or Bash `--check` plus `commandSucceeded` |
| 3 — the caller can discover it | `unprovenWritePending` / PreToolUse |
| 4 — it is used | the unread-advice test |

## Invariants

- `mrw write` without `--check` stays UNPROVEN (ADR-047 / ADR-048).
- Failed `--check` does not advance lastSuccessfulValidation.
- Do not flip whole-command `isValidationCommand('mrw write --check && git commit')` unless PreToolUse is also made safe; this task is transcript-side.

## Risks

- Counting a failed `--check` as a validation. Mitigation: `commandSucceeded` required; dirty is write without `--check`.

## Stop Condition

`--check` PASS still leaves `unprovenWritePending`, or a write without `--check` goes silent.

## Out of Scope

- T1 compound Bash prefix
- Declaring `mrw write --check` as a VALIDATION_PATTERN for every compound

## Verification Log
- 2026-09-14 · a5c21a2* · exit 1 · `node --test --test-name-pattern 'a passing mrw --check is a validation for the commit gate' tests/unread-advice.test.mjs` · acceptance-sha256:db6559bf63eb04666a4defa51d27ca677a532a581bd862b34eaddc0e4c409b1e · ms:284 · test-lock-sha256:e3b2fdfe26dfe4c1ab6f7c324f09e678d1e609e7f748a36b26d461b501e09968 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3VucmVhZC1hZHZpY2UudGVzdC5tanMJUG9zdFRvb2xVc2UgaXMgc2lsZW50IG9uIGEgZmlsZSB0aGF0IGlzIG5vdCBhIFFIIHJlY29yZAlkNGVlZWJhZTc0Zjk5MTM5NTYwYzlhYjg3MGM4ODU1MjhkYWMyMGI3NGE5OTEwZWE1NDliZGU0MDFkOGM3MjgxCmJvZHkJdGVzdHMvdW5yZWFkLWFkdmljZS50ZXN0Lm1qcwlhIGdpdGlnbm9yZWQgV3JpdGUgYWZ0ZXIgYSBncmVlbiBjaGVjayBkb2VzIG5vdCByZS1vcGVuIHRoZSBjb21taXQgZ2F0ZQliMzM0YzBkNmI1OWJjZjI4Yzk1NWEyNjNmMWQzZjNhYWE3OGNhZWVhMWU2YWIzNThkZGZhOTYzNjgzYzcwYzlhCmJvZHkJdGVzdHMvdW5yZWFkLWFkdmljZS50ZXN0Lm1qcwlhIHBhc3NpbmcgbXJ3IC0tY2hlY2sgaXMgYSB2YWxpZGF0aW9uIGZvciB0aGUgY29tbWl0IGdhdGUJNWYzMjEzYWQwZjE5M2Y4OGE3MDY4YWRiMTgwMjY3NjExYmE2Nzk0OGU0ODM2ZjExYzU5ZDE5YmJhMzNmM2QzNQpib2R5CXRlc3RzL3VucmVhZC1hZHZpY2UudGVzdC5tanMJY29tbWl0IGdhdGUgZG9lcyBub3QgYWNjdXNlIHVudmVyaWZpZWQgd2hlbiB0aGlzIEJhc2ggYWxyZWFkeSBydW5zIGEgY2hlY2sgdGhlbiBnaXQgY29tbWl0CTlkYmUyOGUwOWU0MDFiOTE0Y2UzYTdhOWUzYjIxOTBjZDk1NTY2ODFmYTBiNzRjYzQ5ZDA5MmY4MmU5NmQ1ODI
  ```
  --- last 10 line(s) of stdout (of 28 after folding 28 raw)
        at TestContext.<anonymous> (file://~/CursorProjects/quality-harness/tests/unread-advice.test.mjs:136:10)
        at async Test.run (node:internal/test_runner/test:1113:7)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: true,
      expected: false,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'a passing mrw --check is a validation for the commit gate' tests/unread-advice.test.mjs` · acceptance-sha256:db6559bf63eb04666a4defa51d27ca677a532a581bd862b34eaddc0e4c409b1e · ms:200
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'a passing mrw --check is a validation for the commit gate' tests/unread-advice.test.mjs` · acceptance-sha256:db6559bf63eb04666a4defa51d27ca677a532a581bd862b34eaddc0e4c409b1e · ms:236

## Mutation Log
- 2026-09-14 · a5c21a2* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · dropping the mrw --check success arm leaves lastUnprovenWrite set after a passing --check write · acceptance-sha256:db6559bf63eb04666a4defa51d27ca677a532a581bd862b34eaddc0e4c409b1e · covers:the mrw --check success arm
