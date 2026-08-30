# ADR-014: Give an unfinished task a status the corpus can read

**Status:** Accepted
**Date:** 2026-08-30
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-010-a-claim-is-re-checked-or-it-is-not-counted.md, docs/BACKLOG.md §60, docs/BACKLOG.md §73
**Governs:** `plugin/bin/adr-lint`, `plugin/bin/adr-debt`, `plugin/templates/tasks-readme-template.md`
**Enforced-by:** None yet — Accepted and unexecuted. The checks are T1's `partial` obligations, T2's `Blocked-on` grammar and T3's waiting-versus-rot split; this header names them as each lands rather than claiming a check that does not exist
**Served-path change:** A task that is genuinely part-done, or waiting on something outside the repository, can say so in a word the tools read — instead of choosing between a status that overstates and one that buys silence.

## Context

This corpus recognises three task statuses: `done`, `pending`, `blocked`. Real work arrives in a
fourth shape, and two corpora hit it independently on 2026-08-29.

**Measured, one word changed, everything else identical** (docs/BACKLOG.md §73): a task whose README
status read `partial` produced **0 findings**; the same task marked `done` produced **2**. One of the
two was a Mutation Log finding **true regardless of the label**. Before §73 an unrecognised status
was a silent exemption, so the honest word bought silence from the linter.

§73 fixed the silence — an unrecognised status is now reported — but it deliberately did not decide
what the word should MEAN. This record is that decision.

**The incentive as it stands is backwards.** `done` buys scrutiny the task may not survive. `pending`
is a lie once code has landed. `blocked` says nothing about how much is finished. The truthful
description of "eleven of thirteen steps landed, two are blocked by facts that post-date the task"
has no home, and the author who reaches for it is the one the corpus stops checking.

**A second corpus arrived at the same gap from the other side** and proposed a header
(docs/BACKLOG.md §60):

    **Blocked-on:** production deploy of the commit T1's suite last passed on
                    (external event; human-observed acceptance waits for it)

Their task then RESOLVED, and how it resolved is the most useful datum here: **the external event had
already happened** — production had been running the image for six days and no paperwork knew. So a
row of this kind can be STALE-TRUE, and the escalation question is not *"is this rotting?"* but
**"has the event perhaps already happened?"**

## Existing Primitives Audit

- **`KNOWN_TASK_STATUS` and `check_task_status_vocabulary` (`plugin/bin/adr-lint`)** already read a
  status word per row, bound to its own table, and report one the reader does not act on. Adding a
  word is a set entry, not a parser change.
- **`evidenced_task_ids`** already treats `blocked` as evidenced-if-it-has-a-green-fence, which is
  precisely the treatment a part-done task needs — the obligations follow the EVIDENCE, not the word.
- **`adr-debt`** already sorts deferred items into buckets and already refuses to report
  `(permanent: …)` as debt. A "waiting on an external event" bucket is a third case in an existing
  sorter.
- **`--human`** already records a human-observed acceptance, which is the acceptance shape a task
  blocked on an external event will have. Nothing new is needed to record the eventual sign-off.

## Decision

This corpus will adopt **`partial`** as a task status with its own, narrower obligations, and will
record what a waiting task is waiting for.

(The word *perhaps* appears once below, inside the escalation message this decision specifies. It is
quoted output, not hedging — `adr-judge` reads it as the latter, correctly refusing to guess which.)

1. **`partial` means: some Ordered Steps have landed and the task is not finished.** It is NOT a
   softer `done`, and it does not license a `done` row anywhere.
2. **A `partial` task carries the obligations its EVIDENCE creates, not the ones its word creates.**
   If it has a passing acceptance entry, it owes a Mutation Log and its Tests table must name tests
   that exist — the same checks a `done` task owes, because those are claims about work that landed.
   What it does NOT owe is a `done` row's exit-0 requirement, which it is not claiming.
3. **A task waiting on something outside the repository declares it** in a
   `**Blocked-on:** <the event, and what will observe it>` header. `adr-lint` refuses that header on
   a task whose Acceptance is a runnable bash fence — a task that can run its own fence is not
   waiting on the world — and `adr-debt` counts it in a *waiting on an external event* bucket,
   excluded from the deferred count.
