# Task ADR-121-T4: The Stop question is built from the evidence

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the evidence-built Stop question
**Consumes:** the contracts of T2 (ADR-121 Inter-task Contracts)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

On a premature disengagement (a done claim, edits since the last validation, a check that can start), the Stop continuation asks one question built from the changed paths and the check that covers them, replacing R1's generic text.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/self-evaluation.test.mjs` | create | T4's mechanism |
| `plugin/scripts/completion-rules.mjs` | edit | T4's mechanism |
| `core/hooks/turnend.go` | create | T4's mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a session that edited a.mjs and b.mjs after the last pass and ends with a done claim gets one question naming both paths and the check; a session with no done claim gets today's R1; a session whose check cannot start gets nothing (ADR-120 T11).
2. [S2] Build the question in Node and Go.
3. [S3] Record a killed mutant per mechanism. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/self-evaluation.test.mjs 2>&1) \
  && for n in "a premature done gets one question built from its changed paths" \
      "a session that is not a premature done keeps today's finding"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a premature done gets one question built from its changed paths` | `tests/self-evaluation.test.mjs` | the question | — | S1, S2 |
| `a session that is not a premature done keeps today's finding` | `tests/self-evaluation.test.mjs` | the twin | — | S1, S2 |

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

Stop if the done claim cannot be read from the transcript the hook receives.

## Out of Scope

- See the parent record (permanent: boundary: the parent record's Out of Scope applies to every task)

## Verification Log
