# ADR-111: The turn end judges the work against a baseline taken at session start

**Status:** Proposed
**Date:** 2026-10-18
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-18, after ADR-106's verdict: "so, the plugin in essence does not help … the specific which must have been the core does not trigger and not work", then, on the recommendation to prove one rule changes outcomes before porting more to Go, "go all"
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-077-a-heavy-run-holds-a-lease-and-names-its-neighbours.md, docs/adr/ADR-080-no-hook-waits-on-the-artifact-pass.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-106-a-paired-benchmark-says-what-the-plugin-buys.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; each task adds catalogue mutants on the rule it changes.
**Invalidates:** ADR-110 — T2 and T3 wait until ADR-112's verdict on this record, and new turn-end rules are written in the Node path only until then (Decision 5)
**Served-path change:** at the end of a turn that changed code, the agent is told whether the project's check was already red on the tree the session began with, and when it was green there and is red now, that the change broke it; where no check is known, it is told so instead of nothing.

## Context

ADR-106's main run, scored 2026-10-18 from Stage 5 block 1 (40 SWE-bench Verified instances per model, k = 1), read
GUARD NOT MET on Sonnet 5.5 and Opus 5.5. The plugin showed no drop in false completions, said `not done` on resolved runs
about twice as often, broke passing tests as often as the plain arm (oracle `broke_tests`: Opus 3 against 2, Sonnet 6
against 6), and cost 49–70% more per attempt. The bench peer then read the 54 P transcripts attempt by attempt, and this
repository reproduced each cause with scripted sessions through the hooks at v3.8.40 and at HEAD (BACKLOG §383):

- **No `qh-check` passed in any P attempt.** The checkouts carry no test dependencies, so the check was red or never ran.
  A red check then meant "this machine", and neither the agent nor the hook could tell it from "your change": 7 of Opus's
  9 red instances were resolved. `check-command.mjs:354-359` already tells the agent, in words, that a check red on an
  unmodified tree is about the machine; nothing ever runs the check on the unmodified tree to find out.
- **Three of Opus P's six false completions ended with no Stop finding.** Two had no check the plugin could infer
  (`[tool:pytest]` in `setup.cfg`; a `bin/test` script with no manifest), and `completion-rules.mjs:694` returns before
  every rule when no check is known. The third was the mention dedupe fixed in 3.8.44.
- **After a red check, R1 says "no qh-check has passed on" the work**, the same words as no check at all, and the
  continue-once Stop is silent (ADR-096). Two Opus P attempts claimed done after a red or unstarted check.
- **0 Skill calls in 54 attempts**: block 1 measured the hooks alone. ADR-112 measures the lifecycle.

The plugin's core promise is that a turn does not end with an unverified claim. Block 1 shows its turn end cannot tell a
regression from an environment, and is silent where it knows no check. Porting the same decisions to Go (ADR-110) makes
them faster and leaves both gaps; the owner chose to prove one rule changes outcomes first.

## Existing Primitives Audit

- **`qh-check` and `checks.jsonl`** (ADR-031, ADR-101): run the declared or inferred check, record `check.passed` /
  `check.failed` against the tree it ran on. Reused: the baseline is a `qh-check` run on the starting tree, recorded with
  a marker, not a second runner.
- **The session baseline** (`sessionBaseline`, `session.started` with its `observation`): the tree the session began with
  is already recorded. Reused as the baseline's subject.
