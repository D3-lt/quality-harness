# ADR-025: Record the clean run a mutation already takes, instead of taking it twice

**Status:** Accepted
**Date:** 2026-09-02
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-016-a-mutant-earns-its-verdict.md, docs/adr/ADR-010-a-claim-is-re-checked-or-it-is-not-counted.md, docs/adr/ADR-020-a-run-leaves-a-trace-outside-the-file.md, docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/BACKLOG.md §108, §111
**Governs:** `plugin/bin/adr-verify`, `plugin/skills/adr-execute/SKILL.md`
**Enforced-by:** None — declared by its tasks. T1 adds the mutation `verify: a mutant run records the verification entry its clean fence earned`; naming it here before it exists would be the pointer-to-nothing this header is checked for.
**Invalidates:** none — checked, and the check is the point. ADR-016 requires a mutant to be judged only after its clean fence passes; that run still happens, unchanged, and this record only writes down what it observed. ADR-010 ("a claim is re-checked or it is not counted") is UNTOUCHED for the same reason, and this is the header a reader will come to first: nothing here reuses, caches or skips a run. ADR-023 narrowed ADR-010 to permit content-keyed reuse in `scripts/mutate.mjs`; this record deliberately does NOT extend that narrowing to the shipped gate, because it turned out not to need it. ADR-020 owns the `ms:` field and the entry grammar; the entry written here is that same grammar from the same writer.
**Served-path change:** A task that records a mutation stops running its acceptance fence twice on identical bytes, and the run it already took becomes evidence instead of being discarded.

## Context

**Measured 2026-09-02 across this corpus's own 51 task files**, which is why this is a record rather
than an intuition:

    tasks 51 · verification entries 93 · mutation entries 94
    fence executions = 93 + (94 x 2) = 281      -> 5.5 per task
    recorded fence timings: median 4,787ms, max 25,537ms

The `x 2` is the subject. `adr-verify --mutant` runs the acceptance fence CLEAN before applying the
mutant (`plugin/bin/adr-verify:1257`) — correctly and unconditionally, because ADR-016 settled that a
failure which already exists cannot be donated to a mutant. But `adr-execute` step 4 has the agent
run `adr-verify <task>` immediately before, on the same tree, with the same fence. **94 of the 281
executions — a third — are the shipped gate re-running a fence that ran seconds earlier on identical
bytes, and discarding the result.**

At this corpus's median that is 26s per task. An adopting corpus reported `go test ./...` at 43.837s
(§108); the same multiplier there is four minutes per task and twenty per five-task wave, which is
the larger part of the half hour that was reported to us as "the ADR tooling is slow".

**What the clean run already is.** It executes the exact normalized fence, with the same shell, cwd,
environment and timeout the mutant will receive, and it must exit 0 with tests actually scored or
`--mutant` refuses to proceed. That is, byte for byte, the observation a `Verification Log` entry
records. The tool takes it, checks it, and throws it away.

## Existing Primitives Audit

- **The clean-fence run at `plugin/bin/adr-verify:1257`.** **Reuse as-is.** It already produces
  `returncode`, stdout/stderr and the timing this record wants recorded. Nothing about how it is
  taken changes.
- **The Verification Log writer** — the same function that appends ` · acceptance-sha256:<digest> ·
  ms:<n>` at `plugin/bin/adr-verify:2277`. **Reuse, do not copy.** ADR-020's comment there notes the
  entry grammar already exists in four places; a fifth spelling is how the two paths drift into
  writing different rows for the same observation.
- **`scored_nothing()` and `environment_failure()`**, already applied to the clean run's output.
  **Reuse**: an entry must not be written for a run that scored nothing, which is the same judgement
  the plain path already makes.
- **ADR-023's `cacheKey()` in `scripts/mutate.mjs`.** **Deliberately NOT reused, and not
  reimplemented.** See Alternatives — it solves a problem this record turned out not to have.

## Decision

**`adr-verify --mutant` writes the `Verification Log` entry its clean run earned, using the same
writer as the plain path.** One invocation then produces both the verification evidence and the
mutation evidence, because it genuinely took both observations.

**Nothing is reused, cached, skipped or inferred.** Every entry this writes is a run that happened,
in this process, on the tree in front of it. That is the whole argument for why ADR-010 does not
need narrowing here and why this is a smaller change than it first looks: the duplicate was never a
missing cache, it was a discarded result.

**The entry is written whatever the clean fence exits**, matching the plain path, which records a
non-zero run as the TDD-red evidence rather than suppressing it. Today a failing clean fence under
`--mutant` exits `UNPROVEN` having written nothing at all, so the one observation the run did make
is lost. It is recorded first, then the existing `UNPROVEN` refusal proceeds unchanged.

**`adr-execute` step 4 stops prescribing a separate run when a mutation is being recorded in the
same pass**, and says why, so the saving is realised rather than merely available.

**Pre-registered criterion, and it can fail:** if after ten tasks the verification entries written by
the `--mutant` path are not byte-identical in grammar to the plain path's, the two writers have
drifted and this record is a defect rather than a saving. `adr-lint`'s entry grammar is the detector
and it already runs on every record.

## Alternatives Considered

