# Task ADR-005-T1: could-not-run is its own verdict, code and word

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic

## Goal

Stop `spec-verify --implemented` reporting `test failing` for a bound test it never ran, and give
the condition its own verdict, exit code, status word and remedy message.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `bin/spec-verify` | edit | `test_runs()` is where the boolean forced "could not run" to borrow "failed"; `main()` is where the verdict is rendered and the exit code chosen |
| `tests/gate-rules.test.mjs` | edit | the suite that already exercises `--implemented` across green, red, and override forms |
| `tests/mutations.json` | edit | two entries: one restores the false claim, one makes an unadjudicated fact exit 0 |

## Ordered Steps

1. Confirm the failing test first: `spec-verify says it could not run a test, rather than that the test failed`, binding an `@implemented` fact with no `Cmd` override in a root with no project marker. It reproduces the report exactly — `RED F-1: test failing — no stack detected and no Cmd override`, exit 3.
2. Widen `test_runs()` from `bool` to `"pass" | "fail" | "unrun"`, and return `"unrun"` for all three cases where nothing ran: no detected stack, a `Cmd` override that could not be executed, and a stack command that could not be executed.
3. Collect `unrun` as a fourth list in `check_spec()`, rendered under `UNRUN` and never under `RED`.
4. Choose the status word and the code: `PARTIAL` when nothing observed failed and something was not observed, exit 4. A real failure still outranks it, because exit 3 is actionable now.
5. Write the remedy into the message — add a `Cmd` cell, or bind under a directory whose markers name a known runner — since the old text said what was missing and never what to do.
6. Add both mutations and confirm each is RED before recording.

## Acceptance

```bash
node --test tests/gate-rules.test.mjs tests/gates.test.mjs 2>&1 | tee /tmp/adr005-t1.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr005-t1.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `spec-verify says it could not run a test, rather than that the test failed` | `tests/gate-rules.test.mjs` | exit 4 not 3, `UNRUN` present, `RED` and `test failing` absent, `[PARTIAL]` status, the fact named, and the remedy mentioned | — |
| `spec-verify --implemented runs the bound tests and separates RED from broken` | `tests/gate-rules.test.mjs` | unchanged: a real pass is 0 and a real failure is still 3, so the new verdict did not absorb either | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test above |
| 2 — something selects it | `scripts/selftest.sh` runs `node --test tests/*.test.mjs`; two catalogue mutations break the claim and the exit code independently |
| 3 — the caller can discover it | the docstring's `Exit codes:` line carries 4, and the `UNRUN` message names the remedy at the moment the author hits it |
| 4 — it is used | reproduced against the working-tree gate 2026-08-28: `[PARTIAL]`, one `UNRUN` line, exit 4, on the fixture that produced `RED`/exit 3 before |

## Class Sweep

**Class:** every site in `bin/spec-verify` that reports an outcome it did not obtain — a command
that could not be run being reported as a verdict about the code.

```bash
grep -n 'return False\|return "unrun"\|return ("pass"\|return ok,' bin/spec-verify
```

Run 2026-08-28. Inside `test_runs()`: three sites where nothing ran — no detected stack, an
unrunnable `Cmd` override, an unrunnable stack command — all three previously `False`, all three now
`"unrun"`. The report named only the first; the sweep is why the other two are not still claiming
failures nobody observed.

**One sibling found OUTSIDE this task's scope, and left deliberately.** `test_exists()` under
`--collect` (`bin/spec-verify:356`) returns `False` when the COLLECTOR could not be run, and line
571 renders that as `bound test not found`, exit 2. Same defect exactly: a command that did not run,
reported as an observation about the repository. It is not fixed here because the owner scoped this
to the run verdict, and fixing it means threading the same tri-state through `--spec`, which is a
second decision about a second mode. Deferred to docs/BACKLOG.md §38 rather than noticed and
forgotten — the other returns in `test_exists()` are honest, because they really did look and
really did not find it.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->

## Invariants

- `UNRUN` is never counted as a failure and never rendered under `RED`.
- `UNRUN` is never a pass either: the exit code is non-zero and the status word is not `PASS`.
- A real failure outranks an unadjudicated one; both lists print in the same run.
- `--draft` and `--spec` are untouched — neither runs a test, so neither can misreport one.

## Risks

- A caller treating any non-zero as "tests failed" sees an unfamiliar code. Nothing in this repository does, and non-zero still means do not proceed.
- `UNRUN` could be read as success by a human skimming. Mitigated by the status word and by a mutation that sets the code back to 0.

## Stop Condition

Stop if any consumer is found that branches on `spec-verify`'s exit code numerically — adding a
code would then be a breaking change needing its own migration rather than a bug fix.

## Out of Scope

- Adding `go test` or any other runner. (deferred: docs/BACKLOG.md §38)
- A `Cmd` column for scenarios. (deferred: docs/BACKLOG.md §38)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
