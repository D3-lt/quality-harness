# Task ADR-121-T3: `qh watch`: one process per repository, answering hooks over a socket

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** `qh watch`; the hook client
**Consumes:** the contracts of T1, T2 (ADR-121 Inter-task Contracts)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`qh watch` tails every session log of a repository, keeps the state the rules need, answers hooks over a local socket, and retires a rule for this project when its acted rate falls below the threshold, telling the user once and keeping a `retired_by` trail of the ledger rows that decided it; with no watcher, hooks answer in-process. Where two installed copies of a hook would both answer (a home forwarder and the plugin), one stands down; each hook's budget is read from the timeout actually installed in the host's settings, not from a default. Amended 2026-10-21 from prior art (ADR-121 Decision 8).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/watcher.test.mjs` | create | T3's mechanism |
| `core/hooks/watch.go` | create | T3's mechanism |
| `plugin/scripts/lifecycle.mjs` | edit | T3's mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: with a watcher running, a hook's answer equals the in-process answer on every golden; with the watcher killed mid-session, hooks answer in-process; a rule below threshold over N emissions is retired and said once; a pinned rule is never retired.
2. [S2] Implement the watcher, the socket and the client fallback.
3. [S3] Update docs/architecture.md. [proof: human: the module map row, read in review]
4. [S4] Record a killed mutant per mechanism. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/watcher.test.mjs 2>&1) \
  && for n in "the watcher answers every golden as the in-process hook does" \
      "a rule ignored in this project is retired and said once"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the watcher answers every golden as the in-process hook does` | `tests/watcher.test.mjs` | parity | — | S1, S2 |
| `a rule ignored in this project is retired and said once` | `tests/watcher.test.mjs` | retirement | — | S1, S2 |

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

Stop if the host cannot reach a local socket from a hook within its timeout on every platform.

## Out of Scope

- See the parent record (permanent: boundary: the parent record's Out of Scope applies to every task)

## Verification Log
