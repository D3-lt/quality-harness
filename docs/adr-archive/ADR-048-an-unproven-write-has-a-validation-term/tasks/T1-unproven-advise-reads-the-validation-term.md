# Task ADR-048-T1: UNPROVEN Advise reads the validation term

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2
**Estimated scope:** S (single file plus statusline caller)
**Owner:** zy
**Produces:** `unprovenWritePending`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the UNPROVEN validation term`

## Goal

A passing recognised check after the final UNPROVEN write silences Advise on Stop, `sessionStateNote`, the wired statusline, and PreToolUse commit advice. A failing check does not. Publish still silences. `lastMutation` stays -1.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `unprovenWritePending`; four surfaces read it |
| `plugin/scripts/statusline.mjs` | edit | `reading()` uses the same predicate |
| `tests/lifecycle.test.mjs` | edit | F-1 tests through the four surfaces |
| `tests/mutations.json` | edit | catalogue the validation term; retarget existing lastUnprovenWrite `from` strings |

## Ordered Steps

1. [S1] Confirm the failing tests for `Covers:` IDs exist and are red. [proof: acceptance]
2. [S2] Add `unprovenWritePending` and call it from `sessionStateNote`, PreToolUse, Stop, and `reading()`. Do not set `lastMutation`. [proof: acceptance]
3. [S3] Retarget catalogue `from` strings that named `(lastUnprovenWrite ?? -1) > lastPublish`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a passing recognised check after an UNPROVEN write silences Advise|a failing check after an UNPROVEN write still Advises, and Read does not flag' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a passing recognised check after an UNPROVEN write silences Advise` | `tests/lifecycle.test.mjs` | MCP / `mrw write` then passing `pnpm test` is silent; `sed -i` control stays silent; FLAG with no following check stays dirty | F-1, UC1-S1 | S1, S2 |
| `a failing check after an UNPROVEN write still Advises, and Read does not flag` | `tests/lifecycle.test.mjs` | failing check still Advises; Read then a passing check is silent; publish still silences | F-1, UC1-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-1 tests |
| 2 — something selects it | Stop / PreToolUse / `sessionStateNote` / `reading()` call `unprovenWritePending` |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | Stop and PreToolUse are the served path |

## Mutation Log
- 2026-09-12 · 239980b* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · UNPROVEN Advise ignores the validation term; a passing check still FLAGS · acceptance-sha256:101aed16dc6b7c3026edb08db22c060001d00abbb7b8068c6b5bb1c68604ace1 · covers:the UNPROVEN validation term

## Invariants

- `lastMutation` stays -1 for MCP / unrecognised (F-24).
- A failing check does not silence (`lastSuccessfulValidation === lastValidation`).
- A FLAG-without-following-check test stays FLAG.

## Risks

- A leftover surface still keys `(lastUnprovenWrite ?? -1) > lastPublish`.
- Treating `lastValidation` alone as silence.

## Stop Condition

Passing check still FLAGS, or failing check goes silent, or `lastMutation` is set for these writes.

## Out of Scope

- lastUnprovenWrite only on success (T2)
- Cost 2 wording
- chmod-000

## Verification Log
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'a passing recognised check after an UNPROVEN write silences Advise|a failing check after an UNPROVEN write still Advises, and Read does not flag' tests/lifecycle.test.mjs` · acceptance-sha256:101aed16dc6b7c3026edb08db22c060001d00abbb7b8068c6b5bb1c68604ace1 · ms:831
