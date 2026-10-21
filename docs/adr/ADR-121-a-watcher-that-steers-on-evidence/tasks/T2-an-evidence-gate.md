# Task ADR-121-T2: Every intervention has a fact behind it, a cooldown and a budget

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the evidence gate
**Consumes:** the contracts of T1 (ADR-121 Inter-task Contracts)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A finding may reach the agent only with a concrete fact behind it, under per-rule cooldowns that widen after an advisory and reset after one acted on, a per-session budget of turn continuations, at most one block per rule per session and never two in one turn; each delivery records which wording it used, and wordings rotate so the ledger can tell a rule from its phrasing. Amended 2026-10-21 from prior art (ADR-121 Decision 8).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/evidence-gate.test.mjs` | create | T2's mechanism |
| `core/hooks/gate.go` | create | T2's mechanism |
| `plugin/scripts/completion-rules.mjs` | edit | T2's mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: R1 whose evidence (tree, check standing, rule key) is unchanged since it was delivered says nothing; a failed or unproven check recorded since, or a newly changed path in the check's scope, reopens it whatever the cooldown; a second R1 within its cooldown and on unchanged evidence says nothing; the cooldown widens after an unheeded advisory and resets after an acted one; a session past its continuation budget continues no turn; a sanctioned refusal is never withheld.
2. [S2] Implement the gate in Go and Node.
3. [S3] Record a killed mutant per mechanism. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/evidence-gate.test.mjs 2>&1) \
  && for n in "a finding with no fact behind it is not said" \
      "cooldowns and the budget hold"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a finding with no fact behind it is not said` | `tests/evidence-gate.test.mjs` | the gate | — | S1, S2 |
| `cooldowns and the budget hold` | `tests/evidence-gate.test.mjs` | the schedule | — | S1, S2 |

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

Stop if T1's agreement rate is below what the owner accepts: the gate would be built on an outcome nobody trusts.

## Out of Scope

- See the parent record (permanent: boundary: the parent record's Out of Scope applies to every task)

## Verification Log
