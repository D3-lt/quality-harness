# ADR-015: A Go fence can reach its required success

**Status:** Accepted
**Date:** 2026-08-31
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-009-a-decision-names-what-enforces-it.md, docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md, docs/BACKLOG.md §78
**Governs:** `plugin/bin/adr-lint`, `tests/gates.test.mjs`, `tests/mutations.json`
**Enforced-by:** `lint: a Go fence selects the test whose PASS line it requires`, `lint: no test files is a healthy Go status, not an exclusion`
**Invalidates:** none — checked. ADR-003 requires behavioral mutations and this adds two; ADR-005 forbids claims about commands the gate did not observe and this check accepts only one explicit root-level command/output shape; ADR-009 makes the two mutation labels above the durable enforcement pointers; ADR-011's git-backed candidate set and explicit could-not-look state are reused unchanged. No accepted decision is narrowed or removed.
**Served-path change:** `adr-lint` advises when a recognized literal Go Acceptance fence requires a `PASS:` marker but no tracked direct definition lies under its selected package scopes, or when a load-bearing grep rejects Go's healthy `[no test files]` status, before an author spends evidence runs repairing the fence.

## Context

Measured 2026-08-31 while a Go consumer executed ADR-008 T2. Its Acceptance fence ran
`go test` over `./internal/billing/...` and `./internal/document/...`, then required
`PASS: TestNoPaymentStatusIsEverStored`. The named test lived under `./internal/web`, so no state of
the implementation could make that fence print the line it required. Adding the missing package
scope exposed a second impossible condition: the fence rejected `no test files`, while the healthy
embed-only package `internal/web/assets` correctly emitted `[no test files]`.

Both failures were authoring defects, not implementation failures. They cost two fence rewrites.
Because changing an Acceptance fence invalidates its digest-bound evidence, four mutants had to be
run twice. `adr-lint` already checks the mirror property — whether a test can go red and whether a
named test is selected by a filter — but it does not ask whether the fence's own success conditions
are reachable.

The adjacent class is already recorded in docs/BACKLOG.md §78: a negated grep can be inert under
`set -e`, so a fence linter must distinguish shell shapes rather than bless a token. This record is
narrower and independently evidenced. It addresses literal Go commands where the package/result
relationship is statically visible; it does not attempt to parse arbitrary shell.

## Existing Primitives Audit

- `check_task()` already returns each task path and its normalized Acceptance fence. **Reused** as
  the input; the task file is not parsed a second way.
- `tracked_paths()` already asks git for tracked files plus untracked, non-ignored additions and
  carries an explicit could-not-look state. **Reused** so the answer does not depend on build output
  that happens to exist on one machine.
- `check_tests_can_fail()`, `selected_by_filter()` and `check_named_tests_are_run()` already reason
  about whether a task's declared tests can fail and whether its filter reaches them. **Extended as
  one class**, not replaced.
- `Findings.advise()` is the established non-blocking channel for a condition an author should fix.
  **Reused**; these findings never enter the blocking list.
- `tests/gates.test.mjs` already drives the working-tree `adr-lint` CLI against copied corpora.
  **Reused at the outermost callable boundary**, with a Go-shaped temporary git repository matching
  the report.
- `tests/mutations.json` plus `scripts/mutate.mjs` already show that an advisory is behavior rather
  than dead prose. **Reused** with one behavioral mutant per finding.

## Audit of the class

**Class:** static `adr-lint` checks whose conclusion depends on the relationship between an
Acceptance fence's test selector and the success evidence it requires.

Enumerated 2026-08-31 from the working tree:

```bash
rg -n '^def (check_tests_can_fail|selected_by_filter|check_named_tests_are_run)\b' plugin/bin/adr-lint
```

The command returned three members: `check_tests_can_fail` at line 2336,
`selected_by_filter` at line 2394, and `check_named_tests_are_run` at line 2453. The first asks
whether a test can go red; the latter two ask whether the declared filter selects the named test.
None correlates a required `PASS:` line with the packages the fence actually runs, and none
distinguishes `no tests to run` from Go's healthy `[no test files]` package status.

