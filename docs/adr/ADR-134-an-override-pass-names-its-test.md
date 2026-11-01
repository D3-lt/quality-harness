# ADR-134: An override pass names its test

**Status:** Accepted
**Accepted:** 2026-11-01 by Zy: "Both" (answer to: release the three locked assertions and fix spec-verify, then cut the release)
**Date:** 2026-11-01
**Owner:** Zy
**Spec:** None — a bug fix the owner approved in conversation; BACKLOG §404 records the class
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-123-the-product-layer.md, docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md, docs/adr/ADR-091-the-catalogue-is-a-file-per-source.md, docs/research/2026-10-30-lifecycle-determinism-audit.md
**Governs:** plugin/bin/spec-verify
**Enforced-by:** tests/spec-verify-ran.test.mjs::a Cmd override that exits 0 without naming the bound test is UNRUN and not a pass
**Invalidates:** none — checked; ADR-075 T2 and ADR-091 T3 keep their done state and are relocked with --replace-hashes, which appends a lock snapshot and rewrites no log
**Served-path change:** `spec-verify --implemented` reports a fact or scenario whose Cmd override exits 0 without printing the bound test's name as UNRUN (exit 4) instead of PASS.

## Context

`spec-verify --implemented` grades a bound test it runs itself by the runner's own report where that runner is measured
(go, cargo, swift, vitest, phpunit). A binding with a `Cmd` override is graded by the override's exit code alone
(`plugin/bin/spec-verify` `test_runs`, the `override_cmd` branch). Reproduced 2026-10-31 through the public CLI on a
copy of `tests/fixtures/ok`: row F-1 bound to `test_selftest_fixture.py::test_gates_run` with Cmd `printf audit-marker`
printed `[PASS]` and exited 0. No test ran. The audit in docs/research/2026-10-30-lifecycle-determinism-audit.md names
this as the execution-evidence gap of the first slice.

