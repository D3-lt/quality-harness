# Task ADR-117-T2: Every log row adr-verify writes leaves a receipt, and adr-lint refuses an uncommitted row without one

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `receipts.jsonl` and the receipt rule
**Consumes:** the state-directory refusal (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

adr-verify appends a receipt for every Verification and Mutation Log row it writes, and adr-lint refuses a row the committed file does not hold and no receipt names (ADR-117, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/log-receipts.test.mjs` | add | the task's test, with a planted twin that must fail |
| `plugin/bin/adr-verify`, `plugin/lib/record.py` | edit | the receipt for every row written |
| `plugin/bin/adr-lint` | edit | the rule, beside the digest-less one |

## Ordered Steps

1. [S1] Write the failing test, with the twins that must pass. Record the red run.
2. [S2] Write the receipt in every writer path (run, mutant, human sign-off, human mutant, relock), and the rule in adr-lint.
3. [S3] Record a killed mutant per decision point, with catalogue entries for Node and Python sources; Go mutants through adr-verify with a fence that builds `qh`. [proof: mutation]

## Acceptance

```bash
node --test tests/log-receipts.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a hand-typed uncommitted log row is refused, and every row adr-verify writes carries a receipt` | `tests/log-receipts.test.mjs` | each writer path leaving its receipt; a typed row refused; a committed row passing with no receipt; a repository with no state directory accusing nothing | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the refusal's or the finding's text |
| 4 — it is used | every session and every gate run |

## Mutation Log

## Invariants

- Gates advise and the sanctioned refusals are the only refusals (CLAUDE.md §3); this task adds only what ADR-117 sanctions.
- Node and the Go core say the same thing at each commit.

## Risks

- A writer path missed leaves its own rows refused; each is in the test.

## Stop Condition

Stop if a writer path cannot reach the task's state directory.

## Out of Scope

- A program that writes a ledger itself (permanent: boundary: a hook sees tool calls and command text, not what a program does)

## Verification Log
