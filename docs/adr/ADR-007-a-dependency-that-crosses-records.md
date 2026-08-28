# ADR-007: Let a task depend on another record's task, and never call an unevaluated edge ready

**Status:** Accepted
**Date:** 2026-08-28
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md, docs/BACKLOG.md §41
**Governs:** `bin/adr-lint`, `bin/adr-next`, `templates/task-template.md`
**Invalidates:** none — checked. ADR-003 governs `bin/**` and requires every gate to carry a mutation; this adds mutations rather than removing any. ADR-005 and ADR-006 established "a gate reports what it observed" in `spec-verify` and `mutate.mjs`; this is the same rule in `adr-next`, and extends them rather than changing either.
**Served-path change:** `adr-next` stops printing `ready` for a task whose dependency it could not evaluate, and `Depends-on: ADR-003-T4` becomes writable instead of a lint error.

## Context

Reported 2026-08-28 from another team's corpus, against 2.21.0, with a live instance. Every claim
below was re-verified against this repository's current source before drafting; the corpus counts are
theirs and are attributed as such because this repository has no corpus large enough to re-measure
them.

`Depends-on` is the field that means "this task must not start before that one", and it is confined
to siblings inside one ADR in two independent ways.

**It cannot be written.** `bin/adr-lint:275` validates every entry against `all_stems`, the sibling
task files of that ADR, and a miss is `errors.append` — blocking, not advice. So
`Depends-on: ADR-003-T4` is a hard lint error: the field designed to carry the constraint refuses to
carry it.

**If it could be written, readiness would drop it.** `bin/adr-next:146` builds the same edges with
`if d in infos and d != tid`, where `infos` is this ADR's tasks alone. A T-id outside it is discarded
in silence, and the docstring says the agreement with `adr-lint` is deliberate. The two tools agree
with each other and are blind to the same class.

The direction of the failure is what makes it expensive: **an unseen edge reads as no edge**, so
`adr-next` prints `ready` rather than `unknown`. It is confidently wrong in the direction that causes
work.

**And a third failure the report did not name, found while verifying it.** `TID_RE` is
`(?<!\w)T\d+(?!\w)`, so `ADR-003-T4` yields `T4` — the hyphen is not a word character. If the writing
ADR happens to have its own `T4`, the foreign dependency does not vanish; it binds to the LOCAL task
with the same number. Measured 2026-08-28: `ADR-003-T4` → `['T4']`, `ADR-003/T4` → `['T4']`. A wrong
edge is worse than a missing one, because the DAG then looks answered.

Their live instance: a record whose Decision requires two of ITS tasks to land before a sibling
record's task is measured. The dependent task's header can only say `Depends-on: T2`; `adr-next` says
`ready`; the blocking tasks are pending. An executor who trusts the tooling takes a measurement on
the wrong pipeline, and every gate stays green — no gate was wrong about anything it could see.

Reported blast radius, their corpus, their measurement: 41 of 94 task files (44%) reference a foreign
ADR in prose, across 44 distinct ADR→ADR pairs. Not all imply ordering; all are relationships the DAG
cannot represent. The structural problem is that the constraint gets written in the record that
DISCOVERED it while the reader who needs it is executing the OTHER one.

## Existing Primitives Audit

- `header_val` + the `Depends-on` loop in `adr-lint` already parse and validate the field per task.
  **Reshaped:** the resolution target widens from siblings to the corpus for a qualified id only.
- `adr_corpus` / the corpus reader `adr-next` already uses to find sibling records. **Reused** — the
  records a qualified id must resolve against are already being read.
- `dependency_edges` in `adr-next` already builds the DAG and already has a cycle check.
  **Reshaped:** edges may leave the record, so the cycle check runs over the union.
- ADR-005's `pass | fail | unrun` and ADR-006's `UNPROVEN` are **reused as precedent**: a third state
  for "could not evaluate", never folded into either of the two it sits between.

## Decision

`Depends-on` accepts a **qualified** task id — `ADR-003-T4` or `ADR-003/T4`. An unqualified `T2`
keeps its present meaning exactly, so no existing record changes.

`adr-lint` resolves a qualified id against the corpus rather than the sibling set. One that names no
record, or a record with no such task, stays a blocking error — the same argument that requires every
cited ADR to resolve.

