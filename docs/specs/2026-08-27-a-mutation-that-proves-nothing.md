# Spec: Name the mutations that prove nothing

> **Date:** 2026-08-27 · **Amended:** 2026-08-28 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` exits 0.
> **Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/BACKLOG.md §29, §31, §35

## Problem

`scripts/mutate.mjs` reports four verdicts and only one of them means the suite was tested.
`STALE` exists because a mutation matching nothing is otherwise indistinguishable from a passing
one, and it fired for real on 2026-08-27 (`fixture: a Windows path is made YAML-safe`, four
backslashes in the catalogue against two in the source).

Two more ways a mutation proves nothing are invisible to it. Measured the same day, in this
repository: ADR-003 T1's first version mutated `bare` to `[]` against `assert.deepEqual(bare, [])`
— applied cleanly, tests ran, fence stayed green because the assertion was ALREADY VACUOUS.
`adr-verify --mutant` said `survived`, which reads as "your test is decoration" when the truth was
"this test could never have failed here". The same shape hit `judge: a blank line ends a bullet`
(an adjacent bullet satisfied the assertion) and `verify: the mutant warning is flushed` (a second
print flushed the same buffer).

And the dangerous inverse, reported 2026-08-27 from a Go corpus: a `killed` verdict from an
acceptance fence that named one test while the falsifiability fixture sat outside it. `survived`
sends someone to fix a test; `killed` from a mutation that was never executed is filed as evidence.

These are TWO classes, not one, and the difference decides the mechanism. Amended 2026-08-28 after
ADR-006 measured it:

- **unreached** — the named tests never exercise the mutated code, so any verdict is about something
  else. The Go report and UC1-S3 below.
- **vacuous** — the tests DO execute it, and the assertion could not have failed either way.

This spec originally named one root cause — "it never observes whether the named tests executed the
mutated line" — and proposed coverage. That covers the first class only. Measured with a six-line
fixture on 2026-08-28: an assertion `deepEqual(uncovered(...), [])` against a subject mutated to
return `[]` passes with the mechanism broken at **100% line and 100% branch coverage, before and
after**. The line executes; the assertion cannot fail. Coverage is blind to the vacuous class by
construction, and that is the class this repository has hit four times.

What the runner actually lacks, and what ADR-006 chose, is a **baseline**: it reads the mutated
run's exit status alone, so a suite already failing for an unrelated reason yields RED on every
entry that names it, and every one is counted as noticed.

## Goal

Every verdict `mutate.mjs` prints is accompanied by whether the suite it was measured against was
working, so that "the tests noticed" and "the tests were already broken" cannot be reported by the
same word.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| campaign runner | human role | trust a `N/N noticed` line without re-reading each entry |
| record author | human role | know whether a `killed` mutant in a task's Mutation Log is evidence |
| CI | scheduled job | fail on a campaign whose verdicts are unproven, not only on GREEN |

## Use Cases

### UC-1: Campaign runner reads a verdict that names its own reliability

- **Trigger:** `node scripts/mutate.mjs` completes · **Preconditions:** a catalogue entry whose `from` matches exactly once
- **Main flow:**
  1. The runner runs each distinct test-set once, unmutated, and memoises whether it passed.
  2. The runner applies the mutation and runs the named tests.
  3. Each verdict is printed with the baseline result attached.
  4. The summary counts as "noticed" only verdicts whose test-set passed at baseline.
- **Failure paths:**
  a. at step 1, the test-set did not pass → every verdict from it is reported as unproven rather than as noticed
  b. at step 1 the set failed and at step 2 the tests passed → reported as unproven, not as GREEN
  c. at step 1 the set failed and at step 2 the tests failed → reported as unproven, not as RED
- **Postconditions:** no printed verdict claims the tests noticed something, when those tests were
  already failing before the mutation was applied.

## Scenarios

### UC1-S1 [happy] a mutation measured against a passing suite keeps its verdict [@spec] → `tests/mutate-runner.test.mjs::a passing baseline leaves every existing verdict exactly as it was`

```gherkin
Given a catalogue entry whose from matches exactly once
And the named tests passed before the mutation was applied
When the campaign runs that entry
Then the verdict is RED, GREEN or HUNG as today
And a vacuous mutation is still GREEN, because a baseline does not prove the site was reached
```

### UC1-S2 [failure] a mutation measured against a broken suite is not reported as noticed [@spec] → `tests/mutate-runner.test.mjs::UNPROVEN entries are in neither half of the noticed ratio`

```gherkin
Given a catalogue entry whose named tests did not pass at baseline
When the campaign runs that entry
Then the verdict is counted in neither half of the noticed ratio
And the report names the failing test-set rather than printing RED or GREEN alone
```

### UC1-S3 [failure] a failing run against an already-failing suite is not evidence [@spec] → `tests/mutate-runner.test.mjs::a verdict taken against a failing baseline is UNPROVEN, not RED`

```gherkin
Given a catalogue entry whose named tests fail for a reason unrelated to the mutation
When the campaign runs that entry
Then the entry is reported as UNPROVEN rather than RED
And the summary does not count it as noticed
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | A `from` string matching other than exactly once is STALE and the mutation is never applied. | `tests/package.test.mjs::every catalogue entry still matches the source it mutates, exactly once` | @spec | |
| F-2 | A run killed by signal or with a null status is HUNG, not GREEN. | `tests/mutate-runner.test.mjs::a run killed by signal is HUNG rather than GREEN` | @spec | |
| F-3 | GREEN and STALE both count as missed and the campaign exits 1. | `tests/mutate-runner.test.mjs::GREEN and STALE both count as missed and exit 1` | @spec | |
| F-4 | A verdict is only counted as "noticed" when the named tests PASSED before the mutation was applied. | `tests/mutate-runner.test.mjs::UNPROVEN entries are in neither half of the noticed ratio` | @spec | |
| F-5 | When the baseline did not pass, the entry is reported as UNPROVEN and never as RED or GREEN alone. | `tests/mutate-runner.test.mjs::a verdict taken against a failing baseline is UNPROVEN, not RED` | @spec | |
| F-6 | An unproven entry names WHY it is unproven, in the same vocabulary every time — which test-set failed at baseline. | `tests/mutate-runner.test.mjs::an UNPROVEN entry names its test-set and the next action` | @spec | |
| F-7 | Taking a baseline never changes what the tests themselves do: the same test files and arguments as the mutated run, and one baseline per distinct set rather than per mutation. | `tests/mutate-runner.test.mjs::a baseline is taken once per distinct test-set, not once per mutation` | @spec | |
| F-8 | An unproven entry names the NEXT ACTION, not only the state — which entry, why it could not be proven, and what to change. | `tests/mutate-runner.test.mjs::an UNPROVEN entry names its test-set and the next action` | @spec | |
| F-9 | An unproven entry never hides or suppresses the verdict the tests produced; the RED or GREEN is still printed beside it. | `tests/mutate-runner.test.mjs::an UNPROVEN entry still reports the verdict the tests produced` | @spec | |

