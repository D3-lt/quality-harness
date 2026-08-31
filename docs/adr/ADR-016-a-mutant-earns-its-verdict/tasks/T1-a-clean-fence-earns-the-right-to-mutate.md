# Task ADR-016-T1: a clean fence earns the right to mutate

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** clean-before-mutate baseline and `UNPROVEN` no-write outcome
**Consumes:** normalized Acceptance fence, timeout and existing result classifiers from `adr-verify`
**Data dependency:** hermetic

## Goal

Prevent a pre-existing red or vacuous Acceptance fence from lending its failure to a mutant.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | arm the journal, then run and classify the clean fence before applying a mutant, and sharpen the survivor wording |
| `tests/evidence-chain.test.mjs` | edit | prove the contract through the real CLI with pre-red, vacuous, timeout and passing controls |
| `tests/mutations.json` | edit | add a behavioral mutant that removes the clean-baseline selection point |

## Ordered Steps

1. Add the failing CLI test `adr-verify requires a clean fence before it mutates`. A task whose
   clean fence emits a real failing-test marker and exits non-zero must print `UNPROVEN`, exit 1,
   leave the target byte-identical, print no `MUTANT APPLIED`, leave no live journal after cleanup,
   and append no Mutation Log row. Confirm the current CLI applies the mutant and can credit the
   unrelated failure.
2. Add controls in the same test: clean timeout, environment failure, and recognized no-tests output
   each refuse before mutation; a journal path that cannot be armed refuses before either fence; a
   clean fence that exits 0 and scores tests proceeds; the existing unread target then produces
   `survived`, exits 1, restores the target, and writes that non-evidence row. A fence that passes
   clean and hangs only after the target changes remains `UNRUN`, restores the target, and writes no
   Mutation Log row.
3. Move the exact normalized fence run ahead of target mutation while keeping ADR-002's journal
   armed before any fence side effect. Reuse the existing shell, cwd, environment, timeout and
   `scored_nothing()` vocabulary. Mark the journal phase `baseline`, print the observed baseline
   reason, restore and remove the journal, and write no row because no mutant ran. Preserve exit 2
   for usage/authoring errors.
4. Reuse the clean result when the mutant removes all tests instead of running a second post-hoc
   baseline. Preserve build/parse and machine failures as `inconclusive`, and preserve a mutant
   timeout as `UNRUN` with no row; do not promote any of them merely because the baseline passed.
5. Make a survivor explicitly say the fence may not materialize, compile, load, or assert on the
   changed path. Add the exact catalogue label `verify: a mutant is judged only after its clean
   fence passes` by disabling the unique baseline guard/call, and prove the CLI regression kills it.
6. Run the focused catalogue-integrity checks outside this task's Acceptance, execute the mutant,
   restore, and run the full unpiped repository self-test before marking the task done.

## Acceptance

```bash
set -o pipefail
node --test --test-name-pattern='adr-verify requires a clean fence before it mutates|an interrupted clean baseline cannot silently lend its changed tree to a later run' tests/evidence-chain.test.mjs 2>&1 | tee /tmp/adr016-t1-clean-baseline.out &&
grep -qF '✔ adr-verify requires a clean fence before it mutates' /tmp/adr016-t1-clean-baseline.out &&
grep -qF '✔ an interrupted clean baseline cannot silently lend its changed tree to a later run' /tmp/adr016-t1-clean-baseline.out &&
! grep -qE '^✖|ℹ fail [1-9]' /tmp/adr016-t1-clean-baseline.out
```

The positive grep makes the fence red before the named test exists; Node's name filter can otherwise
match nothing and exit 0. Before and after mutation work, run separately:

