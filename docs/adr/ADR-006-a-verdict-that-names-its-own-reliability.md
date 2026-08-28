# ADR-006: Prove a verdict with a baseline, not with coverage

**Status:** Accepted
**Date:** 2026-08-28
**Owner:** zy
**Spec:** docs/specs/2026-08-27-a-mutation-that-proves-nothing.md
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/BACKLOG.md §35
**Governs:** `scripts/mutate.mjs`
**Invalidates:** none — checked. ADR-003 governs `bin/**` and `tests/mutations.json` and requires every gate to carry a mutation; ADR-005 gave `spec-verify` a third verdict. This extends both — the same "do not claim what you did not observe" rule, one tool over — and changes neither.
**Served-path change:** A campaign entry whose named tests were already failing is reported `UNPROVEN` with the action that resolves it, instead of `RED` counted as noticed.

## Context

Inherited from `docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` §Problem. Two measurements
taken 2026-08-28 while deciding the mechanism change what that spec concluded, and both are
reproducible.

**The spec names one root cause, and it does not cover the class it leads with.** The spec says the
only thing the runner is missing is "whether the named tests executed the mutated line". Measured
with a six-line fixture: an assertion `deepEqual(uncovered(...), [])` whose subject is mutated to
return `[]` passes with the mechanism broken, at **100% line and 100% branch coverage, before and
after**. The mutated line executes; the assertion cannot fail. Coverage is blind to the vacuous case
by construction, and the vacuous case is the one that bit this repository three times — ADR-003 T1's
first version, `judge: a blank line ends a bullet`, and `verify: the mutant warning is flushed`. A
fourth landed on 2026-08-28, in the test written to enforce ADR-003.

So the spec's Problem section describes two classes, not one:

- **unreached** — the named tests never exercise the mutated code, so any verdict is about something
  else. This is the Go-corpus report and the spec's UC1-S3.
- **vacuous** — the tests do execute it, and the assertion could not have failed either way.

**Coverage is also structurally inapplicable to most of this catalogue.** Of 204 entries measured
2026-08-28: 124 JavaScript, 64 Python gates spawned as subprocesses, 13 Markdown, 3 shell. Line
execution is undefined for the 16 Markdown and shell entries, and this repository already measured
(BACKLOG §34) that `--experimental-test-coverage` sees only the parent process while 9 of 14 test
files spawn — so the 64 Python entries and an unknown share of the JavaScript ones would read
unreached while being exercised. A mechanism that reports most of a healthy catalogue as unproven is
the false-alarm gate people learn to skip.

**What the runner actually lacks is a baseline.** `scripts/mutate.mjs:190-196` spawns the named
tests with the mutation applied and reads the exit status alone: nonzero is `RED`, counted as
noticed. It never establishes that those tests passed *before* the mutation, so a suite already
failing for an unrelated reason yields `RED` on every entry that names it.

## Existing Primitives Audit

- The verdict loop at `scripts/mutate.mjs:175-198` already spawns exactly the named tests and
  already classifies by exit status. **Reshaped:** one prior spawn per distinct test-set, and a
  fourth verdict beside the existing three.
- `begin()` / `finish()` and the on-disk journal (ADR-002) already bracket every mutation.
  **Reused unchanged** — the baseline runs before `begin()`, on an unmutated tree, so it adds no
  window in which a crash could leave the tree broken.
- `tests/package.test.mjs::every catalogue entry still matches the source it mutates, exactly once`
  already removes the STALE class statically, shipped 2026-08-28. **Reused:** F-1 binds to it rather
  than to a new test, and this ADR does not re-decide it.
- ADR-005's `"pass" | "fail" | "unrun"` in `bin/spec-verify` is the same shape one tool over.
  **Reused as precedent**, deliberately including its vocabulary lesson: the third state is printed
  beside the verdict, never instead of it.

## Decision

Before applying any mutation, `mutate.mjs` runs each **distinct test-set** once, unmutated, and
memoises the result. Measured 2026-08-28: 204 mutations use **13 distinct test-sets**, so this costs
13 extra spawns — about 6% of a campaign, not a doubling.

A mutation whose test-set did not pass at baseline is reported `UNPROVEN`. The verdict the tests
produced is still printed beside it, and the line names the next action. `UNPROVEN` entries are
excluded from the `noticed` numerator **and** the denominator, because a claim about a suite that
was already failing belongs in neither.

`UNPROVEN` **instructs and does not block**, per the spec's Decided section: the exit rules are
unchanged — GREEN and STALE still exit 1 with their existing instruction line. An `UNPROVEN` entry
alone does not fail the campaign, because the fix is to repair the suite, which the campaign has
just told you in the words needed to do it.

