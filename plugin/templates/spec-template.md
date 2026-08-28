# Spec: <Verb + noun title>

> **Date:** YYYY-MM-DD · **Status:** Grilling | Draft | Ready-for-ADR | Superseded
> **Owner:** <name> · **Becomes:** ADR-NNN (`<adr path>`) | standalone
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** <ADR/doc paths or none>

## Problem

<What hurts today, ≤3 lines. Cite evidence (file, incident, metric), not hypothesis. Prose — humans read this.>

## Goal

<Target outcome, one line. A number beats an adjective.>

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| <name> | human role \| system \| scheduled job \| external service | <what they want> |

## Use Cases

### UC-1: <Actor> <verb-phrase goal>

- **Trigger:** <event> · **Preconditions:** <state that must hold>
- **Main flow:**
  1. <step>
- **Failure paths:** <a. at step N, condition X → outcome — each becomes a [failure] scenario>
- **Postconditions:** <state guaranteed after main flow>

## Scenarios

<Markdown Gherkin is the human-readable layer; the bound test is the executable truth.
Heading grammar (parsed by spec-verify — keep exact): `### UC<n>-S<m> [happy|failure] <title> [@draft|@spec|@implemented] → `path::name``
≥1 happy + ≥1 failure per UC. A failure Then is explicit — never silent. Test may be `— to bind` only while [@draft].>

### UC1-S1 [happy] <declarative outcome, present tense> [@draft] → `— to bind`

```gherkin
Given <established state>
When <single action>
Then <observable outcome>
```

### UC1-S2 [failure] <failure path a> [@draft] → `— to bind`

```gherkin
Given <state>
When <action under adverse condition>
Then <safe, explicit failure outcome>
```

## Facts

<The registry — replaces prose invariants. Every behavioral decision from the grill lands here.
Lifecycle: **@draft** (decided, no test yet) → **@spec** (test committed & collectable — MAY FAIL: that is the TDD red state; required for Ready-for-ADR) → **@implemented** (test passes; flipped during /quality-harness:adr-execute).
Cmd column only when the stack default (see spec-verify) is wrong for that fact.>

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | <must-never-be-invalid statement> | `— to bind` | @draft | |

## Domain

<Entities + relationships, state machines, ubiquitous language — ≤5 lines. Invariants live in Facts. Storage/schema detail deferred to ADR time.>

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| <API route/schema/event/config/CLI> | <add/modify/remove> | <who breaks if this drifts> |

<If none: `None — implementation-internal only`. The ADR's Wiring section inherits this by reference — do not re-transcribe there.>

## Non-Goals

- <explicit exclusion + why — the ADR's Out of Scope inherits by reference>

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| <risk> | Low/Med/High | Low/Med/High | <mitigation> |

<Owned here; the ADR inherits by reference, listing deltas only.>

## Open Questions

<MUST be empty before Ready-for-ADR — spec-verify enforces. Each entry: question · owner · blocking Fact ID (the @draft fact it blocks).>

## Verify

```bash
spec-verify --spec <path to this file>
```

## Grill Log (appendix)

<Fact cell: the Fact ID the decision minted (`F-n`), or `non-behavioral` for naming/sequencing/ownership decisions.>

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | <asked> | F-1 | <one line> |
