# Task ADR-015-T1: lint the unreachable Go green path

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** the two `adr-lint` Go-fence advisory contracts and their mutation labels
**Consumes:** normalized Acceptance text from `check_task()`, repository candidates from `tracked_paths()`, advisory reporting from `Findings.advise()`
**Data dependency:** hermetic

## Goal

Advise before execution when a recognized root-level Go Acceptance chain requires a `PASS:` marker
but has no tracked direct definition under its selected literal package scopes, or when a
load-bearing grep over that command's output rejects another selected package's healthy
`[no test files]` status.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | parse the narrow literal Go-fence subset, correlate package scopes with direct test definitions, report both findings, and wire the pass into `main()` |
| `tests/gates.test.mjs` | edit | exercise the real CLI against the reported Go corpus shape and every accepted/no-verdict boundary control |
| `tests/mutations.json` | edit | add one behavioral mutant per advisory so either missing check makes the suite red |

## Ordered Steps

1. Add the failing CLI test `adr-lint reports Go fences whose required success is unreachable`.
   Build a temporary git repository containing the copied conforming ADR fixture, `go.mod`, a
   selected billing package, an unselected web package defining `TestOnlyWeb`, and an embed-only
   assets package. Confirm the working-tree `adr-lint` omits both required findings before any
   implementation edit.
2. In the same test, add the positive controls before implementation: adding `./internal/web/...`
   clears the package-scope finding; defining the required test under a selected package also clears
   it; retaining the embed-only package and scopes while removing only the `[no test files]`
   exclusion clears that finding; and `no tests to run` remains an allowed vacuity guard. Changed
   cwd, a grep over an unrelated sink, an inert `! grep ... || true`, another `go test`, a non-Go
   fence and a dynamic fence each draw no Go verdict.
3. Add small parsing helpers for exactly one root-level literal `go test -v` pipeline, its ordinary
   literal `tee` file sink, and exact mode-aware positive/negated greps over that same sink in one
   load-bearing `&&` chain. Reuse `tracked_paths()`, scan Go strings/comments without borrowing the
   generic stripper, and normalize separators plus injected platform case semantics before directory
   containment. Changed cwd, multiple Go commands, non-verbose or selection-only output, dynamic
   tokens, module import paths, wrappers, stream/device/directory or unrelated sinks, unescaped
   bracket expressions in regex mode, and ambiguous command flow return no verdict.
4. Add the advisory pass over every runnable task's normalized Acceptance fence. Compute the git
   root once in `main()`, call the pass before `errors.protected()`, and use `Findings.advise()` only.
   The CLI test must fail if this call is removed.
5. Add the exact mutation labels `lint: a Go fence selects the test whose PASS line it requires`
   and `lint: no test files is a healthy Go status, not an exclusion`. The first disables the shared
   `main()` call; the second disables only the healthy-status branch. Both must be compiling,
   anchor-preserving mutants: prefix the unique deciding expression with `False and` so each `to`
   still contains its exact `from` substring once. Both name only the CLI test below.
6. Run the two focused catalogue-integrity tests outside the Acceptance fence, then commit the green
   implementation. Run `adr-verify --mutant` once per mechanism and keep evidence only when the
   named CLI regression is the test that goes red; neither catalogue-integrity test is allowed to
   earn the kill. Finish with the full, unpiped repository self-test and the class sweep below.

## Acceptance

```bash
set -o pipefail
node --test --test-name-pattern='adr-lint reports Go fences whose required success is unreachable' tests/gates.test.mjs 2>&1 | tee /tmp/adr015-t1-gates.out &&
grep -qF '✔ adr-lint reports Go fences whose required success is unreachable' /tmp/adr015-t1-gates.out &&
! grep -qE '^✖|ℹ fail [1-9]' /tmp/adr015-t1-gates.out
```

The first positive grep makes this fence red before the named test exists. Node's test-name filter
can match nothing and still exit 0; a skipped or absent test therefore cannot carry this task.
The catalogue-integrity tests are deliberately outside this mutation fence: changing a catalogue
anchor must not earn a behavioral kill. Run them before each mutation and after the restored source:

```bash
node --test --test-name-pattern='every catalogue entry still matches the source it mutates, exactly once|a mutation that matches across lines targets a file git checks out with LF' tests/package.test.mjs
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `adr-lint reports Go fences whose required success is unreachable` | `tests/gates.test.mjs` | through the CLI: out-of-scope verbose `PASS:` test advises with path/scopes; selected, comment-prefixed, and Go-string-surrounded definitions stay silent while names found only in comments/strings still advise; load-bearing exact fixed/regex healthy-status exclusions advise; unescaped regex brackets do not; the same embed-only package without that exclusion stays silent; non-verbose/list output, misleading case/prefix/spacing, platform case semantics, `no tests to run`, changed cwd, stream/directory/unrelated sink, inert guard, multiple-Go, unknown flags, dynamic and non-Go controls stay silent | — |
| `every catalogue entry still matches the source it mutates, exactly once` | `tests/package.test.mjs` | both new anchor-preserving mutation entries remain unique before and after mutation work; preflight, not part of the mutation fence | — |
| `a mutation that matches across lines targets a file git checks out with LF` | `tests/package.test.mjs` | any multi-line Python anchor is portable to Windows; preflight, not part of the mutation fence | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the CLI regression exercises both findings and their no-finding controls |
| 2 — something selects it | the first anchor-preserving mutant disables the shared `main()` call; the second disables only the `[no test files]` branch; the CLI test must kill both |
| 3 — the caller can discover it | no new invocation is introduced; the existing `adr-lint <record> [tasks-dir]` command prints the advice at authoring time with the remedy in the message |
| 4 — it is used | the synthetic consumer fixture reproduces the measured package layout; installed-consumer uptake is not measured yet |

## Class Sweep

**Class:** every static `adr-lint` check that relates an Acceptance selector to evidence the fence
requires.

```bash
rg -n '^def (check_tests_can_fail|selected_by_filter|check_named_tests_are_run|check_go_acceptance_fences)\b' plugin/bin/adr-lint
rg --files-with-matches --multiline --pcre2 '(?s)## Acceptance\s+```bash(?:(?!```).)*\bgo test\b' docs/adr
```

The first command must name the three existing members plus the new pass. The second currently
returns no live corpus member, so the temporary CLI corpus is not optional evidence. Record any new
real member and run it through both findings before marking this task done.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-31 · 61140e1 · mutant killed · exit 1 · `plugin/bin/adr-lint` · the CLI regression notices when the Go-fence advisory pass is no longer selected · acceptance-sha256:e6e2bafaab89bf5c89b65c33530bafd57d04509e18e30c63a79abeb6e2f48e96
- 2026-08-31 · 61140e1* · mutant killed · exit 1 · `plugin/bin/adr-lint` · the CLI regression notices when healthy no-test-files status advice is disabled · acceptance-sha256:e6e2bafaab89bf5c89b65c33530bafd57d04509e18e30c63a79abeb6e2f48e96

## Invariants

- Both findings remain advisory; `adr-lint` exit behavior is unchanged.
- A package/result relationship the parser cannot resolve produces no absence or impossibility
  claim.
- A recognized `PASS:` relationship has literal verbose output, an ordinary stored sink, and an
  exact case-sensitive grep pattern that can match Go's emitted substring.
- Candidate source files come from git-tracked plus untracked, non-ignored paths, never arbitrary
  build output on disk.
- Both path separators are normalized before package containment; no separator literal decides the
  structural result.
- `no tests to run` remains a valid vacuity guard and is never conflated with `[no test files]`.
- The test definition, package-scope and output-exclusion mechanisms each have a positive control;
  deleting the `main()` call is observable at the CLI.

## Risks

- A shell token that only looks literal could draw a false finding. Keep the grammar to the single
  root-level Go pipeline and load-bearing same-sink `&&` greps; changed-cwd, unrelated-sink and
  inert-guard controls must stay silent before widening it.
- A build-tagged or generated test can be runnable without a direct ordinary definition. The
  finding must say what source inspection found, and skip generated/dynamic forms rather than claim
  they cannot run.
- A second Go command or output sink could make package/result pairing ambiguous. Decline the whole
  fence instead of assigning a grep to the wrong command and issuing a false verdict.
- Editing a deciding expression can orphan a mutation anchor. Keep both mutants anchor-preserving,
  run the exact-once catalogue check after the final source edit and around mutation work, and never
  count that package test as the behavioral killer.

## Stop Condition

Stop and return to the owner if the measured fixture cannot be classified without executing shell,
if a dynamic fence would receive a categorical verdict, or if either advisory cannot be broken by
a compiling mutant that the CLI regression kills.

## Out of Scope

- Other test runners and arbitrary shell parsing; docs/BACKLOG.md §78 owns the broader fence-linter
  class.
- Rewriting task files or replaying evidence after a fence changes.
- Runtime proof for build tags, generators, wrappers or subtests.

## Verification Log

<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-31 · e417e7c* · exit 1 · `set -o pipefail …` · acceptance-sha256:e6e2bafaab89bf5c89b65c33530bafd57d04509e18e30c63a79abeb6e2f48e96
  ```
  --- last 10 line(s) of stdout (of 28 after folding 28 raw)
        at Test.run (node:internal/test_runner/test:1397:25)
        at Test.start (node:internal/test_runner/test:1257:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: '[PASS] /var/folders/cp/56m_2hr965zcc37hrln0_fz80000gn/T/quality-harness-go-fence-pgwvQY/docs/adr/ADR-015-green-path/ADR-001-selftest.md + /var/folders/cp/56m_2hr965zcc37hrln0_fz80000gn/T/quality-harness-go-fence-pgwvQY/docs/adr/ADR-015-green-path/tasks\n',
      expected: /advice: .*requires `PASS: TestOnlyWeb`/m,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-08-31 · 61140e1* · exit 0 · `set -o pipefail …` · acceptance-sha256:e6e2bafaab89bf5c89b65c33530bafd57d04509e18e30c63a79abeb6e2f48e96
