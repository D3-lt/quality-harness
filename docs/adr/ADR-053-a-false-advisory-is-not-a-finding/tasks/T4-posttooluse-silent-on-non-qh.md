# Task ADR-053-T4: PostToolUse is silent on a file that is not a QH record

**Status:** superseded by ADR-060 — the clause this task proved read a command's text, which nothing does any more; its test was deleted with the classifier, so its fence now selects nothing
**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the PostToolUse miss skip`

## Goal

PostToolUse does not print `not-recognised` for a file that is not a QH record. The commit boundary and `python3 plugin/bin/adr-lint FILE` still name it. UNPROVEN unreadability is unchanged.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/facts-gate-dispatch.sh` | edit | empty-gate PostToolUse `exit 0` without printing |
| `tests/unread-advice.test.mjs` | edit | PostToolUse silent; PreToolUse and adr-lint still name |
| `tests/staged-product.test.mjs` | edit | once-per-session contract: PostToolUse no longer names; commit and Core still do |

## Ordered Steps

1. [S1] Confirm the failing test for this task exists and is red. [proof: acceptance]
2. [S2] When `$gate` is empty, the file exists and is readable, and `$boundary` is PostToolUse, exit 0 without printing. Other boundaries still print. [proof: mutation]
3. [S3] Update the staged-product once-per-session test so PostToolUse is silent and commit / `adr-lint` still name. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'PostToolUse is silent on a file that is not a QH record' tests/unread-advice.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `PostToolUse is silent on a file that is not a QH record` | `tests/unread-advice.test.mjs` | PostToolUse prints nothing; PreToolUse and adr-lint still name the miss | none — no spec | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | PostToolUse miss skip in `facts-gate-dispatch.sh` |
| 2 — something selects it | `$boundary` = PostToolUse and `$gate` empty |
| 3 — the caller can discover it | `run-shell-hook.mjs` passes hook_event_name as `$2` |
| 4 — it is used | the unread-advice test |

## Invariants

- Positive-match arms (ADR, spec, architecture, archive) still run.
- Missing / unreadable still UNPROVEN.
- Templates already `exit 0`. Non-`*.md` already `exit 0` when no archive.

## Risks

- PostToolUse silence hiding a real QH miss. Mitigation: positive-match arms unchanged; commit and Core still name.

## Stop Condition

PostToolUse still prints `not-recognised` for ordinary notes.md, or commit / adr-lint go silent.

## Out of Scope

- Changing Core `adr-lint FILE` miss naming
- Changing firstMentionThisSession itself (it is unused when PostToolUse never prints)

## Verification Log
- 2026-09-14 · a5c21a2* · exit 1 · `node --test --test-name-pattern 'PostToolUse is silent on a file that is not a QH record' tests/unread-advice.test.mjs` · acceptance-sha256:c1ee510ce49ef41d02aa4be0e7240567617602b8167987122c144774b785c68d · ms:273 · test-lock-sha256:e3b2fdfe26dfe4c1ab6f7c324f09e678d1e609e7f748a36b26d461b501e09968 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3VucmVhZC1hZHZpY2UudGVzdC5tanMJUG9zdFRvb2xVc2UgaXMgc2lsZW50IG9uIGEgZmlsZSB0aGF0IGlzIG5vdCBhIFFIIHJlY29yZAlkNGVlZWJhZTc0Zjk5MTM5NTYwYzlhYjg3MGM4ODU1MjhkYWMyMGI3NGE5OTEwZWE1NDliZGU0MDFkOGM3MjgxCmJvZHkJdGVzdHMvdW5yZWFkLWFkdmljZS50ZXN0Lm1qcwlhIGdpdGlnbm9yZWQgV3JpdGUgYWZ0ZXIgYSBncmVlbiBjaGVjayBkb2VzIG5vdCByZS1vcGVuIHRoZSBjb21taXQgZ2F0ZQliMzM0YzBkNmI1OWJjZjI4Yzk1NWEyNjNmMWQzZjNhYWE3OGNhZWVhMWU2YWIzNThkZGZhOTYzNjgzYzcwYzlhCmJvZHkJdGVzdHMvdW5yZWFkLWFkdmljZS50ZXN0Lm1qcwlhIHBhc3NpbmcgbXJ3IC0tY2hlY2sgaXMgYSB2YWxpZGF0aW9uIGZvciB0aGUgY29tbWl0IGdhdGUJNWYzMjEzYWQwZjE5M2Y4OGE3MDY4YWRiMTgwMjY3NjExYmE2Nzk0OGU0ODM2ZjExYzU5ZDE5YmJhMzNmM2QzNQpib2R5CXRlc3RzL3VucmVhZC1hZHZpY2UudGVzdC5tanMJY29tbWl0IGdhdGUgZG9lcyBub3QgYWNjdXNlIHVudmVyaWZpZWQgd2hlbiB0aGlzIEJhc2ggYWxyZWFkeSBydW5zIGEgY2hlY2sgdGhlbiBnaXQgY29tbWl0CTlkYmUyOGUwOWU0MDFiOTE0Y2UzYTdhOWUzYjIxOTBjZDk1NTY2ODFmYTBiNzRjYzQ5ZDA5MmY4MmU5NmQ1ODI
  ```
  --- last 10 line(s) of stdout (of 30 after folding 30 raw)
        at Test.run (node:internal/test_runner/test:1106:25)
        at Test.start (node:internal/test_runner/test:1003:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"not-recognised: /private/tmp/qh-unread-MujYWE/unread-t4-Rg9WEd/notes.md is not a QH record or task"}}',
      expected: /not-recognised/,
      operator: 'doesNotMatch',
      diff: 'simple'
    }
  ```
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'PostToolUse is silent on a file that is not a QH record' tests/unread-advice.test.mjs` · acceptance-sha256:c1ee510ce49ef41d02aa4be0e7240567617602b8167987122c144774b785c68d · ms:352
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'PostToolUse is silent on a file that is not a QH record' tests/unread-advice.test.mjs` · acceptance-sha256:c1ee510ce49ef41d02aa4be0e7240567617602b8167987122c144774b785c68d · ms:307

## Mutation Log
- 2026-09-14 · a5c21a2* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · removing the PostToolUse miss skip prints not-recognised for an ordinary markdown file · acceptance-sha256:c1ee510ce49ef41d02aa4be0e7240567617602b8167987122c144774b785c68d · covers:the PostToolUse miss skip