BACKLOG §404 (2026-10-22) filed the class: `runs_nothing` recognises only the no-op spellings it was shown, so `test -f
spec.md`, `echo ok` or a script that does nothing still pass. It left the structural answer, ADR-123 Decision 2 (a pass
needs the runner's evidence that the bound test ran), to the owner, because it turns a silent override UNRUN. The owner
decided on 2026-11-01.

Four assertions in locked tests encode the old contract, each locked by ADR-075 T2 and ADR-091 T3
(`python3 scripts/test-locks.py tests/gate-rules.test.mjs`, 2026-10-31): `tests/gate-rules.test.mjs` line 897 (`python3 -c
"raise SystemExit(0)"` must exit 0), line 915 (an override that prints a word must exit 0), line 998 (scenario
`cmd:\`test -f spec-selftest.md\`` must not be UNRUN) and line 2019, a direct `test_runs` call whose override
`sh -c 'exit 0'` must pass. The first three were found by searching spec rows; the fourth only by the full gate on
2026-11-01, and `git grep -n "test_runs(" -- tests` then found no other direct caller. `tests/spec-verify-ran.test.mjs`
asserts the same at its line 93 and has no lock.

## Existing Primitives Audit

Reuse `split_binding` for the bound name, the existing `unrun` verdict and exit 4, and the could-not-look wording of
ADR-005. `runs_nothing` stays: it answers before anything runs, and a no-op override that prints the name is still not run.
`adr-verify --relock --replace-hashes` (ADR-052) is the sanctioned way to move a locked body; no new mechanism is added.

Class: every verdict in spec-verify that credits exit 0 as a pass. Enumerated 2026-11-01 with
`mrw read --grep '"pass" if r.returncode == 0' plugin/bin/spec-verify`: two sites, the override branch (fixed here) and the
stack runner's return, which already requires runner evidence for go, cargo and swift and reads the measured no-match
output of vitest and phpunit. pytest, pest and molecule still pass on exit 0 there; they are left (see Out of Scope).

## Decision

1. An override that exits non-zero stays `fail`. An override that exits 0 is `pass` only when its combined output contains
   the bound test's name (the part after `::`, or the whole binding when there is none). Otherwise it is `unrun`, and the
   reason names the name it looked for and the fix: make the command print the runner's report line for that test.
2. The check is a substring test on the name. It cannot tell a runner's report from `echo <name>`, and a short name such as
   `ok` matches incidental text. It removes the silent and unrelated-output false passes, not a deliberate imitation.
3. The locked assertions change in place: each override prints the bound name, so it keeps proving what it proved (a
   green and a red override, a backticked override not running its output, a scenario override adjudicated). ADR-075 T2 and
   ADR-091 T3 are then relocked with `--replace-hashes`, recorded in their own logs.

## Alternatives Considered

- **Per-runner pass patterns over override output:** rejected; an override can wrap any runner, and a pattern list typed for
  shapes nobody measured is the §16 classifier problem again.
- **Keep exit-only and document it:** rejected by the owner on 2026-11-01; a gate must not report a pass it did not observe.
- **Add a new test beside the locked ones:** impossible here; the locked bodies themselves assert the false pass.

## Component / Boundary Impact

Inside the gates component of docs/architecture.md, one function in `plugin/bin/spec-verify`. No new module, boundary,
ledger or hook.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `spec-verify --implemented` verdict | Silent or unrelated override exit 0 becomes UNRUN, exit 4 | `plugin/bin/spec-verify` | Users, `facts-gate-dispatch.sh` only runs `--draft` and is unaffected |
| `plugin/templates/spec-template.md` | The Cmd guidance says the override must print the bound test's name | template | spec authors |

## Inter-task Contracts

None — a single task.

## Implementation

See ADR-134-an-override-pass-names-its-test/tasks/README.md.

T1 was implemented on 2026-11-01. Its log holds the first red (an override printing `audit-marker` exited 0 where 4 was
expected), the passing fence and a killed mutant that removes the name check. The relock of T1 replaced the hash of the
exit-only twin it edits; ADR-075 T2 and ADR-091 T3 were relocked with `--replace-hashes` for the two gate-rules tests.

The change exposed a false pass in `tests/spec-retired.test.mjs` (locked by ADR-120 T3): its override `node --test
tests/ok.test.mjs` inherited `NODE_TEST_CONTEXT` from the running suite, and Node then skips its files ("run() is being
called recursively … skipping running files", node v24.22.1, measured 2026-11-01), so no test ran and exit 0 was credited.
The helper that spawns the gate now drops that variable, as `scripts/unasserted.mjs` already does; no locked body moved.

The Codex review of 558e552e (high effort, recorded) found that the name check masked three catalogue mutants on the
no-op guard: an override that runs and prints nothing is now UNRUN too, so the no-op loop's generic `UNRUN` match no longer
noticed the guard removed. Reproduced (three GREEN), then fixed by asserting the specific `runs no test` refusal; all 47
`spec-verify` catalogue mutants were then RED (four reused from runs on byte-identical subjects).

## Consequences

A spec whose override is `make test-x` with no output now reports UNRUN until the command prints the test's result. That
is the intended cost. A corpus that relied on silent overrides sees exit 4 where it saw 0.

## Out of Scope

- pytest, pest and molecule stack runs still pass on exit 0 (deferred: docs/BACKLOG.md §404).
- Telling a runner's report from an imitation of it (permanent: boundary: the name check is the evidence a runner-agnostic override can give).
- adr-verify Acceptance fences graded by exit code (permanent: boundary: a fence is the task's own declared command, ADR-005 governs it).

## Risks

Adopters with silent overrides get exit 4 after upgrading; the UNRUN reason names the fix. A short bound name can match
incidental output and pass; Decision 2 states that limit.

## Rollback

Revert the override branch and the template line together, restore the three assertions, and relock ADR-075 T2 and
ADR-091 T3 again with `--replace-hashes`. No stored state changes.

## Follow-ups

- [x] Execute T1 with its first red, passing fence, relocks and killed mutant.
- [ ] Release it with an outside run (CLAUDE.md §18), since spec-verify is a reader.
