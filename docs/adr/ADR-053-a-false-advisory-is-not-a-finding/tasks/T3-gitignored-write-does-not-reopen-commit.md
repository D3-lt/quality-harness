# Task ADR-053-T3: A gitignored Write after a green check does not re-open the commit gate

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the gitignored Write skip`

## Goal

A native Write whose path `git check-ignore` accepts and `git ls-files --error-unmatch` rejects is not `lastMutation` for the commit gate. A tracked Write after a green check still advises. Git spawn is only against the fixture cwd.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | skip lastMutation / record for gitignored untracked native Writes |
| `tests/unread-advice.test.mjs` | edit | gitignored ledger Write after `pnpm test`; dirty tracked `b.js` |

## Ordered Steps

1. [S1] Confirm the failing test for this task exists and is red. [proof: acceptance]
2. [S2] Skip lastMutation and path record when the Write is gitignored and untracked. Keep current behaviour when git is absent or the path is tracked. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a gitignored Write after a green check does not re-open the commit gate' tests/unread-advice.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a gitignored Write after a green check does not re-open the commit gate` | `tests/unread-advice.test.mjs` | ignored ledger Write after a green check is silent; tracked Write still advises | none — no spec | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | gitignored-untracked skip in `analyzeTranscript` |
| 2 — something selects it | native Write whose path git ignore-accepts and ls-files rejects |
| 3 — the caller can discover it | `unverifiedSince` / PreToolUse |
| 4 — it is used | the unread-advice test |

## Invariants

- Tracked paths (`git add -f`) stay authorship.
- Not a git repository, or `check-ignore` failing, is not ignored.
- Git is spawned only in the directory the test created (CLAUDE.md §9).

## Risks

- Skipping a tracked-but-ignored path. Mitigation: `ls-files --error-unmatch` keeps tracked paths.

## Stop Condition

The ignored Write still sets `unverifiedSince`, or a tracked Write after a check goes silent.

## Out of Scope

- Rewriting Stop independently of lastMutation (skipping lastMutation also quiets Stop on those paths, which is correct)

## Verification Log
- 2026-09-14 · a5c21a2* · exit 1 · `node --test --test-name-pattern 'a gitignored Write after a green check does not re-open the commit gate' tests/unread-advice.test.mjs` · acceptance-sha256:e59be82dc5d3ffe5e0e3eeebc9c28452c50d3bd33cc6c019347e37cc96d5b89a · ms:444 · test-lock-sha256:e3b2fdfe26dfe4c1ab6f7c324f09e678d1e609e7f748a36b26d461b501e09968 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3VucmVhZC1hZHZpY2UudGVzdC5tanMJUG9zdFRvb2xVc2UgaXMgc2lsZW50IG9uIGEgZmlsZSB0aGF0IGlzIG5vdCBhIFFIIHJlY29yZAlkNGVlZWJhZTc0Zjk5MTM5NTYwYzlhYjg3MGM4ODU1MjhkYWMyMGI3NGE5OTEwZWE1NDliZGU0MDFkOGM3MjgxCmJvZHkJdGVzdHMvdW5yZWFkLWFkdmljZS50ZXN0Lm1qcwlhIGdpdGlnbm9yZWQgV3JpdGUgYWZ0ZXIgYSBncmVlbiBjaGVjayBkb2VzIG5vdCByZS1vcGVuIHRoZSBjb21taXQgZ2F0ZQliMzM0YzBkNmI1OWJjZjI4Yzk1NWEyNjNmMWQzZjNhYWE3OGNhZWVhMWU2YWIzNThkZGZhOTYzNjgzYzcwYzlhCmJvZHkJdGVzdHMvdW5yZWFkLWFkdmljZS50ZXN0Lm1qcwlhIHBhc3NpbmcgbXJ3IC0tY2hlY2sgaXMgYSB2YWxpZGF0aW9uIGZvciB0aGUgY29tbWl0IGdhdGUJNWYzMjEzYWQwZjE5M2Y4OGE3MDY4YWRiMTgwMjY3NjExYmE2Nzk0OGU0ODM2ZjExYzU5ZDE5YmJhMzNmM2QzNQpib2R5CXRlc3RzL3VucmVhZC1hZHZpY2UudGVzdC5tanMJY29tbWl0IGdhdGUgZG9lcyBub3QgYWNjdXNlIHVudmVyaWZpZWQgd2hlbiB0aGlzIEJhc2ggYWxyZWFkeSBydW5zIGEgY2hlY2sgdGhlbiBnaXQgY29tbWl0CTlkYmUyOGUwOWU0MDFiOTE0Y2UzYTdhOWUzYjIxOTBjZDk1NTY2ODFmYTBiNzRjYzQ5ZDA5MmY4MmU5NmQ1ODI
  ```
  --- last 10 line(s) of stdout (of 28 after folding 28 raw)
        at TestContext.<anonymous> (file://~/CursorProjects/quality-harness/tests/unread-advice.test.mjs:200:10)
        at async Test.run (node:internal/test_runner/test:1113:7)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: true,
      expected: false,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'a gitignored Write after a green check does not re-open the commit gate' tests/unread-advice.test.mjs` · acceptance-sha256:e59be82dc5d3ffe5e0e3eeebc9c28452c50d3bd33cc6c019347e37cc96d5b89a · ms:526
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'a gitignored Write after a green check does not re-open the commit gate' tests/unread-advice.test.mjs` · acceptance-sha256:e59be82dc5d3ffe5e0e3eeebc9c28452c50d3bd33cc6c019347e37cc96d5b89a · ms:449

## Mutation Log
- 2026-09-14 · a5c21a2* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · always recording a native Write as lastMutation re-opens the commit gate after a gitignored Write · acceptance-sha256:e59be82dc5d3ffe5e0e3eeebc9c28452c50d3bd33cc6c019347e37cc96d5b89a · covers:the gitignored Write skip