## Domain

A **verdict** is what a campaign says about one catalogue entry. A verdict is **proven** when the
mutated line was executed by the named tests and **unproven** otherwise. `noticed` is a claim about
the suite; it is only meaningful for proven verdicts. Existing vocabulary — RED, GREEN, HUNG,
STALE — is unchanged; this spec adds the proven/unproven axis beneath it.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `scripts/mutate.mjs` stdout | each verdict line gains a reached/unreached statement | anyone reading a campaign, `.github/workflows/selftest.yml` |
| `scripts/mutate.mjs` exit code | an unproven entry may or may not fail the run — see Open Questions | the `mutations` CI job |

## Non-Goals

- Generating mutations, semantically or otherwise (SWE-ABS territory; a separate decision).
- Changing what `adr-verify --mutant` writes into a task's Mutation Log.
- Any change to what the four existing verdict words mean.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Measuring execution changes what the tests do, so the campaign no longer measures the suite it claims to | Med | High | F-7 asserts the run is otherwise identical; a test compares exit code and test count with and without measurement |
| The new axis makes every verdict noisier and people stop reading the output | Med | Med | Proven verdicts print as they do today; only unproven ones gain text |
| Coverage instrumentation is unavailable on a platform, so every entry reads unproven | Low | High | F-5 requires "undeterminable" to be distinguishable from "unreached" so the failure is legible |

