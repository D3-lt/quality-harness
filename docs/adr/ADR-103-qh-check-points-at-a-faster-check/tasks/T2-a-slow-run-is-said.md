# Task ADR-103-T2: a slow run is said against its own history

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one function, one call site, one test file)
**Owner:** unassigned
**Produces:** `slowRunLine(records, command, ms)` in `plugin/scripts/check-ledger.mjs`
**Consumes:** none
**Data dependency:** hermetic; ledgers written by the test, and the real `qh-check` over a fixture repository
**Proof map:** v1

## Goal

After a full run, when `checks.jsonl` holds at least five earlier passes of the same command, not counting this run or a reused
row, and this run took at least 1.5 times the median of the last 20, `qh-check` says so in one line (ADR-103, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/check-ledger.mjs` | edit | `slowRunLine`: passes only (`checkEventName(record) === 'check.passed'`, no `reusedFrom`), the same command, the last 20 before this run, the lower-middle median |
| `plugin/scripts/qh-check.mjs` | edit | the call after a full run's record is written, never after a `--fast` run |
| `tests/slow-run.test.mjs` | create | the tests below |
| `tests/mutations/plugin/scripts/check-ledger.mjs.json` | edit | entries on the filters |
| `tests/mutations/plugin/scripts/qh-check.mjs.json` | edit | the entry on the fast-run gate |

## Ordered Steps

1. [S1] Add the tests below and record the red run (TDD red: no line is said).
2. [S2] Write `slowRunLine` over the ledger rows before this run's.
3. [S3] Call it from `qh-check.mjs` for a full run only; the line says the run's time, the ratio, the median and the pass count.
4. [S4] Record killed mutants on the five-pass floor, the passes-only filter, the reuse filter, the same-command filter, the
   window of 20, and the fast-run gate. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/slow-run.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - (a run half again its own median is said|a run within its history, or with too little of it, says nothing|only this command's own recent full passes make the median)")" = 3 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a run half again its own median is said` | `tests/slow-run.test.mjs` | over exactly five earlier passes, a run at 1.5x the median draws one line naming the time, the ratio, the median and 5; through `qh-check` on a fixture, and not after `--fast` | — | S1, S2, S3 |
| `a run within its history, or with too little of it, says nothing` | `tests/slow-run.test.mjs` | 1.4x draws nothing; four passes draw nothing; this run is not one of the five | — | S1, S2 |
| `only this command's own recent full passes make the median` | `tests/slow-run.test.mjs` | failed runs, reused rows and another command's passes are left out; with more than 20 passes only the last 20 count (a window that changes the median) | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `slowRunLine` |
| 2 — something selects it | `qh-check.mjs`'s run path |
| 3 — the caller can discover it | it is said on stderr after the run |
| 4 — it is used | the outside runs in ADR-103's Follow-ups |

## Mutation Log

## Invariants

- No verdict, exit code or ledger record changes (ADR-005); `contended` keeps its meaning (ADR-075).

## Risks

- The machine's load varies more than the check: the load and the checks beside the run are said on the lines `qh-check`
  already prints, right above this one.

## Stop Condition

Stop and ask if a reused row cannot be told from a run.

## Out of Scope

- Per-file times inside an adopter's run (permanent: boundary: the ledger holds the run's window, not its files, ADR-103)

## Verification Log
