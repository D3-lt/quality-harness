# ADR-085: A build diagnostic inside a failing assertion is a kill

**Status:** Accepted
**Date:** 2026-10-06
**Owner:** Zy
**Spec:** None — no spec stage; docs/BACKLOG.md §253 states the defect
**Cross-references:** docs/adr/ADR-016-a-mutant-earns-its-verdict.md, docs/adr/ADR-025-a-clean-run-is-evidence-of-itself.md, docs/adr/ADR-063-a-record-is-its-number-or-its-stem.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. T1 and T2 each add one campaign mutation per `Rests-on` name; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-016 — the clause of its Decision reading "mutant fence fails on build/parse or an environment failure: `inconclusive`" is narrowed, not reversed: a build or parse failure is the FENCE's own when the runner prints it on its own verdict line, and a diagnostic quoted inside a failing assertion is not one. Every other ADR-016 clause, and the order of the arms, is unchanged.
**Served-path change:** `adr-verify --mutant` records `mutant killed` where a failing assertion quotes a nested Go build failure (today `inconclusive`), and `mutant inconclusive` where a Go package fails setup or Node's TAP reporter prints a parse error (today `killed`).

## Context

- **The defect (BACKLOG §253, open since 2026-09-24).** `adr-verify` grades a failing mutant fence
  `inconclusive` whenever any `BUILD_BROKE` pattern (`plugin/bin/adr-verify:304-314`) matches anywhere
  in `plain(out)` (the arm at `adr-verify:1824`). The arms run in this order: abnormal termination,
  scored nothing, `BUILD_BROKE`, `environment_failure`, and only then `killed` (`adr-verify:1810-1838`).
  So a fence whose test correctly ASSERTS that a nested build fails is graded "the fence failed on a
  build/parse error, not an assertion", and that kill can never be recorded.
- **Reported from go-recall-service** (ADR-015 T8, adr-verify 2.100.0, 2026-09-20). The first report named
  `TestLiveFilesCompile`; the reporter's own correction (filed 2026-09-26, raw output in go-recall-service
  `keep/t8-build-probe.out`) says the nested token came from three missing-URL guards in its `svc`
  suite, each spawning `go test -tags live` and quoting `FAIL go-recall-service/svc [build failed]` inside
  its own `--- FAIL:`. The shape is the same either way: a nested `go test` quoted inside a failing
  assertion. go-recall-service worked around it on 2026-09-26 by moving that runner out of the fence.
- **Reproduced here on 2026-09-22 (ADR-063 T2).** The mutant removing `ADR_FILE`'s date guard in
  `plugin/scripts/lifecycle.mjs` was graded `inconclusive`. **Which pattern matched is UNKNOWN.** The
  run's output is not in the task file; that fence runs `tests/record-identity.test.mjs` first and
  `scripts/selftest.sh` only if it passes (`|| { …; exit 1; }`), so "the full suite's output" in §253 is
  itself unverified; `rg` finds none of the `BUILD_BROKE` tokens in `tests/record-identity.test.mjs`; and
  the campaign entry for that line ("corpus: an ISO-dated file is not a decision record",
  `tests/mutations.json:1803`) kills it through `tests/lifecycle.test.mjs`, a different file. Reproducing
  it means applying the mutant, which this record's drafting did not do.
- **Measured 2026-10-06, go1.27.1 darwin/arm64, scratch module:**
  - **A**, the package under test does not build: `go test ./a/` prints `# ex/a [ex/a.test]`, the
    compiler line, `FAIL\tex/a [build failed]` at column 0, then `FAIL`; exit 1.
  - **B**, a checker test asserts a nested `go test ../live/...` succeeds, and live is broken:
    `--- FAIL: TestLiveFilesCompile (0.03s)` at column 0. The nested `# ex/live`, the compiler line and
    `FAIL\tex/live [build failed]` appear INDENTED 8 spaces under `checker_test.go:11:`. The top level
    then prints `FAIL\tex/checker\t0.261s`. Exit 1. Today this grades inconclusive, and it is a real kill.
  - **C**, `go test ./...` with live broken: B's indented block, PLUS `FAIL\tex/live [build failed]` at
    column 0, because live itself is in the build. Exit 1.
  - **D**, B's checker with the nested command's stdout and stderr set to the test's own
    (`c.Stdout, c.Stderr = os.Stdout, os.Stderr`): the nested `# ex/live`, the compiler line and
    `FAIL\tex/live [build failed]` print at COLUMN 0, before `--- FAIL: TestLiveFilesCompile`; then
    `FAIL\tex/checker\t0.226s`; exit 1. Same day, same module.
  - **`[setup failed]`**: an import cycle (`ex/a` imports `ex/b` imports `ex/a`) prints `# ex/a`, the
    cycle lines, `FAIL\tex/a [setup failed]` at column 0, `FAIL`; exit 1. A missing import
    (`import "ex/nosuch"`) prints `# ex/c`, `c/c.go:2:8: package ex/nosuch is not in std (…)`,
    `FAIL\tex/c [setup failed]`, `FAIL`; exit 1. Neither prints a `--- FAIL` line.
