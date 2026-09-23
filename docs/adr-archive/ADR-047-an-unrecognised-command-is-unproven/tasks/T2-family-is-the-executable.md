# Task ADR-047-T2: Family is the executable, not a denylist substring

**Depends-on:** T1
**Covers:** F-3, UC3-S1, UC3-S2
**Estimated scope:** S (classify-command family order)
**Owner:** zy
**Produces:** family-first classify (foreign executable)
**Consumes:** `classifyCommand` four-way result
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the executable family`

## Goal

Family is the executable (`commandInvocation` / `executableName`), not a scan of the whole string for `rm` / `rmdir`. `pwsh` / `powershell` / `cmd` / `cmd.exe` are unrecognised even when the payload holds those letters. POSIX `rm` as the executable stays mutation.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/classify-command.mjs` | edit | foreign-family return before the mutation boolean |
| `plugin/scripts/lifecycle.mjs` | edit | `nestedShellScript` uses `POSIX_NESTED_SHELLS` |
| `tests/classify.test.mjs` | edit | F-3 named tests including unread zsh body |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Classify foreign-family executables as unrecognised before `isPotentialMutationCommand`. [proof: acceptance]
3. [S3] Keep POSIX `rm` as mutation; do not claim recognised zsh from a `-c` body that contains `rm`. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'POSIX rm as the executable stays mutation|pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation' tests/classify.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `POSIX rm as the executable stays mutation` | `tests/classify.test.mjs` | family is executable `rm`; result mutation; `pwsh -Command rm` is unrecognised | F-3, UC3-S1 | S1, S2, S3 |
| `pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation` | `tests/classify.test.mjs` | `pwsh -Command rm`, `cmd /c rmdir`, `cmd.exe /c rmdir`, `pwsh -Command Remove-Item` are unrecognised; the boolean still sees letters `rm`/`rmdir`; `zsh -c "echo ${#files}"` is neither | F-3, UC3-S2 | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-3 tests |
| 2 — something selects it | FOREIGN / MEASURED checks before the mutation boolean |
| 3 — the caller can discover it | `classifyCommand` return |
| 4 — it is used | T4 denies `pwsh -Command rm` as unrecognised |

## Mutation Log
- 2026-09-12 · 06479cf* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · skipping both unrecognised returns lets pwsh -Command rm fall through to the POSIX substring · acceptance-sha256:b038f8931eebfdd9a56e0d4a087703d4d95726b6c49f998bb4e3ee3218320df7 · covers:the executable family

## Verification Log
- 2026-09-12 · 06479cf* · exit 0 · `node --test --test-name-pattern 'POSIX rm as the executable stays mutation|pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation' tests/classify.test.mjs` · acceptance-sha256:b038f8931eebfdd9a56e0d4a087703d4d95726b6c49f998bb4e3ee3218320df7 · ms:137

## Invariants

- `isPotentialMutationCommand('pwsh -Command rm -rf build')` may stay true. `classifyCommand` must not.
- `zsh -c "echo ${#files}"` is not mutation.
- POSIX `rm` as the executable is mutation.

## Risks

- Skipping only FOREIGN while MEASURED still catches `pwsh` — a GREEN mutant of FOREIGN alone is a finding about the test; the killing mutant must skip both unrecognised returns.
- A recognised-zsh test that only feeds `zsh -c "rm …"`.

## Stop Condition

`pwsh -Command rm` or `cmd /c rmdir` still classified as mutation.

## Out of Scope

- PowerShell/cmd mutation grammar (permanent: boundary: Non-Goal)
- Session Advise (T3)
- reviewer deny (T4)
