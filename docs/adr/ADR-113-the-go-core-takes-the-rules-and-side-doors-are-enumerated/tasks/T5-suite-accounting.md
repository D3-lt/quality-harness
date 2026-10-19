# Task ADR-113-T5: Every test file is accounted for

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** see ADR-113's Inter-task Contracts
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Every tracked test file is reached by a runner and runs a test unless named exempt, every skip names its reason, an environment skip fails where CI requires the environment, and release evidence compares the run's jobs with the workflow's (ADR-113, Decision 5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/suite-accounting.test.mjs` | add | the task's tests, each with a planted twin that must fail |
| ADR-113 Decision 5 sources | edit | named in the parent record's Context and Decision; the file list is completed as the task is built and recorded in its sign-off |

## Ordered Steps

1. [S1] Write the failing tests: a planted file in a subfolder, a planted zero-test file, a reasonless skip and a required environment that is absent each fail. Record the red run.
2. [S2] Implement on the Node path and in the Go core where the rule is a hook's, keeping them in parity.
3. [S3] Record a killed mutant per decision point, and add catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/suite-accounting.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every test file is reached, runs a test, and every skip names its reason` | `tests/suite-accounting.test.mjs` | file reach, zero-test files, skip reasons, required environments and the release's job set, each with a planted twin | — | S1, S2 |

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
