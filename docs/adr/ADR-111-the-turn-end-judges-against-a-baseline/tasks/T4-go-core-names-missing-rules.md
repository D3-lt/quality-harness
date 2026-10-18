# Task ADR-111-T4: The Go core's missing rules are named, not broken

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (the parity and golden harness, and ADR-110's Follow-ups)
**Owner:** Zy
**Produces:** the rules the Go core lacks, named in the parity tests
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The Go core is frozen at its parity while the Node path gains ADR-111's rules: the tests that run against Go name each rule
it lacks and skip only that, with the reason, so the core's coverage is said rather than red (ADR-111, Decision 6).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/hook-golden.mjs` | edit | a list of scenario names Go does not implement yet, each with its ADR, read by a `goSkip(name)` helper |
| `tests/qh-core-parity.test.mjs` | edit | the same list for the classifier and ledger rows it compares |
| `docs/adr/ADR-110-a-static-core-owns-the-hooks.md` | edit | a Follow-ups line: T2 and T3 wait on ADR-112's verdict (an append) |

## Ordered Steps

1. [S1] Write the failing test: with `QUALITY_HARNESS_HOOK_IMPL=go`, a scenario on the list is skipped with its reason, and a scenario not on it still runs; a name on the list that no scenario has is red. Record the red run.
2. [S2] Add the list and the helper; append ADR-110's Follow-up.

## Acceptance

```bash
node --test tests/qh-core-parity.test.mjs tests/hook-goldens.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a rule the Go core lacks is skipped by name with its reason, and a stale name is red` | `tests/hook-goldens.test.mjs` | the list and its twin | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the list |
| 2 — something selects it | CI's `core` job, which runs these files against the Go binary |
| 3 — the caller can discover it | the skip reason in the job's output |
| 4 — it is used | T2 and T3 add their names to it |

## Mutation Log

## Invariants

- A scenario not on the list runs against Go exactly as before.

## Risks

- The list grows until ADR-110 resumes; its length is the port's debt, and stays visible.

## Stop Condition

Stop if skipping a scenario on Go would also skip it on Node.

## Out of Scope

- Porting the rules (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
