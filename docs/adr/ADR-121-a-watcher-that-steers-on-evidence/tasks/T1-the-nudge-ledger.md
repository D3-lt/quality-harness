# Task ADR-121-T1: Every finding gets an outcome, and `qh nudges` reports them

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `nudge.outcome` rows; `qh nudges`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Every finding a hook emits gets an outcome (acted, ignored, contradicted, pending, unknown) read from the session's later events, and, where the log cannot decide it, from a bounded tail of the host's transcript (the agent's own words are never the outcome, only what it did); each finding also records its cost until its outcome (active minutes with idle gaps over ten minutes dropped, fresh tokens without cache reads, files touched). `qh nudges` reports emissions, outcomes and cost per rule and project, read-only. Amended 2026-10-21 from prior art (ADR-121 Decision 8).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/nudge-ledger.test.mjs` | create | T1's mechanism |
| `core/hooks/nudges.go` | create | T1's mechanism |
| `core/cmd/qh/main.go` | edit | T1's mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a session log where R1 is followed by a qh-check run recorded after it reads acted; one where the check ran before the emission (an earlier record imported later) does not; one where the turn ends with no check reads ignored; a refused publish request after a refusal-advice reads contradicted, an allowed one does not; a shell command's result reads unknown; a session still open reads pending; `qh nudges` prints the counts per rule, unknown and pending apart; a log with no findings prints none.
2. [S2] Classify outcomes from the events after each `action.emitted` row, in Go, by recorded order; the watcher writes `nudge.outcome` rows, the hooks write nothing new.
3. [S3] Hand-label ten real sessions of this repository and compare: the record carries the agreement rate, and T2 waits on it. [proof: human: the labelled sample, read by the owner]
4. [S4] Record a killed mutant per mechanism. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/nudge-ledger.test.mjs 2>&1) \
  && for n in "a finding after which the agent runs the named command reads acted" \
      "qh nudges reports emissions and outcomes per rule"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a finding after which the agent runs the named command reads acted` | `tests/nudge-ledger.test.mjs` | the classifier | — | S1, S2 |
| `qh nudges reports emissions and outcomes per rule` | `tests/nudge-ledger.test.mjs` | the report | — | S1, S2 |

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

Stop if outcomes cannot be classified from events the log already holds: the missing event is named first.

## Out of Scope

- See the parent record (permanent: boundary: the parent record's Out of Scope applies to every task)

## Verification Log
