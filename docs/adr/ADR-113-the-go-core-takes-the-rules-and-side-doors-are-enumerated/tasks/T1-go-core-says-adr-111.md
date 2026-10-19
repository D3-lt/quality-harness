# Task ADR-113-T1: The Go core says everything ADR-111 added

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** see ADR-113's Inter-task Contracts
**Consumes:** the config-problem origin (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Port ADR-111's five rules to the Go core and empty GO_LACKS and GO_GOLDENS (ADR-113, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/go-core-parity-adr-111.test.mjs` | add | the task's tests, each with a planted twin that must fail |
| ADR-113 Decision 1 sources | edit | named in the parent record's Context and Decision; the file list is completed as the task is built and recorded in its sign-off |

## Ordered Steps

1. [S1] Write the failing tests: the Go core speaks R5, the red-check opening, the baseline sentences, the tree-moved advice and the pytest sections as Node does; GO_LACKS and GO_GOLDENS are empty. Record the red run.
2. [S2] Implement on the Node path and in the Go core where the rule is a hook's, keeping them in parity.
3. [S3] Record a killed mutant per decision point, and add catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the Go core says what the Node path says about ADR-111's rules` | `tests/go-core-parity-adr-111.test.mjs` | R5, the red-check opening, the baseline sentences, the tree-moved advice and the pytest sections on both paths; GO_LACKS and GO_GOLDENS empty | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the finding's text, or the gate's output |
| 4 — it is used | every session and every gate run |

## Mutation Log

## Invariants

- Gates advise and two refusals are sanctioned (CLAUDE.md §3); nothing here adds a refusal outside them.
- The Node path and the Go core say the same thing at each commit.

## Risks

- A planted twin that does not fail proves nothing; each is shown failing in the same test.

## Stop Condition

Stop if a change would add a refusal outside the two sanctioned ones, or if parity cannot be kept without a design decision.

## Out of Scope

- ADR-110 T3's cutover (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
