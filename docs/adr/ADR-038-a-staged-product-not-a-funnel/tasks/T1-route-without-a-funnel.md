# Task ADR-038-T1: Route without a funnel

**Depends-on:** none
**Covers:** F-3, F-4, F-5, F-6, F-7, F-13, F-14, F-18, F-19, F-25, F-27, F-28, F-29, F-30, F-31, UC1-S1, UC1-S2, UC1-S3, UC4-S1, UC4-S2, UC4-S3, UC4-S4, UC4-S5, UC4-S6, UC4-S7, UC4-S8, UC4-S9
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** `observe().look`, namespaced STAGES, two adr-write arms
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`work-next` names Core on an empty tree, UNPROVEN when git cannot list, and a because-line that matches the arm that fired.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/work-next.mjs` | edit | observe listing, nextStage, Next/when text |
| `tests/staged-product.test.mjs` | add | bindings for the routing facts |
| `tests/lifecycle.test.mjs` | edit | git init fixtures; empty tree is not spec-write |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Change `observe` / `nextStage` / CLI prose so those tests pass. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'empty tree is not routed|discovery failure, not spec-write|could-not-look is UNPROVEN|null-stage leftover|skill names are namespaced|two adr-write arms|Ready-for-ADR spec with no covering|unreadable spec Status|disk-only specs and tasks|Proposed and Draft unfinished' tests/staged-product.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an empty tree is not routed to spec-write` | `tests/staged-product.test.mjs` | empty tree Next line | F-13, UC1-S1 | S1, S2 |
| `the two adr-write arms print different because-lines` | `tests/staged-product.test.mjs` | because-line matches the arm | F-19, F-29, UC4-S2, UC4-S7 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/staged-product.test.mjs` |
| 2 — something selects it | `work-next.mjs` `main` prints `nextStage` |
| 3 — the caller can discover it | `/quality-harness:work` and the CLI |
| 4 — it is used | this repository's own corpus still reaches adr-execute / adr-verify |

## Mutation Log

## Invariants

- `trackedPaths` returning null is UNPROVEN, never zero specs or zero tasks.
- Skill Next lines use `/quality-harness:`; `adr-verify` stays unprefixed.

## Risks

- Existing observe() tests on non-git temp dirs go UNPROVEN — mitigated by git init in those fixtures.

## Stop Condition

A routing test that cannot fail on an empty tree, or that treats git failure as zero files.

## Out of Scope

- Cursor / OpenCode adapters (T3 / F-17)

## Verification Log
