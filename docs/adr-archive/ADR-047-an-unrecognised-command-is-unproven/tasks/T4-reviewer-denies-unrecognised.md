# Task ADR-047-T4: The reviewer denies unrecognised

**Depends-on:** T1, T2
**Covers:** F-4, UC4-S1, UC4-S2
**Estimated scope:** S (bashVerdict plus CLI and hook tests)
**Owner:** zy
**Produces:** bashVerdict denies unrecognised
**Consumes:** `classifyCommand` four-way result, family-first classify (foreign executable)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the unrecognised deny`

## Goal

`bashVerdict` / `readOnlyVerdict` deny `unrecognised`. After F-3, `pwsh -Command rm` must not flip from deny to allow. `echo` and `bash scripts/selftest.sh` stay allowed. POSIX `rm` stays denied. Prove it at the CLI (`reviewer-guard.mjs`) and the plugin-level PreToolUse hook.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `bashVerdict` denies `unrecognised` before the mutation boolean |
| `tests/reviewer-guard.test.mjs` | edit | CLI outermost: spawn `reviewer-guard.mjs` |
| `tests/lifecycle.test.mjs` | edit | hook outermost: PreToolUse `agent_type: qh-correctness-reviewer` |
| `tests/mutations.json` | edit | update the stale mutation `from` that keyed `isPotentialMutationCommand` |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Deny `unrecognised` in `bashVerdict`; keep echo / selftest allowed and POSIX `rm` denied. [proof: acceptance]
3. [S3] Cover CLI spawn and plugin-level PreToolUse. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'a reviewer is denied Remove-Item and pwsh -Command rm|echo and selftest are not denied as unrecognised' tests/reviewer-guard.test.mjs tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a reviewer is denied Remove-Item and pwsh -Command rm` | `tests/reviewer-guard.test.mjs` | CLI exit 2 on Remove-Item, `pwsh -Command rm`, `cmd /c rmdir`, POSIX `rm` | F-4, UC4-S1 | S1, S2, S3 |
| `echo and selftest are not denied as unrecognised` | `tests/reviewer-guard.test.mjs` | CLI allows echo / selftest / ls; Remove-Item still denied | F-4, UC4-S2 | S1, S2, S3 |
| `a reviewer is denied Remove-Item and pwsh -Command rm` | `tests/lifecycle.test.mjs` | plugin-level PreToolUse deny inside `qh-correctness-reviewer` | F-4, UC4-S1 | S1, S2, S3 |
| `echo and selftest are not denied as unrecognised` | `tests/lifecycle.test.mjs` | hook allows echo / selftest / ls; Remove-Item still denied | F-4, UC4-S2 | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-4 tests |
| 2 — something selects it | `readOnlyVerdict` → `bashVerdict` → `classifyCommand` |
| 3 — the caller can discover it | `reviewer-guard.mjs` CLI; plugin PreToolUse for `READ_ONLY_ROLES` |
| 4 — it is used | a reviewer Bash PreToolUse |

## Mutation Log
- 2026-09-12 · 06479cf* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · bashVerdict ignores unrecognised so Remove-Item and pwsh -Command rm are allowed · acceptance-sha256:52be62aeac7bbc50d8e0453e62ad7f40c2bca4e20eaddb4890da9f2c8ccada07 · covers:the unrecognised deny

## Verification Log
- 2026-09-12 · 06479cf* · exit 0 · `node --test --test-name-pattern 'a reviewer is denied Remove-Item and pwsh -Command rm|echo and selftest are not denied as unrecognised' tests/reviewer-guard.test.mjs tests/lifecycle.test.mjs` · acceptance-sha256:52be62aeac7bbc50d8e0453e62ad7f40c2bca4e20eaddb4890da9f2c8ccada07 · ms:288

## Invariants

- `pwsh -Command rm` stays denied after it becomes unrecognised.
- Isolated `echo` / `ls` and healthy `bash scripts/selftest.sh` are allowed.
- POSIX `rm` stays denied.

## Risks

- F-3 ships and `bashVerdict` still keys the mutation boolean — `pwsh -Command rm` allowed.
- Denying `echo`.

## Stop Condition

CLI or hook allows Remove-Item or `pwsh -Command rm`, or denies echo / selftest.

## Out of Scope

- PowerShell/cmd mutation grammar (permanent: boundary: Non-Goal)
- innerCommands PowerShell peel (permanent: boundary: outer family is already unrecognised)
