# Task ADR-039-T1: Observe passes the listing into adrCorpus

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** `adrCorpus(..., { tracked })` listing inventory
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`observe()` passes its listing into `adrCorpus`; a null listing is UNPROVEN and is not a disk corpus of records.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/work-next.mjs` | edit | `observe()` passes `{ tracked: listing }` |
| `plugin/scripts/lifecycle.mjs` | edit | `adrCorpus` inventories from the listing; null does not walk disk |
| `tests/staged-product.test.mjs` | add | F-1 bindings that plant `docs/adr` on a git-fail tree |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Pass `{ tracked: listing }` from `observe` and make a null listing return UNPROVEN without a disk walk. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'observe passes the listing into adrCorpus|a failed listing is not a disk corpus of records' tests/staged-product.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `observe passes the listing into adrCorpus` | `tests/staged-product.test.mjs` | observe forwards the listing it already took | F-1, UC1-S1 | S1, S2 |
| `a failed listing is not a disk corpus of records` | `tests/staged-product.test.mjs` | git-fail with `docs/adr` on disk is UNPROVEN, not a disk corpus | F-1, UC1-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/staged-product.test.mjs` F-1 tests |
| 2 — something selects it | `observe()` is what `work-next` prints |
| 3 — the caller can discover it | `/quality-harness:work` and `work-next --json` |
| 4 — it is used | this repository's own `work-next` still inventories listed records |

## Mutation Log

- 2026-09-10 · 48d2477 · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a null listing must not walk disk into a corpus of records · acceptance-sha256:57b9f67710f8008bccec61b438743014fb812920ee78e45f01f3abcf93535e17

## Invariants

- `tracked == null` is UNPROVEN, never a disk walk of `docs/adr`.
- A missing listing is not an empty corpus.

## Risks

- The existing empty-tree UNPROVEN test has no records on disk — mitigated by planting `docs/adr` on the git-fail fixture.

## Stop Condition

A F-1 test that stays green while `readRecordFiles` still walks, or that treats git-fail as zero records.

## Out of Scope

- Leftover callers (T2)
- SessionStart ready / `hasDecisionCorpus` (ADR-040)

## Notes

Class: a null listing was treated as a disk corpus of records. Sweep: `rg -n 'adrCorpus\(|readRecordFiles\(' plugin --glob '!**/node_modules/**'` — observe and leftover CLIs pass `{ tracked: listing }`; `adrCorpus` returns on null without calling `readRecordFiles`; unused `readRecordFiles` stays (Non-Goal). Siblings: leftover callers (T2), SessionStart (ADR-040).

## Verification Log
- 2026-09-10 · 48d2477 · exit 0 · `node --test --test-name-pattern 'observe passes the listing into adrCorpus|a failed listing is not a disk corpus of records' tests/staged-product.test.mjs` · acceptance-sha256:57b9f67710f8008bccec61b438743014fb812920ee78e45f01f3abcf93535e17 · ms:260
