# Task ADR-121-T6: The watcher is measured in the bench, with a kill criterion

**Depends-on:** T3, T4, T5
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the P-watch arm's verdict
**Consumes:** the contracts of T3, T4, T5 (ADR-121 Inter-task Contracts)
**Data dependency:** the bench peer's stage rows
**Proof map:** v1

## Goal

The bench peer runs P-watch against P in ADR-163's stage; the watcher becomes the default only on cost's 99% upper bound below P's and solved's lower bound above −0.10; otherwise it stays opt-in.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/BENCHMARKS.md` | edit | T6's mechanism |

## Ordered Steps

1. [S1] Ask the bench peer for the P-watch arm at a tag carrying T1 to T5, with the switch named. [proof: human: the peer's answer, cited by location]
2. [S2] Read the verdict at 40 paired tasks per model. [proof: human: the owner reads the verdict]
3. [S3] Record the decision in docs/BENCHMARKS.md. [proof: acceptance]

## Acceptance

```bash
grep -q 'ADR-121 T6' docs/BENCHMARKS.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|


## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or watcher path that calls it |
| 3 — the caller can discover it | `qh nudges`, the finding text, the record |
| 4 — it is used | every session once T3 ships |

## Mutation Log

## Invariants

- With no watcher running, every hook answers exactly as before this record.
- The sanctioned refusals are unchanged.

## Risks

- See the parent record's Risks.

## Stop Condition

Stop if the peer's stage cannot run the arm: the watcher stays opt-in, and the record says why.

## Out of Scope

- See the parent record (permanent: boundary: the parent record's Out of Scope applies to every task)

## Verification Log
