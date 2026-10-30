# Task ADR-133-T3: Measure adopter reporting cost and preserve evidence scope

**Depends-on:** T2
**Blocked-on:** Comparable private before/after host captures are available with owner authorization; checked by: Zy
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** completion-proof-v1 (T1), completion-case-evidence-v1 (T2)
**Data dependency:** needs actual adopter captures, identity evidence and a frozen comparison
**Proof map:** v1

## Goal

Measure reporting noise and observed usefulness without conflating source tests, delivery or model claims.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-133-completion-claims-name-their-evidence/protocol.md` | edit before sampling | Freeze comparable workloads and observation bounds |
| `docs/research/2026-10-30-completion-claims.md` | edit | Publish counts and limits without private content |

## Ordered Steps

1. [S1] Establish failing comparison controls: extra repeated output is a noise regression, missing CPU observation cannot be zero, and an older pending checkpoint cannot overturn observed same-target delivery. [proof: human: inspect the preregistered positive and negative comparison controls]
2. [S2] Freeze comparable Mac and Windows host captures, subject identities, trace, budgets and useful-effect criteria before sampling. Reuse ADR-131 T3 methodology and suitable existing captures; do not repeat a foreign corpus probe merely for this report. [proof: human: inspect preregistration and eligibility of retained captures]
3. [S3] Count actual delivered QH context, completion-report characters, unsolicited launches/nags and required findings; record wall/cost and CPU coverage separately. [proof: human: inspect private captures and counts-only extraction]
4. [S4] Produce a scoped completion handoff referencing the authoritative observation, reconcile a stale-recall example, and report benefit as observed, missed or unproven. [proof: human: inspect handoff identity, historical evidence and reported limitations]

## Acceptance

Acceptance is human-observed: inspect the preregistered paired report, actual Mac and Windows receipts, and stale-status
handoff. Confirm zero added unchanged-turn hook output, zero automatic project-check launches or retired nags, retained
required findings, and the frozen report-cost criterion. Name sample size, identities, primary metric and each missing
coverage scope. Inconclusive CPU/productivity evidence remains unknown; missing captures cannot receive sign-off.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|

This task observes real host output and evidence reconciliation; it does not claim a unit-test substitute.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | Reporting reference and T2 case evidence |
| 2 — selected | Actual host captures identify the producer and candidate |
| 3 — discoverable | Normal skill route remains unchanged |
| 4 — used | Private adopter receipts and scoped counts |

## Mutation Log

## Invariants

Keep raw foreign content private. Separate actual observations from estimates and missing coverage from zero.

## Risks

Adopter workloads can drift; reject incomparable pairs while retaining them with a reason. A historical failure sample is not healthy-adopter evidence.

## Out of Scope

- memoryd retrieval implementation is external to this task; follow the ADR's ownership boundary.

## Stop Condition

Stop on incomparable workloads, absent host captures, lost subject identity or exceeded budget. Do not relabel a missed criterion as success.

## Verification Log