- **Measured 2026-10-06, node v24.11.1, `node --test` with `--test-reporter=spec` and `=tap`:**
  - A test asserting a child `node broken.js` exits 0, with the child's stderr captured into the
    assertion message: `SyntaxError: Unexpected token ';'` appears indented 2 spaces (spec) or 4 (tap).
    The same with `require("nope-zzz")`: `Error: Cannot find module 'nope-zzz'` indented 2 or 4.
  - The same test with the child's stdio inherited: the child's lines print at column 0 under spec, and
    as `# SyntaxError: …` under tap — indistinguishable from the test file's own failure.
  - A test file that does not parse: `SyntaxError: Unexpected token ';'` at column 0 under spec,
    `# SyntaxError: …` under tap. A test importing a module that does not parse (`lib.mjs`), under tap:
    `# SyntaxError: Unexpected token '=>'`, then `not ok 1 - uselib.test.mjs`, `# pass 0`, `# fail 1`.
  - A missing import at top level: ESM prints
    `Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'nope-zzz.mjs' imported from …` and CJS prints
    `Error: Cannot find module 'nope-zzz'`, at column 0 under spec and behind `# ` under tap.
- **Measured 2026-10-06, pytest 9.0.3 on Python 3.14:** a child's SyntaxError captured into the
  assertion message prints as `E         SyntaxError: '(' was never closed`; with the child's stderr
  inherited, pytest's `Captured stderr call` section prints `SyntaxError: '(' was never closed` at column
  0. A test module that does not parse prints `E   SyntaxError: invalid syntax`, exit 2.
- **Each captured output graded through `adr-verify`'s own classifiers**, imported read-only at `58874ba`
  and applied in the arm's order (`abnormal_termination`, `scored_nothing`, `BUILD_BROKE`,
  `environment_failure`):

  | Output | Grade today | Pattern that decided it | Right grade |
  |--------|-------------|-------------------------|-------------|
  | Go B (nested, captured) | inconclusive | `\[build failed\]` | killed |
  | Go C (top-level live too) | inconclusive | `\[build failed\]` | inconclusive |
  | Go D (nested, inherited) | inconclusive | `\[build failed\]` | killed, but indistinguishable from C |
  | Go `[setup failed]` | **killed** | none | inconclusive |
  | node nested missing module, captured (spec, tap) | inconclusive | `Cannot find module` | killed |
  | node top-level missing module (ESM, CJS; spec, tap) | inconclusive | `Cannot find module` | inconclusive |
  | node top-level parse error, spec | inconclusive | `^SyntaxError:` | inconclusive |
  | node top-level or imported parse error, tap | **killed** | none | inconclusive |
  | pytest nested SyntaxError, inherited | inconclusive | `^SyntaxError:` | killed, but indistinguishable |
  | pytest collection SyntaxError | **killed** | none | inconclusive |

  The three rows in bold are FALSE KILLS, the direction this list exists to prevent (its own comment,
  `adr-verify:298-303`). The Go and Node ones are reachable: `syntax_ok` (`adr-verify:587-632`) parses
  `.go` only with `gofmt -e`, which exits 0 on both the import-cycle file and the missing-import file
  (measured 2026-10-06, same scratch module), and has no parser at all for `.js` or `.mjs`
  (`SYNTAX_CHECK`, `adr-verify:567-571`). This repository's own fences use `--test-reporter=tap`. The
  pytest row is not reachable through a mutated `.py`, which `syntax_ok` parses with `ast` before any
  fence runs (`adr-verify:610-615`).
