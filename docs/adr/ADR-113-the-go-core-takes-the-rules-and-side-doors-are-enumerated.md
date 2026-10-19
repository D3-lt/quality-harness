# ADR-113: The Go core takes the hooks' rules, and the gaps between paths are enumerated

**Status:** Accepted
**Date:** 2026-10-19
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-19, after a read-only analysis of a downloaded agent-native backend platform: "create an ideas insource plan, what we can borrow, adapt to our needs and validate here. preferably go core", then the choices "Unfreeze: Go is the home", "One ADR, phased", "Include as an ADR" (MCP state), and the plan's approval
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-111-the-turn-end-judges-against-a-baseline.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; each adds tests that run on the Node path and, under `QUALITY_HARNESS_HOOK_IMPL=go`, on the Go core.
**Invalidates:** ADR-111 — Decision 6 (the Go core frozen at its parity until ADR-112's verdict) is lifted: new hook rules land in the Go core, and the Node path is kept in parity until ADR-110 T3's cutover
**Served-path change:** a broken `.quality-harness.json` no longer switches the publish refusal and the turn-end findings off in silence, a read-only reviewer can no longer write through mrw's MCP tool, and the Go core says everything the Node hooks say.

## Context

A read-only analysis of a downloaded agent-native backend platform (2026-10-19; nothing from it executed) found that its guarantees held only on the governed path it advertised: its automated repairs and several routes changed tenant schemas outside the kernel, its "mutation-checked" notes had no runner behind them, and a setting it could not read defaulted to its most permissive level. It also does three things this repository does not: it accounts for every test suite in exactly one category, fails a suite that ran nothing, and turns an environment skip into a failure where the environment is required.

Mapping the same class here, the same day, found:

- **Two fail-opens in sanctioned refusals**, confirmed in source. A `.quality-harness.json` that cannot be read reads as "no declared check" (`plugin/scripts/check-command.mjs:108-116`), and where nothing can be inferred `publishJudgement` returns null (`plugin/scripts/publish-verdict.mjs:209`), so ADR-061's refusal and the turn-end findings go quiet without a word; only `qh-check` refuses on a broken file. And the hook matchers and `MUTATION_TOOLS` (`plugin/scripts/hook-record.mjs:14`) name Edit, Write, MultiEdit and NotebookEdit only, so a write through mrw's MCP tool skips ADR-060's read-only reviewer guard and the write record.
- **Eight side doors** around qh-check, the publish refusal and adr-verify, and no sweep that enumerates them (`tests/evidence-flip.test.mjs` lists readers of the session log, not writers).
- **A `--human` sign-off bound to nothing** (`plugin/bin/adr-verify` writes no digest; adr-lint looks for the substring), so a sign-off covers every later edit; and `strictFrom` accepts any digits.
- **No suite accounting**: test files are collected by a glob, a file that ran zero tests passes, and two skips carry no reason.
- **ADR-111 T4's claim was wrong**: the Go core lacks five ADR-111 rules and only two are named in `tests/hook-golden.mjs`.

## Existing Primitives Audit

- **The Go core** (`core/`, ADR-110 T1) and its harness (`tests/hook-golden.mjs` `runHook` with `impl`, `GO_LACKS`, `GO_GOLDENS`, `staleLacks`, `staleGoGoldens`; `tests/qh-core-parity.test.mjs`): reused; T1 empties the lists.
- **`projectConfigProblem`** (`plugin/scripts/project-config.mjs`), which `qh-check` already refuses on: reused by T2 for the publish verdict and the turn end.
- **`scripts/untimed-spawns.mjs`**'s walk of every spawn: reused by T3's sweep.
- **`scripts/run-tests.mjs` and `scripts/file-timing-reporter.mjs`**, which already count tests per file: reused by T5.
- **The acceptance digest** adr-verify already writes on exit-0 rows: reused by T4 for sign-offs.

## Decision

1. **The Go core is the home of the hooks' rules (T1).** ADR-111's five rules are ported to `core/` and the Node path kept in parity until ADR-110 T3's cutover, which stays gated on T2's measured numbers. `GO_LACKS` and `GO_GOLDENS` end empty.
2. **A configuration that cannot be read is said, never read as "no check" (T2),** in the publish verdict and the turn end, on both paths; and **mrw's MCP write is a write** to every hook that watches writes, including the read-only reviewer guard.
3. **Side doors are enumerated as a class by a gate (T3):** every writer of a check ledger or a task log, every spawn of `git commit` or `git push`, and every tool that can write a file against the hook matchers, each allow-listed with its reason; the fast pass binds the command as well as the tree.
4. **A sign-off is bound to what was signed (T4):** the acceptance digest at the time, read as stale after a change, as an exit-0 row is; `strictFrom` takes an ADR id or a number only.
5. **Every test file is accounted for (T5):** reached by a runner, running at least one test unless named exempt, every skip with a reason, an environment skip failing where CI says the environment is required, and release evidence comparing the run's jobs with the workflow's.
6. **Session state as MCP resources is proposed, not built (T6):** ADR-114, Proposed.

**This fails if** a broken `.quality-harness.json` beside a declared check lets an unchecked `git commit` through PreToolUse in silence on either path; a read-only reviewer's `mcp__mrw__mrw_write` is allowed; a new writer of a check ledger or task log lands without the sweep failing; a sign-off taken on one acceptance digest still counts after the fence changes; or `GO_LACKS` or `GO_GOLDENS` is non-empty when T1 is signed off. Data that could produce each failure is built by each task's tests.

## Alternatives Considered

- **Keep the Go core frozen (ADR-111 Decision 6).** Rejected by the owner, 2026-10-19: the core is where the hooks are going, and porting later doubles the work.
- **Sign the check ledger cryptographically.** Rejected: a local gate cannot hold a key the agent cannot read; the forged-row door is named as a boundary instead (ADR-005).
- **Serve state through MCP now.** Deferred to ADR-114: resources are pulled, so they replace no pushed text until measured.

## Component / Boundary Impact

`core/hooks/` gains the ADR-111 rules and the T2 fixes; `plugin/scripts/` keeps parity; `scripts/` gains the side-door sweep and suite accounting; `plugin/bin/adr-verify`, `adr-lint`, `adr-next` change the sign-off row. This repository has no architecture document.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `plugin/hooks/hooks.json` matchers | add `mcp__mrw__mrw_write` | T2 | the host |
| `--human` Verification Log row | gains `acceptance-sha256:` | T4 | adr-lint, adr-next |
| `qh check-command <dir>` | new Go subcommand | T1 | `tests/qh-core-parity.test.mjs` |
| `QUALITY_HARNESS_REQUIRE` | new environment variable for CI | T5 | the skips it names |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the config-problem origin | T2 | T1 | No — T1 ports it to Go with the rest |
| `mcp__mrw__mrw_write` as a write | T2 | T3 | No — T3 lists it as caught |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** both sanctioned refusals hold where they were silently off; the Go core can take the hooks; every side door is named by a gate.
- **Negative:** a sign-off row grows a digest. (Corrected at T4, 2026-10-19: this said old sign-offs read as unbound, as advice. As built, a digest-less sign-off is legacy, as a digest-less exit row is: one the committed file already holds still counts, and a new one is refused.)
- **Neutral:** the Node path stays until ADR-110 T3.

## Out of Scope

- ADR-110 T3's cutover (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)
- Signing the check ledger (permanent: boundary: a local gate cannot keep a key from the agent it checks)
- The analysed platform's runtime ideas, a governed database kernel and an autonomy loop (permanent: boundary: this plugin owns no runtime)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The config-problem origin refuses a commit a project meant to allow | Med | Med | it is said with the parse error; `"publish": "warn"` still turns the refusal into a warning |
| Matching mrw's MCP tool adds a hook run per mrw write | High | Low | measured with §19's byte and time counts |
| The side-door sweep reports a false door | Med | Low | allow-listed with a reason, never silenced |

## Rollback

Revert the tasks' commits; the Node path and the Go core are each whole at every task's commit.

## Follow-ups

- [x] Owner decision: Accepted with the approved plan, 2026-10-19.
