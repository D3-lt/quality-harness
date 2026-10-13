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
- 2026-10-13 · e6a00957* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · a torn last line is read as a ledger, for both files at once · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · covers:both files answer every table row the same
- 2026-10-13 · e6a00957* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · passedAlready reads the fast ledger, so a fast pass skips the full check · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · covers:passedAlready and latestFastPass call ledgerPass
- 2026-10-13 · e6a00957* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · a failed or unproven latest row reads as a pass in either ledger · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · covers:the goldens, tables and catalogue are unchanged

## Invariants

- `passedAlready`'s and `latestFastPass`'s signatures and answers are unchanged; `tests/prose-reuse.test.mjs` (8 locks) stays byte-identical.

## Risks

- ADR-094's code-tree match is subtler than a tree match: it stays in `passedAlready`'s `match`, and the prose-reuse tests hold it.

## Stop Condition

Stop and ask if a table row cannot give the same answer for both files without changing what one of them answers today.

## Out of Scope

- The session log's readers (T1).

## Verification Log
- 2026-10-13 · e6a00957* · exit 1 · `test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \ …` · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · ms:181 · test-lock-sha256:c382195d047f9baa42d5dcbe2c64eb9caa00c2cfeeaa9b5b2c5d064d10f325c2 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvb25lLWxlZGdlci1yZWFkZXIudGVzdC5tanMJYm90aCBsZWRnZXIgZmlsZXMgYW5zd2VyIGV2ZXJ5IHJvdyBvZiB0aGUgc2hhcmVkIHRhYmxlIHRoZSBzYW1lCTdmNjRmYjYwMTVkNzBiODJkOGJiOGU0YWExMzRhZDRkY2YxODg3OGUxMjcxNDBhYTYxZDQ2OGI5MjRmMWNkMDkKYm9keQl0ZXN0cy9vbmUtbGVkZ2VyLXJlYWRlci50ZXN0Lm1qcwlwYXNzZWRBbHJlYWR5IGFuZCBsYXRlc3RGYXN0UGFzcyBhbnN3ZXIgd2hhdCBsZWRnZXJQYXNzIGFuc3dlcnMJMGY1ZWRhMTM1YzAwOWI4YWVhM2EzMWE2MTkxNzhiNWE5ZDMzMmQ2Yzc4ODJhZTg2YzQ5N2YwNzhkOWEzYTg2Zg
  ```
  ```
- 2026-10-13 · e6a00957* · exit 1 · `test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \ …` · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · ms:30187
  ```
  --- last 10 line(s) of stdout (of 69 after folding 69 raw)
    nearest now: plugin/scripts/check-ledger.mjs:12  * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
  0x  plugin/scripts/check-ledger.mjs :: ADR-081 T1: the first record on the tree decides instead of the latest
    nearest now: plugin/scripts/check-ledger.mjs:129  return record?.command === command && (sameTree || sameCode)
  0x  plugin/scripts/check-ledger.mjs :: ADR-081 review: a row that is not a record is read as one by the skip
    nearest now: plugin/scripts/check-ledger.mjs:34  if (typeof record?.id !== 'string') return null
  0x  plugin/scripts/check-ledger.mjs :: ADR-088 follow-up: qh-check's skip reads an unterminated last line as torn
    nearest now: plugin/scripts/check-ledger.mjs:12  * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
  0x  plugin/scripts/check-ledger.mjs :: ADR-094 T3: the unseen-write veto does not run for a reuse
    nearest now: plugin/scripts/check-ledger.mjs:40  if (unseenWriteSince(vetoRoot, { seen, seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  7 catalogue entries do not match the source exactly once
  ```
