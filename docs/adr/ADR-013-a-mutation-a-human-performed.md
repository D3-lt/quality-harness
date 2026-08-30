# ADR-013: Give a human-performed mutation a lane, and make the row checkable

**Status:** Accepted
**Date:** 2026-08-29
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-002-a-mutant-restore-outlives-its-process.md, docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-014-a-task-that-is-honestly-unfinished.md, docs/BACKLOG.md §74, docs/BACKLOG.md §60
**Governs:** `plugin/bin/adr-verify`, `plugin/bin/adr-lint`, `plugin/templates/task-template.md`
**Enforced-by:** ADR-013: the human mutation arm still refuses a kill on a passing test, ADR-013: from/to are code spans so a mutated line may hold a backtick
**Served-path change:** A task whose Acceptance cannot run — because a clause of it is blocked — can record a mutation it genuinely performed, and a reader can check that record without trusting the author.

## Context

`adr-verify --mutant` is how a mutation becomes evidence: the TOOL edits the file, runs the fence,
reads the exit code and restores the file. Nobody can claim a kill they did not get, because no step
of it is typed by hand.

That guarantee has a hole, reported 2026-08-29 by a session with the evidence in hand. Their task's
Acceptance contains an integration clause that is blocked, so `--mutant` cannot run the fence at all.
They performed the mutation anyway — replaced a `match_reason` call with `if True`, which is the
"rate is always 1.000" defect the code exists to prevent — watched one test go red, and reverted.
**A kill, performed and observed, with nowhere to record it.**

They tried three routes and refused all three:

1. A prose-only `## Mutation Log`. Rejected by the gate, correctly: an explanation is not evidence.
2. Hand-typing a `mutant killed` row. Refused on their own side, citing this repository's source —
   *"a typed mutant is the thing the log replaced"*.
3. `adr-verify --mutant`. Cannot run.

The asymmetry is verified against source. `VLOG_RE` accepts `· human-observed · <note>`; `MLOG_RE`
accepts only `mutant (killed|survived|inconclusive) · exit N · \`file\` · why`. **The format already
accepts that a human can be the runner of an acceptance command, and does not accept that a human
can be the runner of a mutation** — even though a mutation is the easier of the two to perform and
observe by hand: edit one line, run, read the exit code, revert.

This is docs/BACKLOG.md §60's shape for the third time in one day: **the truthful path is the one
with no paperwork available.** A task honestly blocked cannot record what it did; a task willing to
overstate can.

ADR-014 defers *"recording a mutation a human performed"* to this record. The two are siblings rather
than sequential: a task can be `partial` without needing this lane, and a blocked fence can need this
lane while the task is plainly `pending`. Neither depends on the other being accepted.

## Existing Primitives Audit

- **`VLOG_HUMAN_RE` (`plugin/bin/adr-lint`)** already parses a human-observed acceptance row and
  `human_outcome` already classifies its note as a pass or a stop. The grammar, the classifier and
  the `--human` flag on `adr-verify` exist; only the Mutation Log lacks the equivalent.
- **`MLOG_RE`** is one regex with three verdict arms. A fourth arm is the smallest possible change.
- **`adr-verify --human "<sign-off>"`** is the existing writer for a human-observed acceptance row.
  A `--human-mutant` sibling reuses its redaction, its append path and its refusal-to-write-a-
  malformed-row.
- Nothing new is needed to STORE the diff: `append_entry` already writes a fenced block under an
  entry, which is how a failing acceptance records its output tail.

## Decision

Add a human-observed lane to the Mutation Log **whose row is checkable by a reader rather than
trusted**, and write it with a tool rather than by hand.

A human-observed mutation row must carry, in the row or the fenced block beneath it:

1. the file and the **exact one-line change** made (the `from` and the `to`, as `--mutant` already
   takes them),
2. the **name of the test that went red**, and
3. the sign-off — who observed it and when.

The row is written by `adr-verify --human-mutant`, which does not run anything: it records what a
person reports, refuses a malformed row the same way the acceptance path does, and marks the entry
as human-observed so no reader can mistake it for a tool-run kill.

**Why the diff and the test name are the load-bearing part.** `· mutant killed · exit 1 ·` is a
verdict, and a verdict is exactly what a hand-typed row can fabricate for free. A row naming the
line changed and the test that failed is a claim the next reader can RUN: apply that change, run that
test, see it red. That converts an unfalsifiable assertion into a reproducible one, which is the
property `--mutant` provides by construction and which prose does not.

## Alternatives Considered

