# ADR-009: A record names the check that fails when its decision is violated

**Status:** Proposed
**Date:** 2026-08-28
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/BACKLOG.md §43, §44
**Governs:** `templates/adr-template.md`, `bin/adr-lint`
**Invalidates:** none — checked. ADR-003 requires a gate to assert behaviour rather than shape, and this leans on it: the check a record names must be shown able to fail. Nothing else is changed.
**Served-path change:** `adr-context` over a governed path returns not only which decisions own it but the check that fails when one is violated — so an agent about to edit that file learns what will catch it.

## Context

`Governs:` names the paths a decision owns, and `adr-context` resolves a path back to its records.
That is half of a chain. The other half — what actually stops the decision being violated — is
nowhere in a record.

Task `Acceptance` is not that half, and the difference is the whole point. An acceptance fence proves
**the task got done**; it runs once, at execution, and its digest is bound to that moment. Whether
the decision still **holds** six months later is a different question that nothing in this corpus
asks. ADR-004 decided templates are never linked; if someone re-adds the loop tomorrow, the only
thing that notices is a mutation entry in a catalogue, which is a coincidence of how that fix
happened to be tested rather than something the record required.

Named 2026-08-28 while reading an outside argument (BACKLOG §43): *every ADR points to the mechanism
that enforces it; every mechanism points to the code it governs. If any link is missing, you know
exactly where the chain breaks.* The vocabulary is his; the gap is ours and is checkable — no record
in this corpus carries such a pointer, because there is no header to put it in.

The same shape arrived independently from the field the same day: the cross-record `Depends-on`
report (ADR-007) reached for "every ADR points to the mechanism that enforces it" without having read
that paper. Two sources, one missing link.

## Existing Primitives Audit

- `Governs:` already declares scope, is already parsed, and is already resolved by `adr-context`.
  **Reused as the model** — `Enforced-by:` is its sibling and is read the same way.
- `adr-lint` already resolves a task's `Tests` table entries to real test definitions and already has
  `check_tests_can_fail`. **Reused:** the same resolution answers whether a named check exists.
- `mutate.mjs` and `tests/mutations.json` already prove a named mechanism can fail. **Reused as the
  strongest form of the evidence** — a decision whose check carries a RED mutation has the property
  this record is about, proved rather than asserted.
- ADR-003's rule — a gate asserts behaviour, and must be shown able to fire — is what stops
  `Enforced-by:` becoming decoration. **Reused, and it is the reason this is worth doing at all.**

## Decision

A record may carry `Enforced-by:` naming one or more checks that fail when its decision is violated:
a test id, a gate invocation, or a catalogue mutation label. `adr-lint` resolves each and reports a
finding when it names nothing that exists. Absent, the header reads `None — <reason>`, and "this
decision is not mechanically enforced" is a legitimate and common answer that the record then states
rather than leaves the reader to infer.

It is **advice, not a block**, and stays that way. Six of the eight records here predate the header
entirely, most decisions in most corpora are not mechanically enforceable, and a gate that fails a
record for being honest about that is the day-one gate people switch off.

What would make this wrong: `Enforced-by:` naming a check that cannot fail. That is ADR-003's
territory and the reason the strongest form of the pointer is a catalogue mutation label — the
campaign already reports RED or GREEN for it, so the claim is measured on every run rather than
asserted once. The lint cannot prove a named test is falsifiable; it can only prove it exists, and
the record should say which of the two it has.

## Alternatives Considered

- **Infer the enforcing check from the task `Tests` tables.** Rejected: those prove the task was
  completed, not that the decision persists, and conflating them is exactly the distinction this
  record exists to draw. A task's tests are also deleted or rewritten freely once it is done.
- **Require every record to name an enforcing check.** Rejected: most durable decisions — "we chose
  Postgres", "templates are never linked" — have no cheap mechanical enforcement, and demanding one
  produces either fabricated pointers or abandoned records. The 2023 study in §43 (half of
  ADR-adopting repositories have one to five records) is what abandonment looks like.
- **A separate enforcement manifest outside the records.** Rejected on this project's own history:
  ADR-001 and ADR-004 are both about a second copy drifting from the first. One tree, one place.
- **Do nothing; `Governs:` plus a mutation catalogue is enough in practice.** The honest counter, and
  it is nearly true HERE — this corpus mutates heavily. It is not true of a corpus that does not, and
  the pointer is what makes the coincidence into a contract.

## Component / Boundary Impact

None — a new optional header and one advisory check. No skill changes behaviour; `adr-context` gains
a field to report.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Record header `Enforced-by:` | new, optional, `None — <reason>` accepted | `templates/adr-template.md` | `adr-lint`, `adr-context` |
| `adr-lint` findings | advises when a named check resolves to nothing | `check_enforcement` | authors, CI |
| `adr-context` output | reports the enforcing check beside each governing record | `adr-context.mjs` | the edit-boundary hook, `/adr-execute` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the parsed and resolved `Enforced-by:` value | T1 | T2 | No — T2 only reports what T1 resolves; a record without the header is unchanged in both |

## Implementation

Two tasks, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** an agent about to edit a governed file learns what will catch it, at the moment it
  matters — the delivery mode §36 measured as the one that works. And a decision with no enforcement
  says so, which is information the corpus does not currently carry.
- **Negative:** another header to write, and one more thing that can rot. Mitigated by it being
  optional and advisory, and by the lint reporting a pointer that resolves to nothing.
- **Neutral:** existing records are unaffected. They will report `None` by absence until someone
  fills the header in, and the backfill is deliberately not part of this record.

## Out of Scope

- Backfilling `Enforced-by:` across the eight existing records. (deferred: docs/BACKLOG.md §44)
- Proving a named check can FAIL, as opposed to that it exists. (permanent: that is ADR-003's rule and `mutate.mjs`'s job; duplicating it here would be a second mechanism for one property, and a weaker one, since the lint cannot run a mutation.)
- Any change to `Governs:`. (permanent: it answers a different question — scope, not enforcement — and widening it would make one header mean two things.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `Enforced-by:` names a check that exists and cannot fail | Med | High | the record's own guidance prefers a catalogue mutation label, which the campaign grades RED or GREEN on every run; the lint says which form it resolved |
| The header becomes a formality filled in to satisfy a gate | Med | Med | advisory, never blocking, and `None — <reason>` is a first-class answer stated in the template |
| A pointer rots when the check is renamed | High | Low | the lint resolves it on every run, which is what turns a rot into a finding |

## Rollback

Revert the commit. The header is optional and nothing reads it before this ships, so no record can
depend on it. No persistent state.

## Follow-ups

None — the backfill is deferred to the backlog with a receipt.
