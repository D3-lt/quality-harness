# Task ADR-039-T2: Listed records are the corpus, including leftover callers

**Depends-on:** T1
**Covers:** F-2, F-3, UC1-S3, UC1-S4, UC2-S1, UC2-S2
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** leftover callers on the same listing rule
**Consumes:** `adrCorpus(..., { tracked })` listing inventory (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

When git lists, record files come from that listing; `adr-state`, `adr-context`, and the `decisionsGoverning` default use the same rule.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `recordFilesFromListing`; `decisionsGoverning` default stays `adrCorpus(root)` |
| `plugin/scripts/adr-state.mjs` | edit | pass `{ tracked: listing }`; null is UNPROVEN, not "no records" |
| `plugin/scripts/adr-context.mjs` | edit | same listing rule |
| `tests/staged-product.test.mjs` | edit | disk-only record and leftover-caller bindings |
| `tests/lifecycle.test.mjs` | edit | git-init fixtures so Governs still resolves against listed paths |
| `tests/hook-work.test.mjs` | edit | corpus scan probe passes an explicit listing |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Inventory listed record files; leftover CLIs and the default corpus use that listing. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'disk-only record files are not the corpus|leftover adrCorpus callers use the listing, not the disk' tests/staged-product.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `disk-only record files are not the corpus` | `tests/staged-product.test.mjs` | listed records count; gitignored `docs/adr` does not | F-2, UC1-S3, UC1-S4 | S1, S2 |
| `leftover adrCorpus callers use the listing, not the disk` | `tests/staged-product.test.mjs` | adr-state, adr-context, decisionsGoverning default | F-3, UC2-S1, UC2-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-2 / F-3 tests |
| 2 — something selects it | `adr-state` / `adr-context` CLIs and `decisionsGoverning` default |
| 3 — the caller can discover it | `node plugin/scripts/adr-state.mjs`, `node plugin/scripts/adr-context.mjs` |
| 4 — it is used | this repository's own adr-state still lists governing records |

## Mutation Log

- 2026-09-10 · 456d619 · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · listed records must come from the listing, not a disk walk of docs/adr · acceptance-sha256:1c43d566cd6a49bff542829477b96e84e8cdc880cbf2cbd4b44b060ef8bbb372

## Invariants

- A disk-only `docs/adr` file is not a record.
- Git-fail is UNPROVEN for leftover callers, not "No decision records found".
- No shared in-process module with `adr-lint`.

## Risks

- A Governs-only fake listing hides every record — tests that inject `tracked` must include the record paths.

## Stop Condition

A green F-1 test while `adr-state` still walks disk, or a leftover caller that prints "no records" on git-fail.

## Out of Scope

- A shared Governs module with `adr-lint`
- SessionStart (ADR-040)

## Notes

Class: leftover product callers of adrCorpus inventoried records from disk. Sweep: `rg -n 'adrCorpus\(|readRecordFiles\(' plugin --glob '!**/node_modules/**'` — adr-state, adr-context, and decisionsGoverning default share the listing rule; `readRecordFiles` unused (Non-Goal). No other plugin/ callers. SessionStart is ADR-040.

## Verification Log
- 2026-09-10 · 456d619 · exit 0 · `node --test --test-name-pattern 'disk-only record files are not the corpus|leftover adrCorpus callers use the listing, not the disk' tests/staged-product.test.mjs` · acceptance-sha256:1c43d566cd6a49bff542829477b96e84e8cdc880cbf2cbd4b44b060ef8bbb372 · ms:404
