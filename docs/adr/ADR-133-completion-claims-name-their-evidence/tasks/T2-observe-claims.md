# Task ADR-133-T2: Observe reports on frozen misleading-completion cases

**Depends-on:** T1
**Blocked-on:** The owner authorizes the frozen model-run budget and the named host/model is available; checked by: Zy
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** completion-case-evidence-v1
**Consumes:** completion-proof-v1 (T1)
**Data dependency:** needs actual host/model executions and private report capture
**Proof map:** v1

## Goal

Observe whether the selected reporting guidance preserves required distinctions without unsupported positive claims.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-133-completion-claims-name-their-evidence/protocol.md` | edit before sampling | Pin subjects, prompt routing, cases and budget |
| `docs/research/2026-10-30-completion-claims.md` | add | Counts, observed scope, failures and limits |

## Ordered Steps

1. [S1] Establish the failing report controls before freezing the cases: a knowingly unsupported positive claim and a report omitting every required distinction must both fail. [proof: human: inspect the frozen cases and both rejected report controls]
2. [S2] Pin the baseline/candidate, host/model/effort, route per case, balanced order, grader and owner-approved budget before running. [proof: human: inspect immutable preregistration before the first receipt]
3. [S3] Run the paired reports through the actual selected skills, keeping tool facts identical; retain every output and failure privately. [proof: human: inspect actual host receipts and selected skill identities]
4. [S4] Grade only actual claims, score missing required distinctions separately, and publish counts with limitations. [proof: human: inspect blinded reports against the frozen case facts]

## Acceptance

Acceptance is human-observed: inspect the frozen protocol and complete paired host receipts, confirm every candidate case
reports its required distinction and contains no unsupported positive claim, and reject both negative controls. Name
the tested host/model, candidate, case coverage and omitted or unavailable runs in the sign-off. Missing runs are unproven.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|

Actual report behavior is human-observed; a structural unit test is not substituted for it.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | T1 reference and case protocol |
| 2 — selected | Captured actual skill selection per case |
| 3 — discoverable | Existing host skill route, not a pasted substitute instruction |
| 4 — used | Actual report receipts, not reviewer predictions |

## Mutation Log

## Invariants

No task-wide done state is inferred from missing observations. An omission cannot pass by making no positive claims.

## Risks

Model variance limits this bounded trial. Human graders use frozen facts and blinded arms; disagreements remain reported.

## Out of Scope

- General productivity and adopter cost are T3.

## Stop Condition

Stop at the preregistered budget or on missing host/receipt coverage. Preserve failures; do not change cases after seeing them.

## Verification Log