This repository has no live Go Acceptance fence to use as the regression corpus. The bounded scan
below returned no paths (exit 1), so T1 must construct the reported shape explicitly rather than
claiming this repository happened to exercise it:

```bash
rg --files-with-matches --multiline --pcre2 '(?s)## Acceptance\s+```bash(?:(?!```).)*\bgo test\b' docs/adr
```

**Members deliberately left out:** Tests-table existence, BDD-name parsing, and runtime mutation
classification. They do not reason from a fence's Go package selection to its required success
output, and each already has a separate contract.

## Decision

`adr-lint` adds one advisory pass over runnable task Acceptance fences. It analyzes only one shell
shape whose working directory, output source and exit-status effect are visible without execution:

1. From the repository root, exactly one literal `go test` command includes literal `-v`, names
   repository-relative package arguments (`.`, `./path`, or `./path/...`), and writes its combined
   output through `2>&1 | tee <literal-file-sink>`. An optional leading `set -o pipefail` is
   accepted. Selection/output-changing modes and unrecognized flags receive no verdict.
2. A later literal positive `grep -q`, `grep -qF`, or `grep -qE` reads that same literal sink and
   requires the exact, case-sensitive Go substring `PASS: TestName`. A negated grep for exact plain
   `no test files`, fixed-string `[no test files]`, or regex `\[no test files\]` is considered only
   when it reads the same sink. An unescaped bracket expression in regex mode, or text that merely
   contains or case-folds either phrase, receives no verdict.
3. The `go test` pipeline and every considered grep are commands in one top-level `&&` chain, so a
   grep failure is load-bearing. A fence containing `cd`, another `go test`, `||`, a subshell,
   command substitution, shell-expanded package/sink/pattern tokens, an unrelated grep sink, a
   syntactic directory sink, or an unrecognized redirection or command flow receives no Go-fence
   verdict.
4. Git-tracked or untracked, non-ignored `*_test.go` files provide direct top-level definitions of
   `func TestName(` after a Go-aware lexical scan removes strings and comments without confusing
   delimiters inside strings. A `...` package argument covers its directory descendants; an exact
   package argument covers that directory only. Paths are normalized before structural comparison,
   with the platform injected so case follows Windows/macOS versus Linux filesystem semantics.

For each required marker, the gate advises when no tracked direct definition of that test lies
under a selected literal package scope. When the test exists elsewhere, the finding names its path
and the literal package arguments, so the remedy is visible. When no direct definition exists
anywhere, the finding says exactly that source inspection found none under the selected scopes; it
does not say the command can never produce the marker or claim that a generator, build tag, wrapper,
or runtime could never create one.

Separately, a load-bearing negated grep in the recognized output chain that rejects `no test files`
or `[no test files]` draws advice. Go prints that status for a healthy selected package containing no
test files; rejecting it can keep a multi-package fence red after the required test has passed. The
remedy is a positive, exactly anchored `PASS:` assertion for the required test, or a package-specific
condition that does not reject unrelated healthy packages. The same scopes and embed-only package
without that exclusion are a required no-finding control. `no tests to run` remains distinct: it
describes a filter that selected no tests and is still a valid vacuity guard.

Both findings are advisory. The pass executes no project command, does not import Go tooling, and
makes no finding outside the accepted root-level command/output chain. Changed working directories,
unrelated sinks, inert `! grep ... || true` guards, package expansion, and ambiguous expressions are
explicit no-finding controls. An under-claim is preferable to a verdict borrowed from syntax the
gate did not resolve. If git cannot provide the candidate file set, ADR-011's existing
could-not-look advice is the only conclusion; this pass adds no absence claim.

## Alternatives Considered

- **Execute every Acceptance fence during lint.** Rejected because lint is an authoring read, while
  fences may mutate files, start containers, contact services, or take minutes. `adr-verify` owns
  execution and evidence writing; duplicating it would change the gate's trust boundary.
- **Parse arbitrary shell into a complete command/output graph.** Rejected because aliases,
  variables, `cd`, command substitution, generated scripts and redirections make a partial parser
  look authoritative while being wrong. The selected literal subset covers the measured case and
  has an explicit no-verdict boundary.
- **Search for the test name anywhere in the repository.** Rejected because that reproduces the
  reported defect: the test existed, but outside every package the command ran. Existence and
  reachability are different claims.
- **Wait for `adr-verify` to record the non-zero result.** Rejected because it finds the problem only
  after implementation work, then invalidates every prior entry when the fence is repaired. The
  package/result relationship is visible at authoring time and belongs in authoring advice.

## Component / Boundary Impact

None — internal to `adr-lint` and its repository-owned behavioral tests. No component moves, no new
process is spawned, and no persistent state is introduced.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-lint` advisory output | names a required Go `PASS:` test outside the literal package scopes selected by the fence | new Go-fence check called from `main()` | ADR authors, CI, `/quality-harness:adr-write` |
| `adr-lint` advisory output | distinguishes healthy `[no test files]` from vacuous `no tests to run` | same check | ADR authors, CI, `/quality-harness:adr-write` |
| mutation catalogue | two labels become the durable falsification points for the two findings | T1 | `scripts/mutate.mjs`, `Enforced-by:` resolution |

## Inter-task Contracts

None — one task.

## Implementation

One task, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** the two measured fence rewrites become author-time findings with the unreachable
  test and healthy package status named.
- **Positive:** the regression enters through the real CLI, so wiring the helper to nothing cannot
  satisfy the task.
- **Negative:** literal shell parsing adds a deliberately incomplete heuristic to `adr-lint`.
  Dynamic fences remain unjudged rather than being forced through a guess.
- **Negative:** direct source definitions do not model build tags, generated tests or custom test
  wrappers. This can suppress advice, but cannot create an accusation that a selected direct test is
  outside the selected scope.
- **Neutral:** conforming Go fences and all non-Go fences produce exactly the same exit code and
  findings as before.

## Out of Scope

- An arbitrary-shell AST or runtime data-flow analysis for dynamic package and output expressions. (permanent: executing or fully interpreting shell is a different trust boundary; `adr-verify` remains the authority there.)
- Equivalent reachability rules for PHPUnit, pytest, Vitest, Cargo and other runners. (deferred: docs/BACKLOG.md §118 — repointed 2026-09-04 from §78, which was CLOSED and about a different defect; §118 records why and receipts this record.)
- Automatically rewriting a consumer's Acceptance fence. (permanent: gates advise and never mutate a user's records.)
- Proving that Go build tags, generators, wrappers or subtest names make a direct source definition runnable. (permanent: this pass proves only the literal package/source relationship it can observe.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Shell syntax is classified as literal when it is actually dynamic | Med | High | accept only the single root-level `go test` → literal `tee` sink → load-bearing `&&` grep chain; CLI controls cover changed cwd, unrelated sinks, inert guards, variables, wrappers and non-Go fences |
| Package containment differs on Windows | Med | High | normalize both separators before comparison and derive repository-relative paths rather than comparing separator literals |
| Multiple `go test` commands or output files are paired incorrectly | Med | Med | decline the whole fence when another Go command, sink, or unrecognized output flow appears |
| A generated or build-tagged test is not represented by the direct source scan | Med | Low | wording says what source inspection found; generated/dynamic forms are explicitly outside the verdict |
| The new helper is correct but never called | Med | High | the CLI-level test must fail when the `main()` call is removed, and each finding carries a behavioral catalogue mutation |
| This record's `Enforced-by:` labels do not exist while Proposed | High | Low | deliberate authoring state; T1 creates both exact labels, and `adr-lint` advice remains visible until then |

## Rollback

Revert T1. The findings are advisory, execute nothing and write no state; no persisted record or
external caller depends on them.

## Follow-ups

None — the broader multi-runner fence-linter work already has a receipt in docs/BACKLOG.md §78.
