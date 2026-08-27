# Spec: Name the mutations that prove nothing

> **Date:** 2026-08-27 · **Status:** Grilling
> **Owner:** zy · **Becomes:** standalone until an ADR is written
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

The common root, and the only thing the runner is actually missing: **it never observes whether the
named tests executed the mutated line.**

## Goal

Every verdict `mutate.mjs` prints is accompanied by whether the mutated site was reached, so that
"the tests noticed" and "the tests never ran this" cannot be reported by the same word.

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
  1. The runner applies the mutation and runs the named tests.
  2. The runner determines whether the mutated line was executed by that run.
  3. Each verdict is printed with that determination attached.
  4. The summary counts only verdicts whose site was proven reached as "noticed".
- **Failure paths:**
  a. at step 2, execution cannot be determined → the verdict is reported as unproven rather than as noticed
  b. at step 2, the site was NOT reached and the tests passed → reported as unproven, not as GREEN
  c. at step 2, the site was NOT reached and the tests failed → reported as unproven, not as RED
- **Postconditions:** no printed verdict claims the tests noticed something they never executed.

## Scenarios

### UC1-S1 [happy] a mutation whose site the tests execute keeps its verdict [@draft] → `— to bind`

```gherkin
Given a catalogue entry whose from matches exactly once
And the named tests execute the mutated line
When the campaign runs that entry
Then the verdict is RED or GREEN as today
And the report states that the site was reached
```

### UC1-S2 [failure] a mutation the tests never execute is not reported as noticed [@draft] → `— to bind`

```gherkin
Given a catalogue entry whose named tests do not execute the mutated line
When the campaign runs that entry
Then the verdict is not counted in the noticed total
And the report names the site as unreached rather than printing RED or GREEN alone
```

### UC1-S3 [failure] a failing run that never reached the site is not evidence [@draft] → `— to bind`

```gherkin
Given a catalogue entry whose named tests fail for an unrelated reason
And those tests do not execute the mutated line
When the campaign runs that entry
Then the entry is reported as unproven
And the summary does not count it as noticed
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | A `from` string matching other than exactly once is STALE and the mutation is never applied. | `— to bind` (scouted: `scripts/mutate.mjs:180-185`) | @draft | |
| F-2 | A run killed by signal or with a null status is HUNG, not GREEN. | `— to bind` (scouted: `scripts/mutate.mjs:194-196`) | @draft | |
| F-3 | GREEN and STALE both count as missed and the campaign exits 1. | `— to bind` (scouted: `scripts/mutate.mjs:209-215`) | @draft | |
| F-4 | A verdict is only counted as "noticed" when the mutated line was executed by the named tests. | `— to bind` | @draft | |
| F-5 | When execution of the mutated line cannot be determined, the entry is reported as unproven and never as RED or GREEN alone. | `— to bind` | @draft | |
| F-6 | An unproven entry names WHY it is unproven, in the same vocabulary every time — unreached site, or undeterminable. | `— to bind` | @draft | |
| F-7 | Determining execution never changes what the tests themselves do: the same test files, arguments and exit code as an unmeasured run. | `— to bind` | @draft | |
| F-8 | An unproven entry names the NEXT ACTION, not only the state — which entry, why it could not be proven, and what to change. | `— to bind` | @draft | |
| F-9 | An unproven entry never hides or suppresses the verdict the tests produced; the RED or GREEN is still printed beside it. | `— to bind` | @draft | |

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

None — the one question this spec opened is decided; see Decided below.

## Decided

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