- 2026-10-13 · e6a00957* · exit 1 · `test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \ …` · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · ms:30329
  ```
  --- last 10 line(s) of stdout (of 69 after folding 69 raw)
    nearest now: plugin/scripts/check-ledger.mjs:12  * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
  0x  plugin/scripts/check-ledger.mjs :: ADR-081 T1: the first record on the tree decides instead of the latest
    nearest now: plugin/scripts/check-ledger.mjs:129  return record?.command === command && (sameTree || sameCode)
  0x  plugin/scripts/check-ledger.mjs :: ADR-081 review: a row that is not a record is read as one by the skip
    nearest now: plugin/scripts/check-ledger.mjs:34  if (typeof record?.id !== 'string') return null
  0x  plugin/scripts/check-ledger.mjs :: ADR-088 follow-up: qh-check's skip reads an unterminated last line as torn
    nearest now: plugin/scripts/check-ledger.mjs:12  * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
  0x  plugin/scripts/check-ledger.mjs :: ADR-094 T3: the unseen-write veto does not run for a reuse
    nearest now: plugin/scripts/check-ledger.mjs:40  if (unseenWriteSince(vetoRoot, { seen, seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  7 catalogue entries do not match the source exactly once
  ```
- 2026-10-13 · e6a00957* · exit 1 · `test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \ …` · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · ms:30465
  ```
  --- last 10 line(s) of stdout (of 69 after folding 69 raw)
    nearest now: plugin/scripts/check-ledger.mjs:12  * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
  0x  plugin/scripts/check-ledger.mjs :: ADR-081 T1: the first record on the tree decides instead of the latest
    nearest now: plugin/scripts/check-ledger.mjs:129  return record?.command === command && (sameTree || sameCode)
  0x  plugin/scripts/check-ledger.mjs :: ADR-081 review: a row that is not a record is read as one by the skip
    nearest now: plugin/scripts/check-ledger.mjs:34  if (typeof record?.id !== 'string') return null
  0x  plugin/scripts/check-ledger.mjs :: ADR-088 follow-up: qh-check's skip reads an unterminated last line as torn
    nearest now: plugin/scripts/check-ledger.mjs:12  * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
  0x  plugin/scripts/check-ledger.mjs :: ADR-094 T3: the unseen-write veto does not run for a reuse
    nearest now: plugin/scripts/check-ledger.mjs:40  if (unseenWriteSince(vetoRoot, { seen, seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  7 catalogue entries do not match the source exactly once
  ```
- 2026-10-13 · e6a00957* · exit 1 · `test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \ …` · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · ms:30243
  ```
  --- last 10 line(s) of stdout (of 69 after folding 69 raw)
    nearest now: plugin/scripts/check-ledger.mjs:12  * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
  0x  plugin/scripts/check-ledger.mjs :: ADR-081 T1: the first record on the tree decides instead of the latest
    nearest now: plugin/scripts/check-ledger.mjs:129  return record?.command === command && (sameTree || sameCode)
  0x  plugin/scripts/check-ledger.mjs :: ADR-081 review: a row that is not a record is read as one by the skip
    nearest now: plugin/scripts/check-ledger.mjs:34  if (typeof record?.id !== 'string') return null
  0x  plugin/scripts/check-ledger.mjs :: ADR-088 follow-up: qh-check's skip reads an unterminated last line as torn
    nearest now: plugin/scripts/check-ledger.mjs:12  * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
  0x  plugin/scripts/check-ledger.mjs :: ADR-094 T3: the unseen-write veto does not run for a reuse
    nearest now: plugin/scripts/check-ledger.mjs:40  if (unseenWriteSince(vetoRoot, { seen, seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  7 catalogue entries do not match the source exactly once
  ```
- 2026-10-13 · e6a00957* · exit 0 · `test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \ …` · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · ms:30217
- 2026-10-13 · e6a00957* · exit 0 · `test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \ …` · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · ms:30353
- 2026-10-13 · e6a00957* · exit 0 · `test "$(node --test --test-reporter=tap tests/one-ledger-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (both ledger files answer every row of the shared table the same|passedAlready and latestFastPass answer what ledgerPass answers)$')" = 2 \ …` · acceptance-sha256:f67bc094cced7934e17126810ad36ebb1a534c7c8ac583306228f1719cdc035d · ms:30452
