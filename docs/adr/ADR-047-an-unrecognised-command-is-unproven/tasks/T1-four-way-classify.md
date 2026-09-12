# Task ADR-047-T1: Four-way classify; unrecognised is not neither

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2
**Estimated scope:** M (new module plus the historical classify table)
**Owner:** zy
**Produces:** `classifyCommand` four-way result
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the four-way classify result`

## Goal

`classifyCommand` returns `mutation`, `validation`, `neither`, or `unrecognised`. `false` plus `false` is not a known non-write when the executable family is unmeasured. POSIX `rm` stays mutation. `bash scripts/selftest.sh` stays validation. Isolated `echo` / `ls` stay neither.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/classify-command.mjs` | add | four-way classify; family allowlist copied from executed Session lists |
| `plugin/scripts/lifecycle.mjs` | edit | bind hooks; export `classifyCommand` |
| `tests/classify.test.mjs` | edit | table plus F-1 named tests |
| `scripts/selftest.sh` | edit | `node --check` the new module |
| `tests/mutations.json` | edit | catalogue the new module |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Add `classify-command.mjs` and bind it from `lifecycle.mjs`. Family-unrecognised before collapsing to neither. [proof: acceptance]
3. [S3] Keep the historical classify table under the four-way result. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'recognised POSIX rm is mutation and selftest is validation|an unrecognised PowerShell or cmd write is not neither' tests/classify.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `recognised POSIX rm is mutation and selftest is validation` | `tests/classify.test.mjs` | `rm -rf build` is mutation; `bash scripts/selftest.sh` is validation; neither is unrecognised; Remove-Item is unrecognised | F-1, UC1-S1 | S1, S2, S3 |
| `an unrecognised PowerShell or cmd write is not neither` | `tests/classify.test.mjs` | Remove-Item / cmd.exe del / pwsh Set-Content are unrecognised; POSIX rm and selftest still hold; the booleans still collapse those three to neither | F-1, UC1-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-1 tests |
| 2 — something selects it | `lifecycle.mjs` exports the bound `classifyCommand` |
| 3 — the caller can discover it | Session and reviewer import from `lifecycle.mjs` |
| 4 — it is used | T3 / T4 consume the result |

## Mutation Log
- 2026-09-12 · 06479cf* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · skipping the unmeasured-family return makes Remove-Item neither · acceptance-sha256:684f34b655218347e8ba59f888a8cbb0a0c80c75c2c89a2f31ea0be9a5856274 · covers:the four-way classify result

## Verification Log
- 2026-09-12 · 06479cf* · exit 0 · `node --test --test-name-pattern 'recognised POSIX rm is mutation and selftest is validation|an unrecognised PowerShell or cmd write is not neither' tests/classify.test.mjs` · acceptance-sha256:684f34b655218347e8ba59f888a8cbb0a0c80c75c2c89a2f31ea0be9a5856274 · ms:63

## Invariants

- Recognised POSIX `rm` is mutation. Healthy `bash scripts/selftest.sh` is validation.
- Isolated `echo` / `ls` are neither.
- `Remove-Item` is unrecognised, not neither.

## Risks

- Widening MEASURED_FAMILIES from memory (CLAUDE.md §16). Add a name only from an executed failing case.
- Implementing F-1 as `false` plus `false` → unrecognised while the substring denylist still runs first (T2's defect).

## Stop Condition

A table that still collapses `false` plus `false` to `neither` for Remove-Item, or POSIX `rm` / selftest flipping to unrecognised.

## Out of Scope

- Family-first vs substring for `pwsh -Command rm` (T2)
- `lastUnprovenWrite` (T3)
- reviewer deny (T4)