- **Do nothing.** The gap stays: an honestly blocked task cannot record mutation evidence it
  genuinely has, and the incentive keeps pointing at the label that buys silence. Rejected, but it is
  the status quo and it is defensible if the forgery risk below is judged larger than the gap.
- **Add `human-observed` to `MLOG_RE` and accept a free-text note.** The obvious fix, and the one the
  reporter deliberately did not propose. A hand-typed verdict row is trivially forgeable in a way a
  hand-run acceptance is not, because `--mutant`'s whole point is that the tool made the edit and read
  the exit code. Rejected: it hands back the property the mechanism exists to provide.
- **Let `--mutant` skip an unrunnable clause of the fence.** Rejected: it makes the tool decide which
  part of an acceptance command matters, which is a judgement about the corpus's own text — the loose
  heuristic this project refused for the comment-only guard (docs/BACKLOG.md §67).
- **Require a second observer to countersign.** Rejected as unenforceable here: this corpus has no
  identity mechanism, and a second typed name is not a second observation.

## Component / Boundary Impact

No module boundary moves. `adr-verify` gains one flag on an existing writer; `adr-lint` gains one arm
on an existing regex plus the shape check for the new fields; the task template gains a sentence
about when the lane applies. Inherits the Module Map from `docs/architecture.md` — no delta.

## Wiring & Contract Changes

- **`MLOG_RE` (`plugin/bin/adr-lint`)** — one new arm accepting a human-observed mutation entry.
  This is a change to the evidence grammar and therefore to a contract two gates share; the writer
  and both readers must agree in the same commit (docs/BACKLOG.md §47, §58).
- **`adr-verify --human-mutant <file> --from <text> --to <text> --test <name> --why <text>`** — new
  flag on an existing gate, refused in combination with `--mutant` and `--sweep`.
- **`plugin/templates/task-template.md`** — the `## Mutation Log` section's note gains the condition
  under which the human lane is legitimate: the Acceptance cannot run, and the reason is recorded.
- **The `mutant killed` requirement for a `done` row is unchanged.** A human-observed mutation entry
  satisfies it only if this decision says so, and it does: the requirement is that a fence has been
  shown able to fail, not that a particular tool observed it.

## Inter-task Contracts

T1 produces the grammar arm; T2 consumes it (a reader cannot check a row shape that does not exist).
T3 consumes both.

## Implementation

Three tasks under `docs/adr/ADR-013-a-mutation-a-human-performed/tasks/`, ordered T1 → T2 → T3.

## Consequences

- A blocked task can record mutation evidence it genuinely has, and the record is reproducible.
- The corpus gains a row type that is NOT tool-run, and every reader of the Mutation Log must
  distinguish the two. That is a real cost and the reason the row says `human-observed` in the same
  position the acceptance grammar does.
- A fabricated row becomes harder rather than impossible: it must name a real file, a real one-line
  change and a real test, all of which the next reader can run. That is the same standard the rest of
  this corpus holds — evidence you can re-check, not evidence you must believe.

## Out of Scope

- Deciding what `partial` means as a task status. (deferred: docs/BACKLOG.md §60)
- Any identity or countersigning mechanism. (permanent: this corpus has no identity to check, and a
  second typed name is not a second observation.)
- Letting `--mutant` run a partial fence. (permanent: it makes the tool judge which clause of an
  acceptance command matters, which is the corpus's text and not the tool's business.)
- Backfilling human-observed mutation rows into existing tasks. (permanent: a row nobody observed at
  the time is exactly the fabrication this record exists to prevent.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The lane is used to avoid a runnable fence | Medium | High — it would replace tool-run evidence with typed evidence | `adr-lint` advises when a task whose Acceptance is a runnable bash fence carries a human-observed mutation row; the lane is for a fence that cannot run, and the record says so |
| A reader treats a human row as tool-run | Medium | Medium | The verdict word is `human-observed` in the same position the acceptance grammar uses, and `adr-judge`/`adr-lint` never count it as a tool-written kill in a summary that does not say so |
| The diff recorded is not the diff performed | Low | High — unfalsifiable again | Unmitigated by tooling, and stated plainly: this lane trades a guarantee for a reproducible claim. The check is the next reader running it |

## Rollback

Remove the `MLOG_RE` arm and the `--human-mutant` flag. Rows already written stay parseable only if
the arm stays, so rollback means those tasks lose their evidence — which is the pre-decision state,
not a corruption. No persistent state, no external integration.

## Follow-ups

- [ ] If the lane is used more than twice in a quarter, re-measure whether the fences it serves could
      have been made runnable instead — the gap may be a symptom of unrunnable acceptance commands
      rather than a missing format.
