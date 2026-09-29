# Task ADR-074-T1: One Status reader, shared by the Python gates and pinned in lifecycle

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (record.py, four Python readers, lifecycle and adr-state, one new test file)
**Owner:** unassigned
**Produces:** `record_status(text)`, `status_kind(value)`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `every reader gives one Status the same reading`

## Goal

Every reader in ADR-074's class reads one record Status by Decisions 1-3: the label forms lifecycle accepts; every `*`, `_` and backtick removed; the kind by looking up the first lower-cased run of Unicode letters and digits. So `**Accepted**`, `_Accepted_`, `Accepted (Zy, 2026-09-01)` and `Status: Accepted` govern in every reader. `Acceptedé` and `Wıthdrawn` are undecided in every reader. `_Superseded by ADR-004_` names ADR-004 wherever a target is read.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `record_status(text)` and `status_kind(value)`; `RECORD_STATUS_WORDS` retired into them |
| `plugin/bin/adr-lint` | edit | `check_adr`, `check_status_allows_execution` and the no-tasks advice read through record.py |
| `plugin/bin/adr-next` | edit | `owning_record` and `record_undecided` read through record.py |
| `plugin/bin/adr-retire-check` | edit | `status_of` and `is_accepted_status` read through record.py (answers BACKLOG §313's open question: the first word) |
| `plugin/scripts/lifecycle.mjs` | edit | `statusKind`: the lookup, not a regex; `recordStatus` keeps ADR-063's markup rule |
| `plugin/scripts/adr-state.mjs` | edit | `isPending` uses lifecycle's kind |
| `tests/status-reading.test.mjs` | new | the parity table, run through every reader |
| `tests/chaos-315-codex-status.test.mjs` | edit | the 3.1.5 advice's markup clause is gone, because the readers now agree (not locked: `scripts/test-locks.py`) |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the parity test over one scratch corpus. Its rows are `Accepted`, `**Accepted**`, `_Accepted_`, `Acc**epted`, `Accepted (Zy, 2026-09-01)`, `Acceptedé`, `Wıthdrawn`, `Accepted` followed by U+1C89, `Proposed`, `_Superseded by ADR-004_`, `Implemented` and empty. It uses the label forms `**Status:**`, `Status:` and `**Status**:`. Each row is read by lifecycle's `adrCorpus`, `adr-state --json`, `adr-next --json`, adr-lint's execution check and adr-retire-check. See it fail (TDD red).
2. [S2] Add `record_status` and `status_kind` to record.py. Route adr-lint's, adr-next's and adr-retire-check's record readers through them.
3. [S3] Reshape lifecycle's `statusKind` to the lookup, and point adr-state's `isPending` at lifecycle's kind. Rewrite the 3.1.5 advice test's markup clause.
4. [S4] Record a mutant per rule with `adr-verify --mutant`: markup kept, a regex word end in place of the lookup, one reader bypassing the shared rule, and the label forms narrowed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/status-reading.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - every reader gives one Status the same reading'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every reader gives one Status the same reading` | `tests/status-reading.test.mjs` | lifecycle, adr-state, adr-next, adr-lint and adr-retire-check agree on every row and label form | none | S1, S2, S3 |

## Invariants

- `tests/record-identity.test.mjs` stays green unchanged: ADR-063's markup cases read as they do today.
- ADR-063's identity order is unchanged: this reads a Status, never a number.
- Class sweep, 2026-09-29: the command in ADR-074's Context. Each member is routed through the shared rule here, or named in the ADR as left out.

## Risks

- The Unicode-version skew between CI's Python 3.12 and Node 24 (ADR-074 Risks); the U+1C89 row shows whether it bites.

## Stop Condition

Stop and ask if a Status every reader agreed on at ebfaee0 reads differently after the change, or if `tests/record-identity.test.mjs` needs any edit.

## Out of Scope

- `## Status` sections (deferred: T2)
- Task, spec and architecture Status readers (permanent: boundary: ADR-074 Out of Scope)

## Verification Log

## Mutation Log
