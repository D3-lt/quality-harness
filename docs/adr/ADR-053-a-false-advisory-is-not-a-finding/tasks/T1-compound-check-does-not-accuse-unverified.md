# Task ADR-053-T1: Compound check then git commit does not accuse unverified

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the && publish prefix`

## Goal

PreToolUse does not print "Nothing has verified the work" / "would publish unchecked" when this Bash is a recognised check joined to `git commit`/`git push` by `&&` or a newline. `pnpm check || git commit` and a bare `git commit` after unpublished work still advise. Do not classify the whole compound as `validation`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `publishPrecededByValidation`; PreToolUse commit arm skips the unverified accusation when this command already runs a check |
| `tests/unread-advice.test.mjs` | add | red cases for `&&`, dirty `\|\|` and bare commit |

## Ordered Steps

1. [S1] Confirm the failing test for this task exists and is red. [proof: acceptance]
2. [S2] Strip a trailing `&&` / newline `git commit`/`git push` and treat the remainder as a recognised check only when `isValidationCommand` accepts it or its last `&&` segment. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'commit gate does not accuse unverified when this Bash already runs a check then git commit' tests/unread-advice.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `commit gate does not accuse unverified when this Bash already runs a check then git commit` | `tests/unread-advice.test.mjs` | `pnpm check && git commit` is silent; or-join and bare commit still advise | none — no spec | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `publishPrecededByValidation` |
| 2 — something selects it | PreToolUse commit arm after artifact gates |
| 3 — the caller can discover it | PreToolUse stderr on `git commit` |
| 4 — it is used | the unread-advice test |

## Invariants

- `isValidationCommand('pnpm check && git commit -m x')` stays false.
- `check \|\| git commit` still advises.
- `git add -A && git commit` still advises when unpublished work exists.
- Artifact gates still run on this command.

## Risks

- Treating `\|\|` / `;` as verified. Mitigation: suffix only matches `&&` / newline; dirty test.

## Stop Condition

`pnpm check && git commit` still prints the unverified line, or `\|\|` goes silent.

## Out of Scope

- T2 `mrw --check`
- T3 gitignored Write
- Teaching `isValidationCommand` every declared `.quality-harness.json` `check`

## Verification Log
- 2026-09-14 · a5c21a2* · exit 1 · `node --test --test-name-pattern 'commit gate does not accuse unverified when this Bash already runs a check then git commit' tests/unread-advice.test.mjs` · acceptance-sha256:4728c77bd0c2f5805b1f7b0d120a18b116bbaf63aa94f17acc8d22750b76cedd · ms:732 · test-lock-sha256:e3b2fdfe26dfe4c1ab6f7c324f09e678d1e609e7f748a36b26d461b501e09968 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3VucmVhZC1hZHZpY2UudGVzdC5tanMJUG9zdFRvb2xVc2UgaXMgc2lsZW50IG9uIGEgZmlsZSB0aGF0IGlzIG5vdCBhIFFIIHJlY29yZAlkNGVlZWJhZTc0Zjk5MTM5NTYwYzlhYjg3MGM4ODU1MjhkYWMyMGI3NGE5OTEwZWE1NDliZGU0MDFkOGM3MjgxCmJvZHkJdGVzdHMvdW5yZWFkLWFkdmljZS50ZXN0Lm1qcwlhIGdpdGlnbm9yZWQgV3JpdGUgYWZ0ZXIgYSBncmVlbiBjaGVjayBkb2VzIG5vdCByZS1vcGVuIHRoZSBjb21taXQgZ2F0ZQliMzM0YzBkNmI1OWJjZjI4Yzk1NWEyNjNmMWQzZjNhYWE3OGNhZWVhMWU2YWIzNThkZGZhOTYzNjgzYzcwYzlhCmJvZHkJdGVzdHMvdW5yZWFkLWFkdmljZS50ZXN0Lm1qcwlhIHBhc3NpbmcgbXJ3IC0tY2hlY2sgaXMgYSB2YWxpZGF0aW9uIGZvciB0aGUgY29tbWl0IGdhdGUJNWYzMjEzYWQwZjE5M2Y4OGE3MDY4YWRiMTgwMjY3NjExYmE2Nzk0OGU0ODM2ZjExYzU5ZDE5YmJhMzNmM2QzNQpib2R5CXRlc3RzL3VucmVhZC1hZHZpY2UudGVzdC5tanMJY29tbWl0IGdhdGUgZG9lcyBub3QgYWNjdXNlIHVudmVyaWZpZWQgd2hlbiB0aGlzIEJhc2ggYWxyZWFkeSBydW5zIGEgY2hlY2sgdGhlbiBnaXQgY29tbWl0CTlkYmUyOGUwOWU0MDFiOTE0Y2UzYTdhOWUzYjIxOTBjZDk1NTY2ODFmYTBiNzRjYzQ5ZDA5MmY4MmU5NmQ1ODI
  ```
  --- last 10 line(s) of stdout (of 26 after folding 26 raw)
        at TestContext.<anonymous> (file://~/CursorProjects/quality-harness/tests/unread-advice.test.mjs:106:10)
        at async Test.run (node:internal/test_runner/test:1113:7)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: "Nothing has verified the work since your last change, so this commit would publish unchecked. Changed paths include: a.js. No `check` is declared in `.quality-harness.json`. I inferred from this repository rather than from a declaration: `npm run test`, so that is not this project's own check. If it is red on an unmodified tree the finding is about this machine and not about your change — say which, and declare the real command as `check`. Run `npm run test` after the final edit and report the exact command and result. Do not add cleanup or new scope. Nothing is blocked — this is what the gate sees before you commit.\n",
      expected: /would publish unchecked/i,
      operator: 'doesNotMatch',
      diff: 'simple'
    }
  ```
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'commit gate does not accuse unverified when this Bash already runs a check then git commit' tests/unread-advice.test.mjs` · acceptance-sha256:4728c77bd0c2f5805b1f7b0d120a18b116bbaf63aa94f17acc8d22750b76cedd · ms:431
- 2026-09-14 · a5c21a2* · exit 0 · `node --test --test-name-pattern 'commit gate does not accuse unverified when this Bash already runs a check then git commit' tests/unread-advice.test.mjs` · acceptance-sha256:4728c77bd0c2f5805b1f7b0d120a18b116bbaf63aa94f17acc8d22750b76cedd · ms:421

## Mutation Log
- 2026-09-14 · a5c21a2* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · dropping the && publish prefix re-accuses a recognised check joined to git commit · acceptance-sha256:4728c77bd0c2f5805b1f7b0d120a18b116bbaf63aa94f17acc8d22750b76cedd · covers:the && publish prefix