- **The class: every place that classifies fence output as a build failure.** Enumerated with
  `git ls-files plugin scripts | xargs rg -ln "build failed|BUILD_BROKE|Cannot find module|\^SyntaxError"`:
  3 files. `plugin/bin/adr-verify` is the only classifier, and `BUILD_BROKE` is read at one site
  (`:1824`). `plugin/skills/adr-execute/SKILL.md:216` and `plugin/templates/task-template.md:111` tell an
  author to fence on `^FAIL`, which this decision agrees with. `scripts/mutate.mjs` grades by named test
  file and is not in the class.
- **The premise that makes a kill credible (ADR-016, recorded by ADR-025).** The clean fence passed
  first, so a failure with the mutant applied is the mutant's. It stops holding where ADR-016 itself
  says it does (`ADR-016:107-109`: the baseline "is not flake detection"): a flaky test, and an
  environment that changed between the two runs — a network, a build cache, a tool removed. Neither is
  new here; any assertion failure carries the same risk today, and `environment_failure` still runs
  after `BUILD_BROKE`, so a nested build that failed for a machine reason is still caught by its
  signature, not credited.

## Existing Primitives Audit

- **`BUILD_BROKE`** (`plugin/bin/adr-verify:304-314`): reshaped — two rows change and one is added, none
  beside it as a second list.
- **`plain()`** (`adr-verify:324-326`): reused as is; every row is still matched against uncoloured output.
- **The grading arm** (`adr-verify:1810-1838`): unchanged, including its order.
- **The `mutantBuild` fixture** in `tests/evidence-chain.test.mjs:468-474` prints a bare `[build failed]`,
  which no measured Go output prints. Reshaped to case A's bytes by T1.

## Decision

Anchor the Go row to the line on which `go test` reports a package's OWN build failure, so a diagnostic
quoted inside a failing assertion no longer decides the grade, and close the two measured false kills:

| Row today | Row after | Task | Measured effect |
|-----------|-----------|------|-----------------|
| `\[build failed\]` | `^FAIL\s+\S+ \[build failed\]` | T1 | B killed; A, C, D inconclusive |
| none | `^FAIL\s+\S+ \[setup failed\]` | T2 | import cycle and missing import inconclusive (today killed) |
| `^SyntaxError:` | `^(?:# )?SyntaxError:` | T2 | tap top-level and imported parse errors inconclusive (today killed) |

C staying inconclusive is the safe direction: the mutated package itself did not build at top level.
D also stays inconclusive; it is a real kill that cannot be told from C by line shape, and a false
`inconclusive` costs a re-run where a false `killed` credits a proof nobody observed. The twin control
is case A: a mutant that breaks the mutated file's own build stays inconclusive.

**`Cannot find module` is measured and left unchanged.** It has the same defect for `node --test` — a
captured nested missing module, indented, grades `inconclusive` — but the unanchored token also stands
for runners this record did not measure. Jest is expected to print its missing module indented under
`● Test suite failed to run`, and tsc as `error TS2307: Cannot find module …` — both UNMEASURED here,
since neither is installed on the measuring machine. If either holds, an anchor fitted to `node --test`
would turn that runner's top-level failure into `killed`, the false-kill direction. So the row stays as
it is until those runners are measured.

Every other row is left exactly as it is and named as unmeasured: both PHP parse rows, `^IndentationError:`,
`error: could not compile`, `^error\[E\d+\]`, and `^\s*Fatal error: Uncaught Error` (CLAUDE.md §16: a
classifier row nobody ran is not changed). pytest needs no change: a captured nested SyntaxError is
already prefixed `E` and not matched, and an inherited one stays inconclusive, the safe direction.

**This fails if**, through `adr-verify --mutant`, Go case A, C, D or `[setup failed]`, or a
tap-prefixed parse error grades `killed`; or Go case B grades `inconclusive`. The measured bytes above
are that data and exist today. The rows are valid for go1.27.1 and node v24.11.1 on darwin/arm64; the
tests feed those bytes, so the grade is platform-independent, and whether another version or Windows
prints the same bytes is unmeasured.

## Alternatives Considered

- **(a) A failure marker anywhere (`--- FAIL`, `not ok`) means killed.** Rejected: fail-open. Case C
  carries `--- FAIL` and a top-level build failure of the package under test.
- **(b) Tie `--- FAIL` to a package that built, using Go's package name on both lines.** Rejected on
  measurement: case D prints the same line shapes as case C — a column-0 `FAIL\tex/live [build failed]`
  and a timed `FAIL\tex/checker` — so a reader of package names cannot credit D without crediting C.
