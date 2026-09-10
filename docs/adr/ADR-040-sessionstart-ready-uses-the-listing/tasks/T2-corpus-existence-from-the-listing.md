# Task ADR-040-T2: SessionStart corpus existence uses the listing

**Depends-on:** T1
**Covers:** F-2, UC2-S1, UC2-S2, UC2-S3
**Estimated scope:** S (single file plus tests)
**Owner:** zy
**Produces:** `hasDecisionCorpus` listing look
**Consumes:** listing-shaped `{ look, lines }` from `readyTaskLines` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`hasDecisionCorpus` answers from the listing, not `statSync`; disk-only is not a corpus; git-fail is UNPROVEN, not no corpus.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `hasDecisionCorpus(root, listing)`; `sessionOrientation` uses that look for the shadow-install notice |
| `tests/lifecycle.test.mjs` | edit | listed, gitignored, and git-fail corpus-existence fixtures |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Answer corpus existence from the listing; listing-null is UNPROVEN, not false. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'SessionStart may treat a listing-named corpus dir as a corpus|a disk-only corpus dir is not a corpus|git cannot list is UNPROVEN, not no corpus' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `SessionStart may treat a listing-named corpus dir as a corpus` | `tests/lifecycle.test.mjs` | a listed `docs/adr` may be a corpus | F-2, UC2-S1 | S1, S2 |
| `a disk-only corpus dir is not a corpus` | `tests/lifecycle.test.mjs` | gitignored `docs/adr` is not a corpus | F-2, UC2-S2 | S1, S2 |
| `git cannot list is UNPROVEN, not no corpus` | `tests/lifecycle.test.mjs` | listing-null is UNPROVEN, not false | F-2, UC2-S3 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-2 tests (`hasDecisionCorpus` is exported so the look is hermetic) |
| 2 — something selects it | `sessionOrientation` uses the look for the shadow-install notice |
| 3 — the caller can discover it | SessionStart `additionalContext` |
| 4 — it is used | nothing measures notice emission in production; the tests assert the look |

## Mutation Log

- 2026-09-10 · a40ea19 · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · listing-null must be UNPROVEN, not no corpus · acceptance-sha256:f01acd8f9a5024643c9241825543d13afcfb15cba7fbf31d57dee28c51ca751f

## Invariants

- Disk-only `docs/adr` (or the four sibling names) is not a corpus for this gate.
- Listing-null is `'UNPROVEN'`, not `false`.
- Not-a-repository stays no ADR reading (T1).

## Risks

- Asserting only the shadow-install notice couples the test to the developer's home — export `hasDecisionCorpus` and assert the look.

## Stop Condition

A green F-1 ready-task test while `hasDecisionCorpus` still `statSync`s, or listing-null treated as false.

## Out of Scope

- Unify with `observe` / `adrCorpus` (ADR-039)
- Unify with `adr-next`

## Notes

Class: SessionStart corpus existence answered from disk `statSync`. Sweep: `rg -n 'function hasDecisionCorpus|sessionOrientation\(' plugin/scripts/lifecycle.mjs` — `hasDecisionCorpus` reads the listing; listing-null is `'UNPROVEN'`; `sessionOrientation` is the only product caller. `sessionStateNote` is not a caller. ADR-039 owns `adrCorpus`.

## Verification Log
- 2026-09-10 · a40ea19 · exit 0 · `node --test --test-name-pattern 'SessionStart may treat a listing-named corpus dir as a corpus|a disk-only corpus dir is not a corpus|git cannot list is UNPROVEN, not no corpus' tests/lifecycle.test.mjs` · acceptance-sha256:f01acd8f9a5024643c9241825543d13afcfb15cba7fbf31d57dee28c51ca751f · ms:257