**This ADR does not solve the vacuous class, and says so rather than implying otherwise.** No
mechanism here detects an assertion that could not have failed; the measurement above shows why
coverage cannot, and a differential cannot either, since a vacuous assertion produces no difference.
What addresses it is the discipline ADR-003 already requires — feed the predicate a synthetic input
that MUST produce a finding, before trusting it — applied by hand twice on 2026-08-27 and once on
2026-08-28. Automating that is a separate decision with no evidence yet; it is deferred, not
forgotten.

What would make this decision wrong: a baseline that is itself unreliable. If a test-set is flaky,
its baseline pass is luck and every verdict beneath it inherits that luck. The campaign already
depends on this — today silently — and the ADR does not fix flakiness; it makes the dependency
visible by naming the set whose baseline failed.

## Alternatives Considered

- **Coverage of the mutated line**, as the spec proposes. Rejected on two measurements taken
  2026-08-28: it is blind to the vacuous class (100%/100% before and after, test passing with the
  mechanism broken) and structurally inapplicable to 80 of 204 entries, with an unknown further
  share of the JavaScript ones lost to subprocess spawning.
- **A baseline per mutation rather than per test-set.** Same guarantee, 204 extra spawns instead of
  13 — roughly doubling a 37-minute campaign. Rejected on cost with no gain: the baseline answers a
  question about the test-set, and running it 88 times for `lifecycle.test.mjs` re-answers it 87
  times.
- **Compare full stdout, not just exit status.** Would catch a suite whose failure COUNT changed
  without the status changing. Rejected as premature: no instance has occurred here, and it makes
  the verdict depend on runner output formatting, which changes between Node versions.
- **Do nothing; the campaign requires a clean tree already.** Rejected: a clean tree says nothing
  about a green suite. UC1-S3 is a real path, and the Go report is an instance of a sibling class.

## Component / Boundary Impact

None — internal to `scripts/mutate.mjs`. `adr-verify --mutant` runs a single mutation against a
task's own fence and is explicitly out of scope, per the spec's Non-Goals.

## Wiring & Contract Changes

Inherited from `docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` §Contracts Touched; delta:

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `mutate.mjs` stdout | `UNPROVEN` verdict beside the tests' own verdict, plus the next action | the verdict loop | the `mutations` CI job, anyone reading a campaign |
| `mutate.mjs` summary | `noticed` denominator excludes UNPROVEN entries, and their count is stated separately | the summary block | as above |
| `mutate.mjs` exit code | unchanged — UNPROVEN alone does not fail the run | the summary block | the `mutations` CI job |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `UNPROVEN` verdict and the tests that exercise it | T1 | T2 | No — T2 binds spec facts to tests T1 creates |

## Implementation

Two tasks, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** a campaign can no longer report `N/N noticed` off a suite that was already failing;
  the entry names its test-set and the action; the cost is 13 spawns.
- **Negative:** a campaign on a broken suite now prints more, not less. That is the intended
  direction, and F-9 keeps the underlying verdict visible so nothing is hidden behind the warning.
- **Neutral:** the vacuous class is unchanged and now explicitly named as unsolved. Being told that a
  known gap is not covered is worth more than a mechanism that appears to cover it.
- **The spec needs amending, which is why this ADR came first.** F-4, F-5 and F-6 are worded around
  "the mutated line was executed" — the mechanism this record rejects on measured evidence. Binding
  nine red stubs before this decision, as `spec-write` Stage 5 instructs, would have produced nine
  tests for a design that does not ship. T2 rewords them and binds against what was chosen.

## Out of Scope

Inherited from `docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` §Non-Goals; delta:

- Detecting the vacuous class automatically. (deferred: docs/BACKLOG.md §39)
- Making a flaky test-set's baseline trustworthy. (deferred: docs/BACKLOG.md §39)
- Comparing test output beyond exit status. (permanent: it binds the verdict to runner output formatting, which changes between Node versions, for a case that has not occurred here.)
- Any change to `adr-verify --mutant`. (permanent: it runs one mutation against one task's fence, and the spec's Non-Goals put it outside this decision.)

## Risks

Inherited from `docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The baseline is read as proving the mutation was exercised, which it does not | Med | High | the verdict word is `UNPROVEN`, never `reached`; ADR-006's own Decision says which class it does not cover, and T1's test asserts a vacuous mutation is still GREEN rather than UNPROVEN |
| 13 extra spawns push CI past its limit | Low | Med | measured: 13 of 204, and the `mutations` job already runs the full campaign inside its budget |

## Rollback

Revert the commit. `mutate.mjs` is invoked deliberately and by one CI job; no persistent state and
no external integration is involved. A caller pinned to the old summary line would have been reading
a denominator that counted entries proving nothing.

## Follow-ups

None — the two gaps are deferred to the backlog with receipts, not left open here.