## Open Questions

<!-- Empty. The question this spec opened is decided; both entries are under Decided below. -->

## Decided

**The mechanism is a baseline, not coverage.** Decided by ADR-006 on 2026-08-28, against this
spec's own proposal, on two measurements.

Coverage is blind to the vacuous class: an assertion expecting `[]` against a subject mutated to
return `[]` passes with the mechanism broken at 100% line and 100% branch, before and after. It is
also structurally inapplicable to most of this catalogue — of 204 entries measured that day, 64 were
Python gates spawned as subprocesses and 16 were Markdown or shell, where line execution is
undefined, and `--experimental-test-coverage` sees only the parent process (BACKLOG §34).

What ships instead: one unmutated run per distinct test-set, memoised. 207 mutations over 14
distinct sets, so 14 extra spawns rather than 207. F-4, F-5, F-6 and F-7 were reworded to the chosen
mechanism; they previously asserted coverage.

**This spec no longer claims the vacuous class is solved.** Nothing here detects an assertion that
could not have failed. That is named in ADR-006's Decision and deferred to BACKLOG §39 with the four
known instances, rather than left implied.

**The ADR was written before these facts were bound, inverting Stage 5 of `spec-write`.** The
owner's call, 2026-08-28, and the reason is visible above: binding nine red stubs first would have
produced nine tests for coverage, the mechanism that does not ship.

**An unproven entry instructs, it does not block.** Decided by the owner 2026-08-27, against the
recommendation in this spec's first draft.

The draft argued for exit 1 on the grounds that `mutate.mjs` is a tool you invoke deliberately
rather than a hook that interrupts an agent. That reasoning was too narrow. The rule this project
holds is not "gates are polite"; it is that **a block leaves the user with no next move.** An exit
code says no. It does not say what now, and a user who cannot tell what to change next is worse off
than a user with no harness at all — they have lost the information they need to steer.

So an unproven entry is reported, named, and accompanied by the action that would resolve it, and
F-8 makes that a requirement rather than a courtesy. F-9 keeps the underlying RED or GREEN visible,
because suppressing a verdict to make room for a warning is its own kind of hiding.

This does not change the existing exit-1 on GREEN and STALE (F-3), which is prior behaviour with its
own instruction line already attached ("A test that stays green with its mechanism broken is
asserting something else"). What that line demonstrates is the shape to copy: a nonzero exit is
acceptable when the message beside it says what to do. The failure is silence, not the status code.

## Verify

```bash
spec-verify --spec docs/specs/2026-08-27-a-mutation-that-proves-nothing.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | What are the current verdicts and when is each produced? | F-1, F-2, F-3 | Scouted from `scripts/mutate.mjs:175-215`; not asked. |
| 2 | What does the runner already know about whether a mutation was executed? | F-4 | Scouted: nothing. It observes the child's exit code only. |
| 3 | Should the proven/unproven axis replace the existing verdicts? | non-behavioral | No — the four words are load-bearing in CI output and in task Mutation Logs. The axis sits beneath them. |
| 4 | Does an unproven entry fail the campaign, or report without failing? | F-8, F-9 | Instruct, never block. A block leaves the user with no next move; the harness's job is to tell them what to change. Recommended exit 1 and was overruled, with reason. |
| 5 | Coverage of the mutated line, or a baseline per test-set? | F-4, F-5, F-6, F-7 | Baseline. Coverage measured blind to the vacuous class (100%/100% before and after) and inapplicable to 80 of 204 entries. Decided in ADR-006, not asked — the measurement answered it. |
