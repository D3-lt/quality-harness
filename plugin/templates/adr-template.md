# ADR-NNN: <Verb + noun title>

**Status:** Proposed | Accepted | Superseded by ADR-XXX | Withdrawn
**Date:** YYYY-MM-DD
**Owner:** <name or role>
**Spec:** <path to the Ready-for-ADR spec, or `None — no spec stage`>
**Cross-references:** <ADR/doc paths or none>

<RESOLVED, and advisory. Each item that names a record (`ADR-004`, or a path to one) must name a
record this corpus has, and each item that names a repository file must name one git tracks;
`adr-lint` advises when one does not. A `§NN` fragment is deliberately NOT resolved — it names a
heading, and guessing at it would turn a legitimate citation into a finding.>
**Governs:** <paths this decision is authoritative over — globs allowed — or `None — declared by its tasks`>

<Optional and additive. Without it, what this decision governs is resolved from the union of its
tasks' `## Affected Files` tables, which every conforming task already has; declare it here when the
decision is broader than the files that first implemented it (a directory, a whole surface), or when
it has no tasks. A record that declares its scope is a record tooling can hand to whoever edits
those files next, and the `adr-context` reader does exactly that — including for `Superseded` and
`Withdrawn` records, so nobody re-proposes an approach this team already killed.

The typed form from adrkit is also read:

    **Governs:**
    - type: path
      pattern: "src/orders/**"
    - type: package
      pattern: "mongodb@>=6"

Only `type: path` is resolved against files. Anything else is recorded and reported as unresolved —
a matcher that quietly matches nothing reads as coverage while covering nothing.

EVERY DECLARED PATH IS RESOLVED against the files git tracks, and `adr-lint` advises when one matches
nothing. A glob resolves when it matches at least one file; `**` crosses separators and `*` does not.
Resolution is against `git ls-files`, never the filesystem: a path check over the disk answers "is
this on THIS machine", which makes the answer depend on who is asking. When git cannot answer, the
gate says it could not look and resolves nothing — "I could not look" is not "the path names nothing".

The reason this is resolved at all: on 2026-08-28 a directory move re-anchored every path in a
repository, seven records' `Governs:` lines stopped naming anything, `adr-context` answered "none
governs" for the whole gate surface, and every gate stayed green for two days.>
**Enforced-by:** <the check that FAILS when this decision is violated, or `None — <reason>`>

<Optional and advisory. `Governs:` above says which paths this decision owns; this says what stops it
being broken. They are different questions, and a task's Acceptance answers neither — that proves the
task got DONE, not that the decision still holds a year later, and a task's tests are freely rewritten
once it is.

Three forms, ordered by how much they prove. `adr-lint` resolves each and reports the ones that
resolve to nothing:

    **Enforced-by:** `link: no skill is ever linked`
    **Enforced-by:** `tests/package.test.mjs::every shipped gate carries at least one mutation`
    **Enforced-by:** `adr-lint`

A MUTATION LABEL is the strongest: `mutate.mjs` grades it RED or GREEN on every campaign, so the
claim is measured rather than asserted. A TEST ID proves the check exists, not that it can fail —
that is ADR-003's rule and the campaign's job. A GATE NAME is the weakest and the broadest.

`None — <reason>` is a first-class answer, not a failure to fill something in. Most durable decisions
have no cheap mechanical enforcement, and a record that says so is carrying information the corpus
otherwise lacks. Naming a check that cannot fail is worse than naming none.>
**Invalidates:** <accepted ADRs whose tasks this decision changes, or `none — checked`>

<RESOLVED, and advisory: the LEADING TOKEN is read as a record id and must name a record this
corpus has — a decision cannot invalidate one that was never written. Only the leading token,
because the prose after it is prose: `ADR-001 — the clause of its Decision reading "…"` is one
pointer and a sentence, not a list.>
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
`(permanent: boundary: <reason>)` = a limit this ADR chooses;
`(permanent: fact: <claim>; citation: <typed receipt>)` = an external premise with exactly one
receipt: `file` followed by a backticked `<repository-path>:<line>`, `version` followed by a
backticked `<name>@<version>`, or `url` followed by `https://<host>[/<path>]`;
`(external: <where>: <pointer>)` = a target another repository owns — real work, not this
corpus's to pay, and `<where>` is required because the column exists to answer who owns it;
`(deferred: <pointer>)` = real work punted — pointer is an ADR id/path, spec fact, issue, or backlog file. `adr-debt <adr-dir>` sweeps deferred entries + open Follow-ups so they resurface at the next `/quality-harness:adr-write`.
Legacy `(permanent)` and `(permanent: <reason>)` remain permanent but receive classification advice
from `adr-lint`; do not author new entries in those forms.

**A pointer that resolves is not a pointer that was honoured.** Writing `(deferred: docs/adr/BACKLOG.md)`
does not put anything in BACKLOG.md; the pointer names a real file, `adr-debt` follows it, and the
sweep reports clean while the work exists nowhere. Measured 2026-08-20 on a nine-ADR corpus: 42 of
75 deferrals named a destination that had never heard of them. Same shape as the capability that is
finished and unreachable — the link exists, the receiving end does not know it. So: write the entry
at the destination in the SAME commit as the deferral, and name the source ADR there so the tie is
greppable. `adr-debt` now reports `UNRECEIPTED` when it is not.>

- <explicit non-goal> (permanent: boundary: <why this is a chosen limit, not a punt>)
- <fact-based non-goal> (permanent: fact: <external claim>; citation: <typed receipt>)
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
