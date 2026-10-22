# Task ADR-123-T6: spec-write maps an existing repository into a living model

**Depends-on:** T1, T3, T5, T8
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the map mode
**Consumes:** the grill's round shape and checklist (T1); the Living model and its spec-verify judgement (T3); quality scenarios and the context map (T5); the observed grill (T8)
**Data dependency:** needs a repository to map; this one is the first
**Proof map:** v1

## Goal

spec-write's `map` mode scouts a repository, proposes goals, actors, capabilities, journeys, rules and contexts in rounds, writes
`docs/product/model.md` only on approval, and the written model passes spec-verify.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/skills/spec-write/SKILL.md` | edit | the `map` mode |
| `docs/product/model.md` | create | this repository's own model, mapped by the mode |

## Ordered Steps

1. [S1] Write the map mode: scout first, propose in rounds (T1), bind each rule to an existing test, write only on approval.
   [proof: human: the person reads the rounds the mode asked over this repository and approves or amends the model]
2. [S2] Map this repository and run `spec-verify --spec` and `--implemented` over the result. [proof: acceptance]

## Acceptance

Acceptance is human-observed: a person reads the mapped model of this repository, its spec-verify `--spec` and `--implemented`
output (every rule ran), and signs off naming the counts of goals, capabilities, journeys and rules.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | — | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the mode in the skill |
| 2 — something selects it | `/quality-harness:spec-write map` |
| 3 — the caller can discover it | the skill's description |
| 4 — it is used | this repository's model; T7 |

## Mutation Log

## Invariants

- Nothing is written before approval.
- Every rule binds to a test that exists.

## Risks

- A mapped model describes code as it is, bugs included; the owner reads the rules, not only their count.

## Stop Condition

Stop if the mapped model cannot pass `--implemented` without rules bound to tests written for the purpose: a map describes, it
does not author tests.

## Out of Scope

- Blueprints.

## Verification Log
