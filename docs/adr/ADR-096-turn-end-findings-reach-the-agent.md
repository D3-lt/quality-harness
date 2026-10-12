# ADR-096: Turn-end findings reach the agent

**Status:** Accepted
**Date:** 2026-10-12
**Owner:** zy
**Spec:** None — no spec stage; the evidence is in Context
**Cross-references:** ADR-035, ADR-053, ADR-060, ADR-061, ADR-080
**Governs:** None — declared by its tasks
**Enforced-by:** None — the mutation labels arrive with T2's catalogue entries; name one here when T2 is done
**Invalidates:** ADR-035 — its Wiring row "Stop `systemMessage` text … the model, the user" (line 141) is false; the model never saw that text
**Served-path change:** At the end of a main-agent turn with unchecked work, writes git could not see, a claim of done the ledgers do not back, or an artifact finding, the agent is told in its own context and the turn continues once so it can act; today only the user is shown it.

## Context

A read-only review of the plugin's 94 components (2026-10-11) found that most judgements end as text the agent must read. The
next question was whether that text reaches the agent at all.

- **The hook contract.** The Claude Code hooks reference (code.claude.com/docs/en/hooks, read 2026-10-12) documents a synchronous
  hook's top-level `systemMessage` as a "warning message shown to the user". What reaches the model is `additionalContext` or, at
  Stop, `decision: "block"` with `reason`. At Stop, `additionalContext` is "non-error feedback": the main agent's conversation
  continues so it can act, and the next Stop carries `stop_hook_active: true`. At SubagentStop the same field continues the
  *subagent*, not the parent that owns the repository work.
- **What this plugin sends.** `deliver()` puts every advisory into `systemMessage` except on PreToolUse (`plugin/scripts/lifecycle.mjs:84-92`).
- **How often.** In this repository's 12 session logs (`.git/quality-harness/sessions/`, counted 2026-10-12): R1 fired 530 times,
  R2 68, R3 13, R4 1, rule A 89 — all to the user. The publish verdict P, delivered as PreToolUse `additionalContext` or a deny,
  fired 764 times and is the only rule the agent saw.
- **Live evidence.** In the session that wrote this record the agent received PreToolUse advice dozens of times and not one
  turn-end message, across many turns that ended on unchecked work.
- **The owner's decision (2026-10-12):** route the turn-end rules to the agent rather than delete them; Accepted the same day.
- **A different-lineage review of the first draft (gpt-6.1-sol, read-only, 2026-10-12)** found that SubagentStop continues the wrong
  actor, that artifact findings imported on every event (`lifecycle.mjs:152`) can be marked said on an event with no channel to the
  agent and so never reach it, that `action.emitted` rows (`lifecycle.mjs:96-101`) record no tree and no recipient, and that the
  task-evidence nudge (`completion-rules.mjs:689`) has no rule or key. This version answers each.

This changes what CLAUDE.md §3 allows in kind: a hook that makes the conversation continue is an act, though not a refusal. The two
sanctioned refusals stay the only refusals.

The class, enumerated with `git grep -n "systemMessage" -- plugin/scripts` (2026-10-12, four sites, all in `lifecycle.mjs`): line 45
(the slow-hook note: meant for the user, stays), line 70 (the headline of a refusal whose reason already reaches the model: stays),
line 89 (the PreToolUse headline beside `additionalContext`: stays), line 91 (every other event's advisory: the member this record
changes, on Stop only). Hook outputs already using `additionalContext`, from `git grep -n "additionalContext" -- plugin/scripts`:
`on-session-start.mjs:75`, `on-subagent-start.mjs:10`, `on-pre-tool-use.mjs:40`, `run-shell-hook.mjs:392`; unchanged.

## Existing Primitives Audit

- `deliver(actions, input)` in `lifecycle.mjs` already composes every queued action into one output: reshaped, not replaced.
- `action.emitted` rows (`lifecycle.mjs:96-101`) already record what was said; they gain the tree, the channel and the recipient, and
  become the loop guard's memory.
- `importPassVerdicts` (`lifecycle.mjs:153`) already imports artifact findings; it gains "pending until said to the agent".
- `project-config.mjs` already reads `.quality-harness.json` keys such as `"publish"` and says an unreadable file as such: reused for the opt-out.
- The hook goldens (`tests/hook-goldens.test.mjs`) pin each event's exact output.

## Decision

