# ADR-NNN: <Verb + noun title>

**Status:** Proposed | Accepted | Superseded by ADR-XXX | Withdrawn
**Date:** YYYY-MM-DD
**Owner:** <name or role>
**Spec:** <path to the Ready-for-ADR spec, or `None — no spec stage`>
**Cross-references:** <ADR/doc paths or none>
**Invalidates:** <accepted ADRs whose tasks this decision changes, or `none — checked`>
**Served-path change:** <what a user or agent experiences differently once this ships — one sentence naming the code path — or `None — this ADR changes only measurement or tooling`>

<Required, and the escape is deliberately explicit rather than omitted, because "we improved the
measurement" reads exactly like "we improved the thing" in a commit log and in a status report.
Measured on one corpus, 2026-08-21: of twelve ADRs, the three about retrieval QUALITY had shipped
only their measuring halves — one was marked complete with five of five tasks done and every one of
them measurement — while every ADR that did change the served path was about plumbing, safety or
correctness. The code volume said the same thing: 3,540 lines of evaluation against 2,092 lines of
the pipeline being evaluated.

Nobody decided that. It is what happens when the measuring half is the pleasant half to build and
nothing asks the question at authoring time. This header asks it. `None — measurement only` is a
perfectly good answer; not being able to write the sentence is the finding.>

<Not a courtesy field. If this ADR removes, renames or re-scopes anything — a family of arms, a
contract, a default, a config key — grep every accepted ADR in the repo for what consumed it before
writing the Decision. A choice that looks local can silently halve a pre-registered criterion two
documents away, and the two only collide when both are executed in the same area, which may be
months later. `none — checked` means you looked.>

## Context

<Date every number and name what it was measured against: "98% of answers in the top 20, measured
2026-08-18 against the 5,020-drawer corpus" — never the bare figure. An undated measurement is
unfalsifiable the moment the data changes, and a task that copies one into a source comment ships
evidence that no longer exists.>

<Why this matters now. When a Spec exists, reference its Problem/Goal and add only decision-relevant context — do not re-transcribe. Keep short.>

## Existing Primitives Audit

<Existing modules/services/contracts that already solve part of this. State reuse/reshape/replace. If none, write `None — <reason>`.>

## Decision

<If the decision turns on a threshold, a gate or a pre-registered criterion, state in the same breath
what would make it FAIL and whether data that could produce that failure exists today. A criterion
nothing can falsify is not a decision procedure — it is a formality that authorises whatever comes
after it. Say which corpus, traffic or environment the criterion is valid for; a threshold is always
valid FOR a configuration, never in the abstract.>

<One concrete paragraph describing what will change.>

## Alternatives Considered

- **<Option>:** <what it is>. Rejected because <reason>.

## Component / Boundary Impact

<Components touched, ownership after change, and whether each has one reason to change. If internal-only, write `None — internal to <component>`.>

## Wiring & Contract Changes

<When a Spec exists: `Inherited from <spec> §Contracts Touched; delta:` + new rows only (or `none`). One owner per section — the spec owns the base table. Without a spec, fill the table:>

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| <contract/API/schema/config/event> | <change> | <producer> | <consumers> |

If none, write `None — implementation-internal only`.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| <symbol/field/API/config/event> | T<N> | T<N> | Yes/No + why |

Required for multi-task ADRs. If none, write `None`.

## Implementation

Use inline tasks for <=3 tasks; otherwise reference `tasks/README.md`. Every task must have files, ordered steps, acceptance command, tests, invariants, risks, stop condition, and `Produces`/`Consumes`.

## Consequences

- **Positive:** <benefit>
- **Negative:** <cost/trade-off>
- **Neutral:** <behavior change worth noting>

## Out of Scope

<When a Spec exists: `Inherited from <spec> §Non-Goals; delta:` + new bullets only (or `none`).
Every bullet ends with a disposition — untagged entries are rejected by `adr-lint`:
`(permanent[: why])` = deliberate boundary, dies here by design;
`(deferred: <pointer>)` = real work punted — pointer is an ADR id/path, spec fact, issue, or backlog file. `adr-debt <adr-dir>` sweeps deferred entries + open Follow-ups so they resurface at the next `/quality-harness:adr-write`.

**A pointer that resolves is not a pointer that was honoured.** Writing `(deferred: docs/adr/BACKLOG.md)`
does not put anything in BACKLOG.md; the pointer names a real file, `adr-debt` follows it, and the
sweep reports clean while the work exists nowhere. Measured 2026-08-20 on a nine-ADR corpus: 42 of
75 deferrals named a destination that had never heard of them. Same shape as the capability that is
finished and unreachable — the link exists, the receiving end does not know it. So: write the entry
at the destination in the SAME commit as the deferral, and name the source ADR there so the tie is
greppable. `adr-debt` now reports `UNRECEIPTED` when it is not.>

- <explicit non-goal> (permanent: <why this is a boundary, not a punt>)
- <punted work> (deferred: <pointer>)

## Risks

<When a Spec exists: `Inherited from <spec> §Risks; delta:` + new rows only (or `none`).>

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| <risk> | Low/Med/High | Low/Med/High | <mitigation> |

## Rollback

<How to undo. Required for persistent state, contracts, external integrations. Otherwise `None — <reason>`.>

## Follow-ups

- [ ] <item, or leave empty when authored>
