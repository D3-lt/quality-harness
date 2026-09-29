# Task ADR-073-T1: A narrowed entry whose baseline runs fewer tests than it names is STALE

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one script, its test)
**Owner:** unassigned
**Produces:** `baselineOf(run, files, named)` and the `short` baseline state
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a short narrowed baseline is STALE`, `a complete narrowed baseline is measured`, `a hand-written pattern is not counted`

## Goal

A narrowed entry (ADR-072) whose baseline passes but runs fewer tests than its pattern names is graded STALE, with the shortfall in its detail, and fails the campaign. Its mutant is not applied. An entry whose pattern runs every name, and every entry with a hand-written pattern, is measured exactly as before.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `baselineOf`'s count; the baseline loop passes it for a narrowed set; `classify`'s STALE; the closing sentence |
| `tests/mutate-runner.test.mjs` | edit | a campaign over a scratch repository; ADR-069's, ADR-071's and ADR-072's locked tests stay byte-identical |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the test below and see it fail on an assertion (TDD red).
2. [S2] `baselineOf(run, files, named = 0)`: a passing baseline that ran fewer leaf tests than `named` is `{ state: 'short', ran, named }`. The baseline loop passes `namesOf(set.only)?.length ?? 0`. `classify` grades a `short` baseline STALE with `its pattern names <n> tests and <m> ran`, before any mutant is applied. The all-STALE closing sentence names a pattern as well as a `from`. [proof: acceptance]
3. [S3] Record mutants with `adr-verify --mutant`, one per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/mutate-runner.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (a narrowed entry whose baseline runs fewer tests than it names is STALE, and one that runs them all is measured)' | grep -qx 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a narrowed entry whose baseline runs fewer tests than it names is STALE, and one that runs them all is measured` | `tests/mutate-runner.test.mjs` | a gone killer and a skipped killer each make the entry STALE with the numbers and exit 1; with every killer defined it is RED and exits 0; a hand-written pattern selecting one of several tests is measured | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the `short` state and its test |
| 2 — something selects it | the campaign's baseline loop passes the count for a narrowed set |
| 3 — the caller can discover it | the STALE line names the shortfall |
| 4 — it is used | every campaign over ADR-072 T3's catalogue |

## Mutation Log

## Invariants

- ADR-006's `pass`, `fail` and `unrun` are unchanged for every call that passes no count, which is every existing one.

## Risks

- A killer skipped on one platform only fails that platform's campaign; the detail names the shortfall.

## Stop Condition

Stop and ask if the first campaign after ADR-072 T3 grades more than a handful of narrowed entries short: that would mean the narrowing itself, not a later rename, is wrong.

## Out of Scope

- Hand-written patterns (permanent: boundary: ADR-073 Out of Scope)

## Verification Log
