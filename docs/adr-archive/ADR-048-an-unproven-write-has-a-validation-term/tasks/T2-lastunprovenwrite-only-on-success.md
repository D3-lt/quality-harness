# Task ADR-048-T2: lastUnprovenWrite advances only on success

**Depends-on:** T1
**Covers:** F-2, UC2-S1, UC2-S2
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** `unprovenWritePending` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `commandSucceeded on lastUnprovenWrite`

## Goal

`lastUnprovenWrite` advances only when the write succeeded — the same success test lastPublish already uses. A failed MCP or unrecognised-Bash write plus a passing check is not F-1's dirty case.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | both lastUnprovenWrite arms require `commandSucceeded` |
| `tests/lifecycle.test.mjs` | edit | failed write does not advance; in-flight stays -1 |
| `tests/mutations.json` | edit | catalogue the success gate; retarget ADR-047 T3 `from` |

## Ordered Steps

1. [S1] Confirm the failing tests for `Covers:` IDs exist and are red. [proof: acceptance]
2. [S2] Gate both lastUnprovenWrite arms on `commandSucceeded`. Do not treat a missing result as failure. [proof: acceptance]
3. [S3] Retarget the ADR-047 T3 catalogue `from` that named `if (kind === 'unrecognised')`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a failed UNPROVEN write does not advance lastUnprovenWrite' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a failed UNPROVEN write does not advance lastUnprovenWrite` | `tests/lifecycle.test.mjs` | MCP / `mrw write` `is_error` leaves lastUnprovenWrite -1; a later passing check does not Advise; successful write then passing check still silences; in-flight does not advance | F-2, UC2-S1, UC2-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-2 test |
| 2 — something selects it | both lastUnprovenWrite assignment sites |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | T1's surfaces read the scalar |

## Mutation Log
- 2026-09-12 · 239980b* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · lastUnprovenWrite advances on is_error; a failed write plus a passing check silences as if the write happened · acceptance-sha256:a4a98fb4e935dd2e7a48b19ac813499c27c61485acc5284c46509770c3759aaf · covers:commandSucceeded on lastUnprovenWrite

## Invariants

- lastPublish still requires `commandSucceeded`.
- A missing result does not advance lastUnprovenWrite (`executed()` already requires a result).
- Gating only MCP is not this task.

## Risks

- F-1 implemented as `lastSuccessfulValidation > lastUnprovenWrite` while `executed()` still treats `is_error` as a write.
- Treating missing result as failure (in-flight never UNPROVEN).

## Stop Condition

A failed write then a passing check silences as if the write happened.

## Out of Scope

- The validation term itself (T1)
- Hook-blocked results (already not `executed()`)

## Verification Log
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'a failed UNPROVEN write does not advance lastUnprovenWrite' tests/lifecycle.test.mjs` · acceptance-sha256:a4a98fb4e935dd2e7a48b19ac813499c27c61485acc5284c46509770c3759aaf · ms:320