- **Content-keyed reuse of the clean verdict, extending ADR-023 to the shipped gate.** This was the
  first design and it is the one §111 proposed. **Rejected as unnecessary complexity** once the merge
  above was seen: a cache answers "may I skip a run I already took at another moment", and the merge
  removes the second run entirely, so the question stops being asked. It would also have put a second
  copy of `cacheKey()` in the shipped tree — `scripts/mutate.mjs` does not ship — and two
  implementations of one content key drifting apart is a worse defect than the cost it saves.
- **Reorder `adr-execute` so the mutation runs first and Validate second.** Rejected: it moves the
  duplicate rather than removing it, and it puts the mutation before the task is known green, which
  ADR-016 exists to prevent.
- **Have the plain path write the Mutation Log instead**, i.e. merge in the other direction.
  Rejected: a mutation needs a mutant named on the command line, so the plain path has nothing to
  record; the asymmetry is real, not stylistic.
- **Do nothing and document the cost.** Genuinely considered — this corpus pays 26s per task, which
  nobody has complained about. Taken anyway because the multiplier lands on adopters with slow
  suites, and because the fix removes work rather than adding a mechanism.

## Component / Boundary Impact

None — internal to one gate and the skill that drives it. `adr-verify` keeps its single
responsibility (run the fence, record what it observed). No module moves, so `docs/architecture.md`'s
Module Map is unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-verify --mutant` output | also appends one `## Verification Log` entry | `plugin/bin/adr-verify` | `adr-lint`, a maintainer |
| `adr-execute` step 4 | says the mutation pass already records the verification entry | `plugin/skills/adr-execute/SKILL.md` | every task author |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the merged `--mutant` invocation writing both logs | T1 | T2 | No — T2 documents behaviour T1 ships |

## Implementation

See `tasks/README.md`. Two tasks.

## Consequences

- **Positive:** a third of this lifecycle's fence executions disappear without removing a single
  check; a clean run that was observed and discarded becomes evidence; a failing clean fence under
  `--mutant` stops losing its one observation.
- **Negative:** one invocation now writes two log sections, so a reader of `adr-verify` must hold
  both in mind; mitigated by reusing the one writer rather than adding a second.
- **Neutral:** exit codes are unchanged. `--mutant` still refuses on an unusable clean fence.

## Out of Scope

- Extending ADR-023's content-keyed reuse to the shipped gate (permanent: boundary: this record removes the duplicate run rather than caching it, so the reuse question it was raised to answer no longer arises here; if a future duplicate appears that a merge cannot remove, that is its own record)
- The Red run, which is taken on a deliberately different tree and can never share an execution (permanent: fact: a fence run is determined by its command and the tree bytes it runs against, and the red and green runs differ in the second by construction; citation: file `docs/BACKLOG.md:6997`)
- Scoping a fence to the package a task changed, which is advice already in the task template (deferred: docs/BACKLOG.md §111)
- Making the whole campaign faster in `scripts/mutate.mjs`, which ADR-023 owns (permanent: boundary: that file is repository-owned and does not ship, and its cost question was already decided)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The two writers drift and produce different entry grammars | Med | High | One writer, called from both paths; the pre-registered criterion above names the detector, and `adr-lint` already rejects an off-grammar entry |
| A reader believes the verification entry was a separate confirmation | Med | Med | It was a separate RUN, just not a separate invocation; the entry records a real execution, which is the only property the evidence chain claims |
| Recording a failing clean fence changes what `done` requires | Low | Med | It cannot: `adr-lint` requires a matching exit-0 entry for `done`, and a recorded failure is not one |
| **HAPPENED during execution:** the entry written before the mutant put our own bookkeeping into the tree the mutant's fence reads, so a survivor was credited as a KILL | — | High | Caught by the existing suite within the hour, not by review. The entry is now written only where no mutant fence follows: after the verdict on the mutating path, before the refusal on the clean-fence-failed path. `recording the run does not change the verdict the mutant earned` drives a must-survive mutant and fails if it comes back 0 |
| **SHIPPED IN v2.56.0 and fixed in v2.56.1:** `record_run` took a START time and subtracted at write time, so on the mutating path — which writes after the mutant has run and been restored — `ms:` totalled BOTH runs. T1's own entry says ms:39701 for a fence measured at 28,742ms | — | High | The duration is now taken by the caller the instant its fence returns and passed in. Found by a reader asking whether removing the step cost anything, not by any gate. It corrupts the field `docs/BACKLOG.md` §111 reads back as the cost of the lifecycle, which is the measurement that justified this record |
| The regression test for the above was itself vacuous at first | — | High | A ratio against the whole invocation did not separate a ~100ms fixture fence from process startup, and the test PASSED with the defect deliberately reinstated. Replaced with a fence that sleeps a second, so one sleep is the clean run and two means the mutant leaked in; re-checked by putting the defect back and watching it fail |
| The sha is read after this run's own writes and carries a dirty marker it earned itself | Med | Med | Captured once at the top of `run_mutant`, before the journal or any entry is written; the clean-tree test asserts no marker |

## Rollback

Revert the tasks. The change is additive to what a file already contains and introduces no persistent
state and no migration: a corpus that reverts simply goes back to two invocations, and every entry
written under this record remains valid, because each one recorded a run that really happened.

## Follow-ups

- [ ] After ten tasks recorded under this, compare the `--mutant`-written entries with the plain path's for grammar drift — the pre-registered criterion in the Decision.