`adr-next` treats a foreign dependency that is not complete as **blocking**, and names the record it
is waiting on. Where the foreign record cannot be read or found, it prints
`blocked: cannot evaluate ADR-003-T4` and **not** `ready`. That sentence is the whole decision: this
is ADR-005's rule and ADR-006's rule in a third tool — a gate must not report an observation it did
not make, and readiness is an observation.

Parsing is qualified-aware BEFORE any T-id scan. A qualified id is consumed whole and removed from
the text the local scavenger sees, or `ADR-003-T4` silently becomes a local `T4` edge, which is the
third defect above.

The cycle check runs over the **union** of records once cross-record edges exist. Two records already
reference each other in their prose today; making those real edges without widening the check moves
the blindness rather than removing it.

What would make this wrong: a qualified id that resolves but whose target ADR is itself unreadable.
That must be `cannot evaluate`, never `ready` and never silently `complete` — T2's fixture asserts
exactly that.

## Alternatives Considered

- **Restate the constraint in the executing record's Risks.** The reporting team's interim fix, and
  they call it a workaround themselves. Rejected as the durable answer: it relies on a human reading
  Risks, which is what a DAG exists to avoid, and the constraint is still written in whichever record
  noticed it.
- **Infer edges from prose mentions of a foreign ADR.** Rejected on their measurement: 44% of task
  files mention one, most as citation rather than dependency. A gate with that false-positive rate is
  one people turn off, after which it protects nothing.
- **A separate `Blocked-by:` field for cross-record edges.** Rejected: `Depends-on` already means
  exactly this relation, and two fields for one relation is where drift starts — a reader would have
  to check both, and a writer would eventually pick the wrong one.
- **Leave it and document the limit.** Rejected: the failure is silent and directional. A documented
  limitation still prints `ready`.

## Component / Boundary Impact

None — internal to the two gates and the task template. No skill body changes; `adr-execute` reads
`adr-next`'s output and gains a new blocked reason without knowing about it.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Task header `Depends-on:` | accepts a qualified `ADR-NNN-TN` / `ADR-NNN/TN` id | `templates/task-template.md` | `adr-lint`, `adr-next` |
| `adr-lint` findings | a qualified id resolves against the corpus; unresolvable stays blocking | `check_task_headers` | authors, CI |
| `adr-next` verdicts | `blocked` on an incomplete foreign task, naming it; `cannot evaluate` where the record is unreadable | `dependency_edges` + the readiness report | `adr-execute`, anyone running it |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| qualified-id parser and its corpus resolution | T1 | T2 | No — T2 consumes the parser T1 exports; unqualified ids behave identically throughout |

## Implementation

Two tasks, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** the constraint lives in the record that must obey it, machine-checked; `adr-next`
  stops being confidently wrong in the direction that causes work.
- **Negative:** `adr-next` now reads more than one record, so it is slower and can be blocked by a
  corpus problem elsewhere. That is the point — a dependency you cannot evaluate is not readiness.
- **Neutral:** every existing record is unaffected. Unqualified ids are still sibling-scoped, and no
  record in any corpus uses a qualified one today, because until now it was a lint error.

## Out of Scope

- Inferring dependencies from prose mentions of a foreign ADR. (permanent: measured at 44% of task files in the reporting corpus, mostly citations — a gate at that false-positive rate is one people switch off.)
- A wider cross-record vocabulary — supersedes, invalidates, "measured on the pipeline that". (deferred: docs/BACKLOG.md §41)
- Re-measuring the 44% figure on another corpus. (deferred: docs/BACKLOG.md §41)
- Any change to how `Consumes` edges are built within one record. (permanent: it is the same DAG, and widening two edge sources at once would make a regression impossible to attribute.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A qualified id silently binds to a same-numbered LOCAL task | Med | High | measured today: `ADR-003-T4` → `['T4']`; T1 consumes qualified ids before the local scan and asserts a corpus where both records have a `T4` |
| Widening edges creates a cross-record cycle nothing checks | Med | High | T2 runs the cycle check over the union; two records in the reporting corpus already reference each other |
| `adr-next` becomes blocked by an unrelated corpus problem | Med | Med | that is the intended direction, and the message says `cannot evaluate <id>` so the cause is named rather than inferred |
| The new blocked state is read as a failure of the task | Low | Med | it names the record being waited on, and `adr-next` still exits 0 — it reports, it does not refuse |

## Rollback

Revert the commit. No record can depend on the feature, because a qualified id is a lint error until
this ships, so nothing written before it can rely on it. No persistent state, no external integration.

## Follow-ups

None — the two open questions are deferred to the backlog with receipts.
