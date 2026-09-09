# Task ADR-038-T2: Name a miss

**Depends-on:** T1
**Covers:** F-2, F-12, F-15, F-20, F-23, F-26, F-32, UC2-S1, UC2-S2, UC2-S3, UC2-S4, UC3-S3
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** not-recognised / UNPROVEN miss vocabulary
**Consumes:** `observe().look`
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A file that is not a QH record or task is named not-recognised or UNPROVEN. The matcher does not change.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/facts-gate-dispatch.sh` | edit | name a miss; PostToolUse once via firstMentionThisSession |
| `plugin/scripts/lifecycle.mjs` | edit | export `firstMentionThisSession`; `--first-mention` |
| `plugin/scripts/run-shell-hook.mjs` | edit | pass `QUALITY_HARNESS_SESSION_ID` |
| `plugin/bin/adr-lint` | edit | miss wording is not-recognised; still refuses a directory |
| `docs/INSTALL.md` | edit | example names a file |

## Ordered Steps

1. [S1] Bind the miss-vocabulary tests. [proof: acceptance]
2. [S2] Name the miss in the dispatcher and Core without widening `is_adr`. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'QH-shaped record still reaches|MADR file is not-recognised|unreadable file is UNPROVEN|once per file per session|adr-lint still refuses a directory|is_adr still requires' tests/staged-product.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a MADR file is not-recognised, not a failed record` | `tests/staged-product.test.mjs` | miss vocabulary | F-15, UC2-S2 | S1, S2 |
| `PostToolUse names not-recognised once per file per session via firstMentionThisSession` | `tests/staged-product.test.mjs` | once-per-session ledger | F-20, F-32, UC2-S4 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/staged-product.test.mjs` |
| 2 — something selects it | PostToolUse and `adr-lint FILE` |
| 3 — the caller can discover it | named stdout |
| 4 — it is used | commit boundary names the miss again |

## Mutation Log

## Invariants

- `is_adr` still requires the four QH sections.
- `adr-lint` on a directory still exits non-zero with `expected a record FILE`.

## Risks

- Naming every miss on every edit becomes noise — mitigated by firstMentionThisSession on PostToolUse only.

## Stop Condition

A miss that is silent, or a matcher change that starts classifying foreign ADR shapes as QH records.

## Out of Scope

- Widening the heading grammar (F-26)

## Verification Log