- **(c) A per-runner structured output, such as `go test -json`.** Rejected for this record: grading
  reads the output of the fence the author wrote, and `adr-verify` never rewrites the command.
- **(d) Grade inconclusive only when no `--- FAIL:` precedes the token** (the reporter's second
  suggestion). Rejected: in case C a `--- FAIL:` precedes the top-level line, so C would be credited.
- **(e) Keep the rows and ask authors to move a nested build check out of the fence**, as go-recall-service
  did. Rejected: a build-check assertion is a legitimate test, and the grader should not shape it.

## Component / Boundary Impact

None — internal to `plugin/bin/adr-verify`'s `BUILD_BROKE` list.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `## Mutation Log` verdict for the measured output shapes | `killed` and `inconclusive` swap as in the Decision table | T1, T2 | `adr-lint`'s `done` gate, adopters reading their logs |

## Inter-task Contracts

None — T2 edits the same list after T1, and depends on it only to keep the two edits from conflicting.

## Implementation

See `docs/adr/ADR-085-a-build-diagnostic-in-an-assertion-is-a-kill/tasks/README.md`.

## Consequences

- **Positive:** a Go build-check assertion can bind a killed row; two measured false kills close.
- **Negative:** this is the price of the anchor. The unanchored row caught `[build failed]` in EVERY
  shape; the anchored row catches only a line that starts `FAIL`. Any top-level build failure printed
  behind a prefix or an indent — a wrapper that prefixes each line (`docker compose`'s `svc-1  | `),
  a formatter such as gotestsum, a script that indents its runner's output — now grades `killed` where
  it graded `inconclusive`. None of those shapes was measured; each is a false kill until one is.
- **Neutral:** rows already written stay as written; a re-run on a clean tree writes the new grade.

## Out of Scope

- `go test -json` or any per-runner structured output (permanent: boundary: grading reads the author's fence output and never rewrites the command)
- The PHP, IndentationError, cargo, rustc and PHP Fatal error rows (permanent: boundary: unmeasured, and CLAUDE.md §16 changes no classifier row nobody ran)
- pytest's collection-error `E   SyntaxError` (permanent: boundary: unreachable through a mutated .py, which syntax_ok parses before the fence runs; a non-.py mutant that breaks collection is unmeasured)
- Case D, a nested build with inherited stdio (permanent: boundary: measured indistinguishable from case C, so it stays inconclusive, the safe direction)
- A nested missing module under `node --test` (permanent: boundary: measured, but the unanchored token also covers Jest and tsc output this record did not measure, and anchoring it could turn their top-level failures into false kills)
- Rewriting Mutation Log rows recorded under the old rows, ADR-063 T2's included (permanent: boundary: a log is never edited, CLAUDE.md §4; re-run instead)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A fence whose runner's own build-failure line is prefixed or indented — a wrapper, a formatter, another Go version — now grades `killed` (false kill) | Med | High | not mitigated by this record: it is the price of the anchor (Consequences); the tests pin the measured shapes, and an adopter's report of a new shape is a new measured row |
| The `# ` prefix matches a test's own TAP diagnostic that quotes a SyntaxError | Low | Low | that grades inconclusive, the safe direction |
| A flaky nested build now credits a kill | Low | Med | same as any flaky assertion today (ADR-016:107-109); `environment_failure` still runs before a kill is credited |

## Rollback

Restore the two changed rows of `BUILD_BROKE`, remove the added one, and drop T1's and T2's tests and campaign entries. Rows already
written stay in their logs as history.

## Follow-ups

- [ ] Re-run ADR-063 T2's date-guard mutant after T1 lands; whether it is in this class is UNKNOWN today.
- [ ] Tell go-recall-service through its wing's inbox when T1 ships, so ADR-015 T8 can bind its kill.
- [x] The Codex review of 3ff59fb (2026-10-06) found the column-0 anchor fails open on a prefixed line: `svc-1  | FAIL	ex/a [build failed]` graded killed. Both Go rows now treat any line that does not start with whitespace as the run's own, and only an indented line as nested. Test `a Go build failure behind a log prefix stays inconclusive`; mutant `Codex 3ff59fb: a log prefix hides Go's build-failed line`, RED. The task rows' digests are unchanged. The three Go mutants were repointed and are RED.