```bash
node --test --test-name-pattern='every catalogue entry still matches the source it mutates, exactly once|a mutation that matches across lines targets a file git checks out with LF' tests/package.test.mjs
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `adr-verify requires a clean fence before it mutates` | `tests/evidence-chain.test.mjs` | through the CLI: pre-red, timeout, missing-runner and no-tests clean fences produce `UNPROVEN` before mutation; a journal-arm failure runs neither fence; a clean-scored control proceeds; an unread target is a restored survivor with reachability wording; and a mutant-only timeout remains restored `UNRUN` with no row | — |
| `an interrupted clean baseline cannot silently lend its changed tree to a later run` | `tests/evidence-chain.test.mjs` | a SIGKILL after the clean fence rewrites or removes the target leaves the baseline journal intact, preserves the unknown tree state, and blocks recovery from claiming it restored anything | — |
| `every catalogue entry still matches the source it mutates, exactly once` | `tests/package.test.mjs` | the new source anchor remains unique before and after mutation work; preflight only | — |
| `a mutation that matches across lines targets a file git checks out with LF` | `tests/package.test.mjs` | a multi-line Python anchor remains portable when used; preflight only | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the CLI regression observes every baseline outcome and the positive survivor control |
| 2 — something selects it | the catalogue mutant removes the baseline guard/call and the CLI test goes red |
| 3 — the caller can discover it | existing `adr-verify --mutant` needs no new invocation; output names `UNPROVEN` and the remedy |
| 4 — it is used | the regression reproduces the reported pre-red fence; consumer uptake is not measured yet |

## Class Sweep

**Class:** every path in `run_mutant()` that can alter the target before the clean Acceptance result
is known.

```bash
rg -n 'write_source\(|write_bytes\(|journal\.write_text|subprocess\.run' plugin/bin/adr-verify
```

Journal creation must precede the clean subprocess call, and both must precede every target write.
Usage validation and read-only source inspection may precede the journal. Record any new write or
subprocess path and add a control before marking the task done.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-31 · 0c5c36e* · mutant killed · exit 1 · `plugin/bin/adr-verify` · disabling the clean-baseline guard must let the named CLI regression observe an unearned mutant verdict · acceptance-sha256:10332fcd9d6f3369129b6f509cd60744157cdc0676ca956fd37a0176af582b63
- 2026-08-31 · 0c5c36e* · mutant killed · exit 1 · `plugin/bin/adr-verify` · disabling the clean-baseline guard must let the named CLI regression observe an unearned mutant verdict · acceptance-sha256:10332fcd9d6f3369129b6f509cd60744157cdc0676ca956fd37a0176af582b63
- 2026-09-01 · 0c5c36e* · mutant killed · exit 1 · `plugin/bin/adr-verify` · disabling the clean-baseline guard must let the named CLI regression observe an unearned mutant verdict · acceptance-sha256:10332fcd9d6f3369129b6f509cd60744157cdc0676ca956fd37a0176af582b63
- 2026-09-01 · 0c5c36e* · mutant killed · exit 1 · `plugin/bin/adr-verify` · disabling the clean-baseline guard must let the named CLI regression observe an unearned mutant verdict · acceptance-sha256:7aa5a71679cbaef3c3632ac52b5ad60b9a0be35b0579a8c442e7475982c1d4ef

## Invariants

- An unusable clean fence changes no target, leaves no journal after cleanup, and writes no Mutation
  Log row.
- A journal that cannot be written starts neither fence and grants no verdict.
- No shell text is interpreted to guess whether a target is compiled.
- A clean pass cannot turn a mutant build break, timeout, or machine failure into a kill; timeout
  remains `UNRUN` and writes no row.
- The exact task Acceptance command remains the command run in both phases and bound by the digest.

## Risks

- A flaky fence can still pass before the mutant and fail afterward. State that limitation in the
  verdict path; do not invent rerun counts in this task.
- The extra run can double campaign time. Keep it mandatory because the alternative is an unearned
  kill, not merely slower feedback.
- Refactoring the baseline can disturb the missing-tests special case. Retain explicit controls for
  clean-scored/mutant-empty and clean-empty.

## Stop Condition

Stop and return to the owner if a clean baseline cannot be measured with the exact recorded fence,
or if the change would require parsing shell to decide whether the target is compiled.

## Out of Scope

- Generated-output restoration; T2 owns it.
- Flake detection or automatic retries.
- Changing human-observed mutation evidence.

## Verification Log

<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-31 · 0c5c36e* · exit 1 · `set -o pipefail …` · acceptance-sha256:10332fcd9d6f3369129b6f509cd60744157cdc0676ca956fd37a0176af582b63
  ```
  --- last 10 line(s) of stdout (of 100 after folding 100 raw)
        at Test.run (node:internal/test_runner/test:1397:25)
        at Test.start (node:internal/test_runner/test:1257:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: { baselineRefusals: [ [Object], [Object], [Object], [Object] ], journalFailure: { refused: true, namesJournal: true, mutantApplied: true, targetRestored: true, mutationLogEmpty: true }, survivor: { status: 1, mutantApplied: true, targetRestored: true, journalEmpty: true, rowWritten: true, namesReachabilitySeam: false }, mutantTimeout: { status: 2, unrun: true, mutantApplied: true, targetRestored: true, mutationLogEmpty: true, journalEmpty: true } },
      expected: { baselineRefusals: [ [Object], [Object], [Object], [Object] ], journalFailure: { refused: true, namesJournal: true, mutantApplied: false, targetRestored: true, mutationLogEmpty: true }, survivor: { status: 1, mutantApplied: true, targetRestored: true, journalEmpty: true, rowWritten: true, namesReachabilitySeam: true }, mutantTimeout: { status: 2, unrun: true, mutantApplied: true, targetRestored: true, mutationLogEmpty: true, journalEmpty: true } },
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-08-31 · 0c5c36e* · exit 0 · `set -o pipefail …` · acceptance-sha256:10332fcd9d6f3369129b6f509cd60744157cdc0676ca956fd37a0176af582b63
- 2026-08-31 · 0c5c36e* · exit 0 · `set -o pipefail …` · acceptance-sha256:10332fcd9d6f3369129b6f509cd60744157cdc0676ca956fd37a0176af582b63
- 2026-09-01 · 0c5c36e* · exit 0 · `set -o pipefail …` · acceptance-sha256:10332fcd9d6f3369129b6f509cd60744157cdc0676ca956fd37a0176af582b63
- 2026-09-01 · 0c5c36e* · exit 0 · `set -o pipefail …` · acceptance-sha256:7aa5a71679cbaef3c3632ac52b5ad60b9a0be35b0579a8c442e7475982c1d4ef