On **Stop** (the main agent's turn end), an advisory meant for the agent is delivered as `hookSpecificOutput.additionalContext`
(`hookEventName: "Stop"`), and a one-line headline stays in `systemMessage` for the user, so the turn continues and the agent can
act. Every finding has an identity: its rule, its key and the tree it was judged on; the task-evidence nudge gets a rule and a key
like the rest. Three guards:
1. **Once per turn:** when the Stop input carries `stop_hook_active: true`, nothing is added and the turn ends.
2. **Once per finding per tree, to the agent:** `action.emitted` records the channel (`agent` or `user`) and the tree; a finding
   already delivered to the agent for that tree is not delivered again. A delivery on an event with no channel to the agent (user
   only) does not count, so the finding stays pending for the next Stop.
3. **An opt-out:** `"turnEnd": "notify"` in `.quality-harness.json` restores user-only delivery; any other value, or none, means `"agent"`.
SubagentStop is unchanged: its context would continue the subagent, and what these rules judge belongs to the parent.
It fails if a Stop with unchecked work produces no `additionalContext`, if a second Stop in the same turn adds context again, if a
finding first imported on a user-only event never reaches the agent, or if the opt-out is ignored.

**Amended during T2 (2026-10-12), where two locked tests of accepted records disagreed with the first shape.** ADR-060's
`one hook delivers every action it records` asserts that the user's Stop message carries the finding's full text, so the user's
`systemMessage` is unchanged and the agent gets the same text as `additionalContext`; there is no one-line headline. ADR-080's
`a pass's findings reach the next hook once` asserts that artifact findings are said by whichever hook comes next, so the import
stays on every event; a finding said where only the user sees it is said again at the next Stop or PreToolUse, which reach both. A
delivery row records who it reached as `channel`: `both` (Stop, PreToolUse) or `user` (every other event), plus `recipient`
(`main` or `subagent`); the tree is carried in each rule's key, as it already was for R1. A row written before this record has no
channel and counts as heard by everyone, so nothing said before the upgrade is said again.

## Alternatives Considered

- **Delete the turn-end rules.** The publish refusal already judges an unchecked tree at commit and push. Rejected by the owner on
  2026-10-12: the end of a turn is where the agent can still act cheaply, and the rules have never been given the chance.
- **`decision: "block"` with `reason` at Stop.** Also reaches the model, but it is labelled a hook error and reads as a refusal.
  Rejected: the finding is advice; `additionalContext` is documented as non-error feedback with the same loop protections.
- **Route SubagentStop the same way.** Rejected by the review: it continues the subagent, which neither owns the work nor, for a
  read-only reviewer, may change it.
- **Keep them user-only, relabelled.** Honest, but leaves the signals wired to nothing that acts. Rejected.

## Component / Boundary Impact

`lifecycle.mjs` (`deliver`, `action.emitted`, the import's pending state) changes what it emits on Stop and what it records;
`completion-rules.mjs` gives the nudge an identity; `project-config.mjs` gains one key. What each rule judges is unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Stop hook stdout | the advisory is also emitted as `hookSpecificOutput.additionalContext`; `systemMessage` is unchanged | `lifecycle.mjs` `deliver` (T2) | the model (new), the user (as before) |
| `action.emitted` session-log row | gains `channel` (`both` or `user`) and `recipient` | `lifecycle.mjs` (T2) | the rules' dedupe through `emittedFor`, `namedByReview` and the artifact import (T2), `ledger-report.mjs` |
| `.quality-harness.json` `turnEnd` | new optional key, `"agent"` (default) or `"notify"` | the adopter | `deliver` (T3) |
| CLAUDE.md §3 | a hook that continues a turn is named as an allowed act, not a refusal | T1 | every session in this repository |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| host probe result and the §3 sentence | T1 | T2 | No |
| `deliver` emitting `additionalContext` on Stop, findings with identity | T2 | T3 | Yes: Stop output shape changes; goldens updated in T2 |

## Implementation

See `tasks/README.md`: T1 (confirm the host and name the act in §3), T2 (deliver on Stop with identity and guards), T3 (the opt-out and its documentation).

## Consequences

- **Positive:** the 612 turn-end deliveries this repository's logs hold would have reached the agent; the end of a turn becomes the
  cheapest place to act on unchecked work, before a commit is refused.
- **Negative:** a turn that ends on unchecked work runs one more step; an adopter on a Claude Code version without Stop
  `additionalContext` gets only the headline.
- **Neutral:** the user's message is unchanged; what each rule judges does not change; subagents are unchanged.

## Out of Scope

- A small local model deciding whether to continue a turn (deferred: the redesign plan's phase 3b, `docs/BACKLOG.md` §378)
- SubagentStop delivery to the parent through a PostToolUse hook on the Agent tool (deferred: `docs/BACKLOG.md` §378)
- TaskCompleted delivery: the hooks reference read on 2026-10-12 did not settle where its output goes (deferred: `docs/BACKLOG.md` §378)
- Any new refusal; this record adds none (permanent: boundary: CLAUDE.md §3 keeps exactly two refusals)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A turn loops | Med | High | guard 1 and guard 2, each with a test and a killed mutant |
| A finding is used up on an event that cannot reach the agent | Med | Med | guard 2 counts only agent deliveries; a test seeds a delayed artifact finding |
| Repeated nagging on a tree the agent chose not to check | Med | Med | guard 2; the opt-out |
| An older host ignores Stop `additionalContext` | Low | Low | the headline still reaches the user, as today; T1 checks the installed host first |

## Rollback

`"turnEnd": "notify"` per project, or revert T2's commit: the output returns to user-only `systemMessage`. The added
`action.emitted` fields are additive; older readers ignore them.

## Follow-ups

- [ ] After a week of use, count from session logs how often a continued turn ran a check the finding asked for (the measure of whether routing works).
