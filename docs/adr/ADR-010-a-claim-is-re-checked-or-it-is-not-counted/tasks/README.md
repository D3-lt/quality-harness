# ADR-010 Tasks

Implementation tasks for ADR-010: Re-check the corpus's own claims, and count only the ones you
could check. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |

T2 and T3 are independent of each other and may run in either order once T1 is committed.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | four buckets, and a claim you could not check is in neither half | pending | F-1..F-12 (except F-13), F-16, F-17, UC1-S1..UC1-S5 | `node --test tests/sweep.test.mjs …` |
| T2 | strictFrom demotes a finding without changing the count | pending | F-13, F-14, F-15, UC2-S1, UC2-S2 | `node --test tests/sweep.test.mjs …` |
| T3 | repair the three claims that stopped being true | pending | none — repairs the corpus the spec measured | `python3 plugin/bin/adr-verify --sweep docs/adr` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

T1 produces `adr-verify --sweep` and the four-bucket report. T2 adds a `strictFrom` demotion to the
exit code T1 defines, and T3 consumes the report as its own acceptance — a sweep reporting zero false
successes is what proves the repair landed. Neither can start before T1 is committed.

## The trap this plan is written around

**Two of the four buckets have nothing in the live corpus to fire on.** Measured 2026-08-28: 15
claims, all 15 re-checkable, 0 superseded and 0 unrunnable. A branch that never executes on real
input is decoration, and this repository has measured four assertions that could not fail this month.
So T1 carries a fixture corpus for both, and each bucket needs a mutation that goes RED — a passing
sweep over the live corpus proves nothing about them.

## Note on T3

T3 edits the Acceptance fences of three OTHER records' tasks (ADR-006 T2, ADR-007 T1, ADR-009 T1).
That invalidates their recorded evidence by design — the digest changes — so each must be re-recorded
with `adr-verify` on a clean tree. This is the documented flow, not a workaround; `adr-lint` will
refuse those tasks' `done` rows until it is done.
