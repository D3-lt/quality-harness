# Task ADR-101-T2: checks.jsonl and fast-checks.jsonl are read by one strict reader

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one module, one new test)
**Owner:** unassigned
**Produces:** `ledgerPass`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `both files answer every table row the same`, `passedAlready and latestFastPass call ledgerPass`, `the goldens, tables and catalogue are unchanged`

## Goal

One function reads a check ledger file strictly and answers its latest matching pass; `passedAlready` and `latestFastPass` keep
their names and become calls of it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/check-ledger.mjs` | edit | `ledgerPass(root, { file, seen, match })`; the two readers call it |
| `tests/one-ledger-reader.test.mjs` | add | the shared table run against both files |
| `tests/mutations/plugin/scripts/check-ledger.mjs.json` | edit | entries on the moved lines repointed to `ledgerPass` |

## Ordered Steps

1. [S1] Write `tests/one-ledger-reader.test.mjs`: the shared table (torn last line, unparsable line, row without an id, a later failing row, a later passing row on another tree, an unseen write after the pass, an unseen write before it), each written as `checks.jsonl` and as `fast-checks.jsonl`, asserting `ledgerPass` gives the same answer for both and that `passedAlready` and `latestFastPass` give `ledgerPass`'s. Run the fence red (no `ledgerPass`). [proof: acceptance]
2. [S2] Write `ledgerPass` from the two bodies' common rules; make both readers call it with their file, seen key and match (tree; or tree, command and ADR-094's code tree). [proof: acceptance]
3. [S3] Repoint and run every catalogue entry on `check-ledger.mjs` (CLAUDE.md §18). [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \
  && node --test tests/prose-reuse.test.mjs tests/qh-check-reads-the-ledger.test.mjs tests/publish-judgement.test.mjs tests/hook-goldens.test.mjs \
  && node scripts/mutate.mjs --stale
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `both ledger files answer every row of the shared table the same` | `tests/one-ledger-reader.test.mjs` | one strict rule for both files | — | S1, S2 |
| `passedAlready and latestFastPass answer what ledgerPass answers` | `tests/one-ledger-reader.test.mjs` | the two readers are calls of it, not copies | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `passedAlready` (`qh-check.mjs:79`, `session-notes.mjs:183`) and `latestFastPass` (`publish-verdict.mjs:187`) call it |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every `qh-check` skip and every commit on a fast pass |

## Mutation Log

## Invariants

- `passedAlready`'s and `latestFastPass`'s signatures and answers are unchanged; `tests/prose-reuse.test.mjs` (8 locks) stays byte-identical.

## Risks

- ADR-094's code-tree match is subtler than a tree match: it stays in `passedAlready`'s `match`, and the prose-reuse tests hold it.

## Stop Condition

Stop and ask if a table row cannot give the same answer for both files without changing what one of them answers today.

## Out of Scope

- The session log's readers (T1).

## Verification Log
