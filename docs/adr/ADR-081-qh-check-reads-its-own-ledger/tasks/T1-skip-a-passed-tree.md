# Task ADR-081-T1: qh-check skips a tree whose latest check passed, and says how long a run took

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, F-5, F-6, F-7, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5, UC1-S6, UC1-S7
**Estimated scope:** M (qh-check's start and result line, seven tests)
**Owner:** unassigned
**Produces:** `qh-check`'s option parsing
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the latest record decides`, `--again runs it`, `an unseen write runs it`, `the skip precedes the lease`

## Goal

Before taking the lease, `qh-check` skips a tree whose latest same-command record passed, unless `--again`, a torn ledger, a failed observation or an unseen write says otherwise; every run says its duration (ADR-081 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-check.mjs` | edit | the pre-lease observation and ledger read; `--again`; the duration; the usage |
| `plugin/bin/qh-check` | edit | its usage names `--again` |
| `tests/qh-check-reads-the-ledger.test.mjs` | edit | remove `todo` from this task's seven tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the seven tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Before the lease, observe the tree and read `checks.jsonl` whole; take the latest record, by position, for the same command and that tree; skip only when it grades `check.passed`.
3. [S3] Parse `--again`, which skips step S2; a torn ledger, a failed observation and no git run the check.
4. [S4] When `CLAUDE_CODE_SESSION_ID` names a session whose log holds an unobservable write no pass has cleared (`unobservableWrites`), run the check.
5. [S5] Name the duration in the result line and the pass's time and duration in the skip line; keep the post-wait observation for a run.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/qh-check-reads-the-ledger.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a tree whose latest check passed is not checked again, and says when and how long|--again runs a tree that already passed|a changed tree, a torn ledger or a failed run checks again|a pass followed by a failure on the same tree checks again|a write git cannot see, after the pass, checks again|a skip waits for no lease|every run says how long it took)' "$T")" -eq 7
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a tree whose latest check passed is not checked again, and says when and how long` | `tests/qh-check-reads-the-ledger.test.mjs` | one run; the skip line's time and duration; no second record | F-1, UC1-S1 | S2, S5 |
| `--again runs a tree that already passed` | `tests/qh-check-reads-the-ledger.test.mjs` | two runs | F-2, UC1-S2 | S3 |
| `a changed tree, a torn ledger or a failed run checks again` | `tests/qh-check-reads-the-ledger.test.mjs` | held: each case runs | F-3, UC1-S3 | S3 |
| `a pass followed by a failure on the same tree checks again` | `tests/qh-check-reads-the-ledger.test.mjs` | the latest record decides | F-4, UC1-S4 | S2 |
| `a write git cannot see, after the pass, checks again` | `tests/qh-check-reads-the-ledger.test.mjs` | held: the check runs | F-5, UC1-S5 | S4 |
| `a skip waits for no lease` | `tests/qh-check-reads-the-ledger.test.mjs` | a skip under a live lease returns at once | F-6, UC1-S6 | S2 |
| `every run says how long it took` | `tests/qh-check-reads-the-ledger.test.mjs` | `passed in <n>s` | F-7, UC1-S7 | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seven tests |
| 2 — something selects it | `runCheck`, before the lease is taken |
| 3 — the caller can discover it | the skip line and the usage text |
| 4 — it is used | every `qh-check` an adopter runs |

## Mutation Log

## Invariants

- No record is written for a run that did not happen.
- A torn ledger never skips (ADR-005).

## Risks

- Two observations per run that misses: the cost is one `observe()`, measured before shipping.

## Stop Condition

Stop and ask if skipping needs a change to the record format.

## Out of Scope

- `--fast` — T2.

## Verification Log
