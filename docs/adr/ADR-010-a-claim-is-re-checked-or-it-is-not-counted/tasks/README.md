# ADR-010 Tasks

Implementation tasks for ADR-010: Re-check the corpus's own claims, and count only the ones you
could check. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T3 | T1 |
| 3 | T2 | T1, T3 |

**T3 runs before T2, and that ordering is load-bearing.** A review found the edge: if T2 lands first
and a `strictFrom` cutoff covers ADR-006/007/009, the three false successes become advice and the
sweep exits 0 — which is the red state T3 exists to prove it repaired. No `.quality-harness.json`
exists here today, so the hazard is latent rather than live; ordering costs nothing and removes it.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | four buckets, and a claim you could not check is in neither half | pending | F-1..F-12 (except F-13), F-16, F-17, UC1-S1..UC1-S5 | `node --test tests/sweep.test.mjs …` |
| T3 | repair the three claims that stopped being true | pending | none — repairs the corpus the spec measured | `bash …/tasks/T3-recheck.sh` |
| T2 | strictFrom demotes a finding without changing the count | pending | F-13, F-14, F-15, UC2-S1, UC2-S2 | `node --test tests/sweep.test.mjs …` |

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

## What a cold review changed here, before any of it was executed

Eight findings, all validated against source; the record and all three tasks were amended rather
than executed past. The two that mattered most:

- **T3's acceptance was a sweep, and T3 is a claim.** Once it earned an exit-0 entry, every later
  sweep would re-run it — and re-running it is another sweep. Unbounded recursion, introduced by the
  task meant to prove the sweep works. T1 now refuses any fence naming `--sweep`; T3's acceptance is
  a script that names none.
- **Every fence here could pass with its runner absent.** `… | tee X; ! grep …` returns 0 when the
  runner never starts — measured, exit 0 against `nosuchrunner`. Every fence in this record now uses
  `set -o pipefail` and `&&`. The twelve existing fences and the task template that recommends the
  broken form are docs/BACKLOG.md §46.

## Note on T3

T3 edits the Acceptance fences of three OTHER records' tasks (ADR-006 T2, ADR-007 T1, ADR-009 T1).
That invalidates their recorded evidence by design — the digest changes — so each must be re-recorded
with `adr-verify` on a clean tree. This is the documented flow, not a workaround; `adr-lint` will
refuse those tasks' `done` rows until it is done.
