# Task ADR-101-T1: The session log has one verdict reader; treeChecked is gone

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one module, its caller, one new test)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the two spellings agree on every generated log`, `no caller asks treeChecked`, `the goldens, tables and catalogue are unchanged`

## Goal

Every verdict over the session log comes from `checkStanding`, proven equal to the removed `treeChecked` on generated logs.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/check-ledger.mjs` | edit | `treeChecked` removed |
| `plugin/scripts/completion-rules.mjs` | edit | `:418, :442, :573, :576, :647, :660, :692` ask `checkStanding(...) === 'passed'` |
| `tests/one-verdict-reader.test.mjs` | add | the equivalence over generated logs, and the export gone |
| `tests/evidence-flip.test.mjs` | edit | its reader table's `treeChecked` row (0 locks, 2026-10-13) |
| `tests/mutations/plugin/scripts/check-ledger.mjs.json`, `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | entries on the removed or changed lines repointed |

## Ordered Steps

1. [S1] Write `tests/one-verdict-reader.test.mjs`: generate session logs over pass and fail events, duplicate imports, tied `seq`, tied `startedAt`, stamped beside unstamped, and a torn log; assert `treeChecked === (checkStanding === 'passed')` on each, and that `check-ledger.mjs` exports no `treeChecked`. Run the fence red (the export is still there). [proof: acceptance]
2. [S2] Replace every call in `completion-rules.mjs`; remove `treeChecked`; move the equivalence half of the test to compare against a copy of the removed body kept in the test, so it still proves what it proved. [proof: acceptance]
3. [S3] Repoint the catalogue entries the edit staled (`mutate.mjs --stale`), then run every entry on both files (CLAUDE.md §18). [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/one-verdict-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (the session log verdict is checkStanding passed on every generated log|check-ledger exports no treeChecked)$')" = 2 \
  && node --test tests/hook-goldens.test.mjs tests/completion-judgement.test.mjs tests/publish-judgement.test.mjs tests/evidence-flip.test.mjs tests/observed-events.test.mjs \
  && node scripts/mutate.mjs --stale
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the session log verdict is checkStanding passed on every generated log` | `tests/one-verdict-reader.test.mjs` | the removed spelling and the kept one agree on each generated shape | — | S1, S2 |
| `check-ledger exports no treeChecked` | `tests/one-verdict-reader.test.mjs` | the second spelling cannot come back | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `completion-rules.mjs` calls `checkStanding`; the catalogue entries on those lines |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every Stop and PreToolUse judgement |

## Mutation Log
- 2026-10-13 · e6a00957* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · a commit whose check is unresolved or unknown reads verified; the caller no longer asks the one verdict reader · acceptance-sha256:ccd96ed7dc94acef384cea0c0abaecf589af9a247f0973bc83c42051e63bb0ab · covers:no caller asks treeChecked
- 2026-10-13 · e6a00957* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · an order that cannot be established certifies, where the removed spelling refused it · acceptance-sha256:ccd96ed7dc94acef384cea0c0abaecf589af9a247f0973bc83c42051e63bb0ab · covers:the two spellings agree on every generated log
- 2026-10-13 · e6a00957* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · R2 names a commit whose tree a check passed on as unchecked · acceptance-sha256:ccd96ed7dc94acef384cea0c0abaecf589af9a247f0973bc83c42051e63bb0ab · covers:the goldens, tables and catalogue are unchanged

## Invariants

- No hook golden, decision table or catalogue verdict changes.
- The locked tests of `tests/observed-events.test.mjs` (245 locks, 2026-10-13) stay byte-identical.

## Risks

- A locked test calls `treeChecked`: `test-locks.py` before S2, and stop if one does.

## Stop Condition

Stop and ask if a generated log makes the two spellings disagree, or if a locked test names `treeChecked`.

## Out of Scope

- `latestCheckFor`'s field reads (they are not verdicts).

## Verification Log
- 2026-10-13 · e6a00957* · exit 1 · `test "$(node --test --test-reporter=tap tests/one-verdict-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (the session log verdict is checkStanding passed on every generated log|check-ledger exports no treeChecked)$')" = 2 \ …` · acceptance-sha256:ccd96ed7dc94acef384cea0c0abaecf589af9a247f0973bc83c42051e63bb0ab · ms:203 · test-lock-sha256:fe36dd297931c3e1d83f908907fcb04688de1620e8c8869518cb657d3f57c105 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvb25lLXZlcmRpY3QtcmVhZGVyLnRlc3QubWpzCWNoZWNrLWxlZGdlciBleHBvcnRzIG5vIHRyZWVDaGVja2VkCWJmMTY2NGY0MTg0MDg4ZDk4YTdmYjRmYjExNjY3OTZjYWRlMDVmZDQ2MDM3Zjk4ZDE1NmIwM2MxOWYwZGQwYTkKYm9keQl0ZXN0cy9vbmUtdmVyZGljdC1yZWFkZXIudGVzdC5tanMJdGhlIHNlc3Npb24gbG9nIHZlcmRpY3QgaXMgY2hlY2tTdGFuZGluZyBwYXNzZWQgb24gZXZlcnkgZ2VuZXJhdGVkIGxvZwkyOGI5ZjI0NzBkZDUwY2U1ODVmMDlhODY2ZGZkZGM4MDg0MmYwZjI3M2M2ODVhNTJiNWNjMDQ4YjU4N2RlY2Nj
  ```
  ```
- 2026-10-13 · e6a00957* · exit 0 · `test "$(node --test --test-reporter=tap tests/one-verdict-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (the session log verdict is checkStanding passed on every generated log|check-ledger exports no treeChecked)$')" = 2 \ …` · acceptance-sha256:ccd96ed7dc94acef384cea0c0abaecf589af9a247f0973bc83c42051e63bb0ab · ms:69215
- 2026-10-13 · e6a00957* · exit 0 · `test "$(node --test --test-reporter=tap tests/one-verdict-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (the session log verdict is checkStanding passed on every generated log|check-ledger exports no treeChecked)$')" = 2 \ …` · acceptance-sha256:ccd96ed7dc94acef384cea0c0abaecf589af9a247f0973bc83c42051e63bb0ab · ms:47001
- 2026-10-13 · e6a00957* · exit 0 · `test "$(node --test --test-reporter=tap tests/one-verdict-reader.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (the session log verdict is checkStanding passed on every generated log|check-ledger exports no treeChecked)$')" = 2 \ …` · acceptance-sha256:ccd96ed7dc94acef384cea0c0abaecf589af9a247f0973bc83c42051e63bb0ab · ms:46970