- **Detached work under a deadline and the machine lease** (ADR-080's artifact pass, ADR-065's refresh, `lease.mjs`,
  ADR-110's amended Decision 4): reused for the baseline run, so no hook waits on it.
- **`checkCommandOrigin`** (`check-command.mjs`): the inference rungs. Extended, not replaced.
- **R1's text** (`uncheckedWorkReason`): reshaped for the two baseline verdicts and the red-check case.
- **`completionJudgement`'s no-check return** (`completion-rules.mjs:694`): replaced by one could-not-look line.

## Decision

1. **The baseline (T3).** When a check is declared or inferred, SessionStart (`startup` only) starts `qh-check --baseline`
   detached, under the machine lease and the project's fence deadline, on the tree the session began with. It records
   `check.passed` or `check.failed` with `baseline: true` against that tree, holding no git lock. A turn end that finds
   no baseline record yet says nothing new; it never waits for one.
2. **The turn end reads it (T3).** With a baseline record for the session's starting tree and a check run on the current
   tree:
   - baseline passed, current failed: "the check passed on the tree this session began with and fails now: this change
     broke it";
   - baseline failed, current failed: "the check was already red on the tree this session began with, so this red says
     nothing about the change; compare what fails, or declare a check that is green here";
   - otherwise R1 as today. The baseline never turns a red current run into a pass, and never certifies anything.
3. **A red check is said as red (T2).** When the latest check on the current tree failed, R1 leads with "the last check on
   this tree failed" and that a done claim contradicts it, in place of "no qh-check has passed on".
4. **No check, one line (T2).** A turn end that changed tracked files where no check is declared or inferred says once
   per tree: "no check is declared or inferred here, so nothing verified this change; declare one as `check` in
   `.quality-harness.json`". This reverses the 2026-08-26 opt-in ("a project that named no check cannot be asked to run
   one") in the one case where it hid a changed tree, and keeps it otherwise: no rule that needs a check runs.
5. **Inference reads pytest's own configuration (T1).** `[tool.pytest.ini_options]` in `pyproject.toml` and
   `[tool:pytest]` in `setup.cfg` infer `pytest`, beside `pytest.ini` and `tox.ini`.
6. **The Go core is frozen at its parity (T4).** Until ADR-112's verdict, the rules above are written in the Node path
   only; the parity and golden tests name the rules the Go core lacks, so its coverage is said rather than broken.
   ADR-110 T2 and T3 wait.

**This fails if** a baseline run blocks a hook or holds a git lock; a baseline red is ever said as a pass or certifies a
tree; the turn end says "this change broke it" without a baseline pass on the session's starting tree and a fail on the
current tree; or ADR-112 shows the plugin with this record does not reduce false completions or broken tests against the
plain arm, in which case ADR-112's kill criterion applies to this record too. Data that could produce the last failure
does not exist yet; ADR-112 produces it.

## Alternatives Considered

- **Port more to Go first (ADR-110 T3).** Rejected for now: block 1's losses are decisions, not latency; the same
  decisions in Go keep both gaps and double the cost of every new rule.
- **Baseline on the first edit's PreToolUse instead of SessionStart.** Rejected: a PreToolUse that starts a full check
  races the edit it precedes; the session's starting tree is already recorded and is the tree the agent did not change.
- **Per-test diff of the baseline and the current run.** Deferred: it needs a parser per runner's output; the exit-level
  comparison is the smallest rule that distinguishes the two cases block 1 confused.
- **Refuse a done claim after a red check.** Rejected: CLAUDE.md §3 sanctions two refusals and no others; a turn end
  advises and continues once (ADR-096).
- **Scope the check to the files a turn touched.** Deferred: runner-specific mapping; the baseline makes a whole-suite red
  attributable without it.

## Component / Boundary Impact

`plugin/scripts/qh-check.mjs` gains a baseline mode; `plugin/scripts/lifecycle.mjs` starts it at SessionStart;
`plugin/scripts/completion-rules.mjs` reads it at the turn end; `plugin/scripts/check-command.mjs` gains two rungs. Each
keeps its one reason to change. `core/` is unchanged (Decision 6). This repository has no architecture document.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `checks.jsonl` row | gains `baseline: true` on a baseline run | `qh-check --baseline` (T3) | the turn end (T3), `release-evidence` ignores it |
| `qh-check --baseline` | new flag | T3 | `lifecycle.mjs` SessionStart (T3) |
| R1 text | two baseline sentences and a red-check lead | T2, T3 | the agent |
| no-check turn end | one line | T2 | the agent |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the red-check lead in R1 | T2 | T3 | No — T3 adds sentences beside it |
| the rules the Go core lacks, named in the parity tests | T4 | T2, T3 | No |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** a red check becomes attributable; a regression the agent caused is named at the turn end; a changed tree
  in a project with no known check is no longer silent.
- **Negative:** one extra check run per session where a check exists, detached; one more line at some turn ends (§19:
  measured by T3 on a fresh repository and on a corpus before release).
- **Neutral:** the Go core lags the Node path by the rules this record adds, and says so.

## Out of Scope

- Per-test comparison of the baseline and the current run (deferred: docs/BACKLOG.md §383)
- Scoping the check to the files a turn touched (deferred: docs/BACKLOG.md §383)
- Any refusal of a done claim (permanent: boundary: CLAUDE.md §3 sanctions two refusals and this is neither)
- Porting these rules to the Go core (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The baseline run loads an adopter's machine at every session start | Med | Med | the machine lease and the fence deadline; startup only, never resume or compact |
| A flaky suite reads as "this change broke it" | Med | Med | the sentence names both runs and their trees; the agent can rerun; no refusal follows |
| The baseline finishes after the turn ends | High on slow suites | Low | the turn end says nothing new without a record; the next turn end reads it |

## Rollback

Revert the tasks' commits. The `baseline: true` rows stay in `checks.jsonl` and are ignored by every reader that predates
them, since each reads `check.passed` / `check.failed` by tree.

## Follow-ups

- [ ] ADR-112's verdict on this record, and whether its kill criterion applies.
