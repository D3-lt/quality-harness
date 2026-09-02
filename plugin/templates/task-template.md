# Task <ADR-NNN>-<slug-or-id>: <One-line goal>

**Depends-on:** <task-ids comma-separated, or "none">
**Blocked-on:** <OPTIONAL, and only where the Acceptance is human-observed: the event this task
waits on, written so a later reader can check whether it has HAPPENED. A command that exits 0 once
it has is the best form — `commit <sha> is an ancestor of master (git merge-base --is-ancestor
<sha> master)`. Where only someone with other access can confirm it — a log on a host you cannot
reach, a person who has to look — say who, with `checked by: <who>`; the gate reads that marker
and stops asking. Not a mood, and not
a second Stop Condition: that section says when to abandon, this one says what to wait for. A task
with a runnable ```bash fence cannot use this header — a task that can run its own acceptance is
not waiting, it is unfinished, which is `pending` or `partial`.>

<An unqualified id names a SIBLING task in this ADR: `T2`. A QUALIFIED id names a task in another
record and is written `ADR-003-T4` or `ADR-003/T4` — `adr-lint` resolves it against the corpus, and
one naming no record, or a record with no such task, is an error for the same reason a cited ADR must
resolve.

Use the qualified form when your task must not start until another RECORD's task lands. Before this
existed the constraint could only be written as prose, in whichever record noticed it — which is
never the record that has to obey it.>
**Covers:** <spec fact/scenario IDs this task implements (F-3, UC1-S2), or "none — no spec">
**Estimated scope:** S (single file) | M (multi-file) | L (cross-boundary)
**Owner:** <name | unassigned>
**Produces:** <contracts other tasks consume, or none>
**Consumes:** <contracts from sibling tasks, or none>
**Data dependency:** hermetic | needs <what: a populated corpus, a live service, recorded traffic, a model>
**Proof map:** v1
**Rests-on:** <OPTIONAL: the mechanisms your Acceptance fence's claim depends on, as backticked
names separated by commas — `the exit code`, `the redacted home path`. Or `none — <reason>` when the
fence rests on one indivisible thing. Leave the header out entirely and nothing changes.>

<WHY THIS IS SAFE TO HAND-WRITE when every row about a run is tool-written: it records an
OBLIGATION, not evidence. `adr-lint` requires ONE killed mutant bound to your fence's digest before
`done`, and that obligation is existential — a fence chaining three assertions with one bound mutant
has been shown capable of failing for one reason, and nothing is known about the other two. Nothing
in a task file says what the other two are, so nothing can count them. This header is that count,
and declaring MORE can only make the record admit more than it has proved. The incentive runs
backwards, which is why it may be prose.>

<`hermetic` means every Ordered Step runs from a clean checkout with no external state. Anything else
names what is required. This header exists because the gate cannot see the difference: a task whose
steps need real data while its Acceptance is a self-contained unit test passes with its actual
requirement unmet, and nobody finds out until sign-off. If this is not `hermetic`, the sign-off line
must record what the run was taken against.>

## Goal

<One sentence. Small enough to implement and validate independently.>

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `<path>` | <add/edit/delete> | <reason> |

<Name what SELECTS the new thing, not only what implements it. If this task adds an arm, a handler, a
backend, a config field or a flag, the registry, composition root, flag parser or help text that
makes it reachable is an affected file too — and its absence is this pipeline's most common shipped
defect: a component that is finished, tested and called by nothing. Ask of each new symbol: which
line selects this, and what fails if that line is deleted?>

## Ordered Steps

1. [S1] Confirm the failing test(s) for `Covers:` IDs exist and are red (commit them if missing — TDD red). <If Covers is "none — no spec": write the failing test for this task's behavior first.>
2. [S2] <step>

<Keep each `[S<n>]` identity stable when steps move; list ordinals express order and IDs express
identity. Map every step from the Tests table below, or put at least one exact non-test proof marker on the
step: `[proof: acceptance]`, `[proof: mutation]`, or `[proof: human: <reason>]`. A human reason must
name what a person inspects. Several tests may map one step, one test may map several steps, and a
supplementary test maps `—`. The linter checks that every reference resolves; it does not infer that
a test semantically proves the step.>

## Acceptance

```bash
<command whose exit code 0 proves this task is done>
```

<Ask what this command does when the task's tests DO NOT EXIST YET, which is its state the moment you
write it. `go test -run <no match>`, `phpunit --filter <no match>` and `cargo test <name>` all print a
summary and exit 0 — so the gate passes with nothing built. `adr-verify` now records a run that
scored no tests as a failure, but write the fence so it is obviously red first. A portable guard:

    set -o pipefail
    <runner> <args> 2>&1 | tee /tmp/acc.out && ! grep -qE "no tests to run|^FAIL|^--- FAIL" /tmp/acc.out

`set -o pipefail` and `&&`, not `;`, and this is a correction rather than a style note. Without
pipefail the pipeline's exit status is `tee`'s, and `;` then discards even that — so the ONLY thing
tested is the grep, and a runner that never starts prints nothing the grep matches. Measured
2026-08-28: `nosuchrunner --test x` exits 0 through the `;` form and 127 through this one. This
template recommended the broken form until then, and ten task fences in its own corpus inherited it.

`adr-verify` does not save you here: `scored_nothing()` recognises only a runner's own "nothing to
run" vocabulary, and `environment_failure()` is consulted only when the exit code is already
non-zero — so the run is recorded as a tool-written exit-0 claim.

`^FAIL` is needed as well as `^--- FAIL`: a build failure prints `FAIL <pkg> [build failed]` with no
`--- FAIL` line, so a check counting only those reads a package that does not compile as a pass.>

A second, subtler hole: a fence whose filter names the new unit AND suites that already pass is
satisfied by the already-passing ones alone. A `tests > 0` guard does not see this — the count is
non-zero and the result is `passed`, both truthfully, of the wrong subject. Measured 2026-08-20: a
fence filtering `NewClass|ExistingSuiteA|ExistingSuiteB` exited 0 with 13 tests green and none of
the task done. Regression coverage belongs in the fence; it just must not be able to stand in for
the work. Run the NEW unit alone as the first command, then the regression suites as a second,
chained so both must pass:

    <runner> --filter '<OnlyTheNewUnit>' && <runner> --filter '<RegressionSuites>'

The general form, worth asking of any aggregate gate: which of these subjects could carry the
verdict by itself?

And the inverse, which is worse because it reads as success. A fence narrow enough to name ONE test
leaves everything else outside it — including the fixture that proves the test can fail. Reported
2026-08-27 from a Go corpus: the falsifiability case had to become a SUBTEST rather than a sibling,
because a sibling sits outside the only command that has to pass, and `adr-verify --mutant` would
have returned `killed` from a fence that never ran the mutant. A `survived` verdict says the test is
decoration and you go and fix it; a `killed` verdict from a fence that never executed the mutation
is evidence of nothing, filed as evidence of something. Ask of every fence: is the thing that proves
this can fail INSIDE the command, or beside it?

A fourth, which is about the RUNNER rather than the fence: a fence can outrun the agent's tool
timeout. Reported 2026-08-27 from a Windows session, where `./verify.sh` under Docker took about
twelve minutes against a ten-minute limit — the command is killed, no entry is written, and the
work looks unverified when it was merely unfinished. Run such a fence detached and poll for it
(`nohup <fence> > out 2>&1 &`, then check), then invoke `adr-verify` on a tree where the fence
completes quickly, or narrow the fence to the subset this task actually proves and say in the task
what the wider run covers.

`adr-verify` deliberately offers no detached mode of its own, decided 2026-08-28 (ADR-002
follow-up). The whole guarantee is that the tool which RAN the command is the tool that wrote the
entry; a mode that records a result someone else obtained reintroduces the hand-pasted evidence the
Verification Log exists to eliminate. A slow fence is a fence problem, and it is yours to shape.

If automated proof is impossible: `Acceptance is human-observed: <exact sign-off step>.`

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| <test> | <path> | <behavior/invariant> | <F-n / UCn-Sm or —> | <S1, S2 or —> |

<Before listing tests for a task that operates on EXISTING records, enumerate the shapes the
creation path can already produce — more than one child row, an unchanged line, an optional leg
absent, the state a reaper or scheduler leaves behind — and decide for each: test it, or refuse it
with a named error. Measured 2026-08-20: eleven P1 defects, every one a shape the creation contract
permits and no test covered, all of them past a spec gate that RAN its bound tests. A gate verifies
the tests you wrote; a mutation proves a test binds to what it names. Neither invents the missing
one.>

<Every name here must exist in the file beside it before the README may say `done` — `adr-lint` reads
the real files, because a table kept beside the truth is a thing somebody has to remember. And each
test must be able to FAIL: remove the mechanism it is about, watch it go red, put it back. Confirm the
mutant still compiles first — a mutant that does not build has not been tested, it has been skipped.>

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | <the unit test> |
| 2 — something selects it | <the call site, and the mutation that proves it is reached> |
| 3 — the caller can discover it | <the schema / flag / doc, and the check on it — or `n/a: no declared interface`> |
| 4 — it is used | <how usage would be observed, or `nothing measures this yet`> |

<⚠ RUNG 2 IS A CLAIM ABOUT A CHECK'S UNIVERSE, not about the check. A named gate
can be real, passing and correctly written and still be unable to see the thing
this task adds — a struct-tag check cited for a conditional map entry, a
line-based rule cited for something spanning lines. It then reads as enforcement
and is decoration. The test is cheap and nobody runs it: DELETE the thing this
task protects and watch the named check go red. If it stays green, the rung names
the wrong check. Nothing can decide this mechanically, which is why it is asked
here rather than enforced (BACKLOG §53).>

<Rung 3 is the one that is missed. A tool argument the handler honours but the schema never
advertises works for anyone who sends it, so every behavioural test passes — and the caller who
reads the schema never sends it. Only a source or schema check reaches that rung. Rung 4 is not a
gate; writing "nothing measures this yet" is a legitimate and useful answer, and it is how a
capability that ships unused becomes visible later instead of never.>

## Mutation Log

<Tool-written by `adr-verify <task.md> --mutant <file> [--also-restore <generated-file> ...]
--from <text> --to <text> --why <text>`.
Do NOT hand-type entries — `adr-lint` rejects anything off this grammar, and a hand-typed row is
exactly the thing this section replaced.

`--also-restore` is repeatable, once per regular repository-relative output the recorded Acceptance
fence itself materializes from the mutated source. It does not infer outputs from a suffix, and
undeclared side effects stay outside the transaction and are not restored. Interrupted unknown or
changed generated bytes are preserved for human reconciliation. Declaring a path grants the live
run authority to overwrite its bytes or delete it during cleanup, including over a concurrent edit;
declare only disposable generated outputs whose command-entry state should be restored.

  - YYYY-MM-DD · <sha[*]|no-git> · mutant <killed|survived|inconclusive> · exit <N> · `<file>` · <why> · acceptance-sha256:<64 hex>[ · covers:<mechanism>]

`killed` requires a non-zero exit, `survived` requires exit 0, and `inconclusive` may carry either.

`--covers <mechanism>` is optional and names one mechanism from this task's `**Rests-on:**` header.
A name the task did not declare is refused before anything is mutated: the tool records which
mechanism a mutant bound, and never invents one. Without `--covers` the row is exactly the row it
has always been.
The acceptance digest binds the mutant to the exact fence it proved could fail; changing the fence
invalidates both passing and mutation evidence.

WHEN THE FENCE CANNOT RUN TO COMPLETION — and only then — a mutation you performed BY HAND has a
lane of its own:

  adr-verify <task.md> --human-mutant <file> --from <text> --to <text> --test <name> --test-exit <N> --why <text>

  - YYYY-MM-DD · human-observed · mutant killed · test exit <N> · `<file>` · line <N> · from `<a>` · to `<b>` · test `<name>` · <why>

"Cannot run to completion" means a CLAUSE whose precondition is not met — an integration step against
something this checkout cannot reach. It does not mean slow, or awkward, or needing docker: on a slow
fence `--mutant` still produces tool-written truth, it just costs time. Say in `<why>` WHICH clause
blocks it; `adr-lint` advises when a runnable fence uses this lane, and that sentence is the answer.

The tool checks what it can — your `--from` must match exactly one place in the named file, and the
line number is derived from that match rather than typed — and it runs nothing, which is the premise.
What it cannot check is that you applied the diff at all. That is what this lane trades away.

THE LANE RAISES THE FLOOR, NEVER THE CEILING. It does not make a task `done`. The `done` gate wants a
killed mutant carrying the acceptance digest of the fence it proved, and a hand-reported row has no
digest because no fence ran — so a task with real work, real verification and a real hand-performed
kill sitting behind an unrunnable fence is not `done` and not `pending`. It is `partial` (ADR-014),
which is a status with obligations rather than an exemption.

The reason it stops there is an incentive, not a technicality. If a hand-typed row unlocked `done`,
then *declaring your fence unrunnable* would become the cheap path to the strongest claim in the
system — and that claim is the one half of the row nothing can verify. The mutation half is checkable
against the file; "the fence could not run" is prose. Do not build `done` on the unverifiable half.

Why the table that used to live here became a tool: every other check in this pipeline proves a
command exited 0, and nothing proved a command CAN exit non-zero — so a test bound to nothing passes
exactly like a test bound to the mechanism. The old `| Mutation | Compiles? | Test that goes red |`
table was hand-filled, which is the same hole the Verification Log narrows — narrows rather than
closes: a local gate reading local files cannot tell a run from a transcription, and issue #4
reproduced a full hand-typed `pending` -> `done` on 2026-09-01. What both sections buy is cost, and
drift-binding to the fence they were taken against. Measured 2026-08-21: a harness whose edit silently no-opped printed
"mutant applied" for a file that never changed, and an assertion matching a config file's COMMENTS
survived deletion of the real key. Both were declared mutation-checked; neither had been.

adr-verify now does the parts an author gets wrong: it refuses a `--from` that is absent or
non-unique, refuses a mutant that only changes comments, syntax-checks the mutated file where the
language makes that cheap, restores the file in a `finally`, and grades the run. Only `killed`
counts. `survived` means the fence passed with the mechanism broken — the test is decoration.
`inconclusive` means the fence failed without a failing assertion (nothing ran, or it did not
build), which is a skipped mutant wearing a kill's exit code.

ONE ENTRY PER MECHANISM this task adds. What the tool cannot judge is whether the mutant was WELL
CHOSEN — uniqueness leaves a trivial irrelevant line available as an escape hatch, and only `--why`
guards that. Before trusting a kill, ask whether the fixture could PRODUCE the failure at all: an
assertion over a corpus that cannot exhibit the defect is unfalsifiable however it is worded.

If a mutant SURVIVES and you cannot construct a test that kills it, leave the survived entry in and
say why in the task prose. An honest "not covered behaviourally: forcing this needs a contrived
corpus" is worth more than a coverage claim the next reader cannot check.>

## Invariants

- <must remain true>

<If this task is amended mid-execution, sweep the WHOLE file, not the section you were looking at.
An amendment that updates the Goal and leaves Invariants asserting the opposite is worse than a
contradiction, because both halves read as current.>

## Risks

- <risk and mitigation, or none>

## Stop Condition

<What should block execution and require user input.>

<Include, where the task turns on a measurement: what would make this criterion IMPOSSIBLE to fail on
the data available? A gate that cannot fail authorises everything downstream on a verdict that means
nothing, and it looks identical to a gate that passed.>

## Out of Scope

- <non-goal — plain bullets here mean intra-ADR scoping ("that's T5's job"), no tag needed. If a bullet punts real work that no sibling task owns, tag it `(deferred: <pointer>)` so `adr-debt` surfaces it. And a deferral is not filed by pointing at
a file — write the entry at the destination, naming this ADR, in the same commit. A pointer to a real
file that never received anything passes every check there is.>

## Verification Log

<Tool-written by `adr-verify <this-file>` — do not hand-write entries. Append-only; failures stay (first entry should be the TDD red run). Grammar, enforced by adr-lint:
`- YYYY-MM-DD · <git-sha[*]|no-git> · exit <N> · <command in backticks> · acceptance-sha256:<64 hex>` (`*` = dirty tree, ` …` = multi-line command; the digest covers the complete normalized Acceptance fence)
`- YYYY-MM-DD · human-observed · <sign-off>` via `adr-verify --human "<sign-off>"` for human-observed Acceptance.
README may mark this task `done` only when the log holds an exit-0 entry matching the current Acceptance command.>