4. **`adr-debt` reports an old wait as "still waiting — has the event perhaps already happened?"**,
   and never as rot. The one instance this corpus has resolved because the event had already
   happened six days earlier and nobody had checked.

## Alternatives Considered

- **Do nothing; `partial` stays unrecognised and reported.** §73 already stops it being silent, which
  removes the worst of the harm. Rejected because the reported form is still a nag rather than a
  contract: the author is told the checks did not run, and given no way to make them run.
- **Treat `partial` as `done` for checking purposes.** Rejected: it would demand an exit-0 row from a
  task that is not claiming completion, which is the fabrication pressure this corpus exists to
  remove.
- **Treat `partial` as `pending`.** Rejected: it is what happens today by omission, and it exempts
  landed work from the checks that apply to landed work.
- **Add `Blocked-on` without adding `partial`.** Rejected as half the problem: the two corpora hit
  different halves, and a task can be part-done without waiting on anything.
- **A free-text status column with no vocabulary at all.** Rejected: it is what produced the silent
  exemption, and a word no tool reads is a word that means nothing.

## Component / Boundary Impact

No module boundary moves. `adr-lint` gains a vocabulary entry and a header check; `adr-debt` gains a
bucket; the tasks-README template gains the word and the header. Inherits the Module Map from
`docs/architecture.md` — no delta.

## Wiring & Contract Changes

- **`KNOWN_TASK_STATUS`** gains `partial`. This is the corpus's status vocabulary, which three tools
  read — the vocabulary and every reader of it must change in the same commit.
- **`**Blocked-on:**`** — a new optional task header. Optional, so no existing task file becomes
  invalid.
- **`adr-debt`** gains a *waiting on an external event* count in its summary line, which is a change
  to output every consumer reads.
- **`plugin/templates/tasks-readme-template.md` and `task-template.md`** document both.

## Inter-task Contracts

T1 produces the vocabulary entry and the obligation rule; T2 produces the `Blocked-on` header and its
refusal rule; T3 consumes both in `adr-debt`'s bucket and the templates.

## Implementation

Three tasks under `docs/adr/ADR-014-a-task-that-is-honestly-unfinished/tasks/`. T1 and T2 are
independent; T3 depends on both.

## Consequences

- The truthful word stops costing the author anything, which is the whole point.
- The corpus gains a status whose obligations are derived from evidence rather than from the label —
  a small precedent, and the right one: `blocked` already works that way.
- `adr-debt`'s summary changes shape, so anything parsing that line must be updated. There is one
  such consumer in this repository and it is named in T3.
- A `partial` task can sit indefinitely. That is not new — so can `pending` — but the escalation
  question in §4 is what stops it being invisible.

## Out of Scope

- Recording a mutation a human performed. (deferred: docs/adr/ADR-013-a-mutation-a-human-performed.md)
- Any status beyond `partial` — `running`, `failed`, `deferred` were all observed in one corpus's
  legend. (deferred: docs/BACKLOG.md §60 — one word with two corpora behind it is a decision; five
  words with one legend behind them is a taxonomy, and taxonomies are where vocabularies go to rot.)
- Deciding when a `Blocked-on` task should be escalated to a human by anything other than age.
  (permanent: this corpus has no scheduler and no owner model to escalate to.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `partial` becomes the default for anything awkward | Medium | High — it would hollow out `done` | Its obligations follow the evidence, so a `partial` task with a green fence is checked exactly as hard as a `done` one; the word buys no relief |
| `Blocked-on` rows go stale-true and nobody notices | High — it happened in the one instance we have | Medium | The escalation asks whether the event has already happened, which is the question that resolved it |
| Adding a word invites adding five | Medium | Medium | Out of Scope names the four and says why one word is a decision and five are a taxonomy |

## Rollback

Remove `partial` from the vocabulary and the `Blocked-on` header check. Existing files keep both as
prose; the tools stop reading them, which is today's behaviour. No persistent state, no external
integration, no migration.

## Follow-ups

- [ ] After a quarter, count `partial` tasks that never became `done`. If most of them stalled rather
      than progressed, the word is being used as a synonym for abandoned and this decision needs
      revisiting.
