# Task ADR-096-T2: Stop delivers findings to the agent, each with an identity, once per tree

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (the Stop branch of `deliver`, identity on every finding, the pending state, goldens, tests)
**Owner:** unassigned
**Produces:** `deliver` emitting `hookSpecificOutput.additionalContext` on Stop; `action.emitted` rows with `tree`, `channel`, `recipient`
**Consumes:** a live observation that Stop `additionalContext` reaches the main agent (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a finding reaches the agent`, `a turn continues at most once`, `a finding is said to the agent once per tree`, `a finding said only to the user stays pending`

## Goal

A main-agent Stop hands the agent every finding meant for it, each finding has an identity (rule, key, tree), and a finding reaches the
agent once per tree; a finding imported on an event with no channel to the agent waits for the next Stop.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `deliver`: on Stop, `additionalContext` plus a one-line `systemMessage`; nothing when `stop_hook_active`; `action.emitted` gains `tree`, `channel` (`agent`/`user`), `recipient` (`main`/`subagent`); the guard reads agent rows only |
| `plugin/scripts/completion-rules.mjs` | edit | the task-evidence nudge (`:689`) gets a rule and a key |
| `plugin/scripts/artifact-pass.mjs` | read | which findings `importPassVerdicts` hands over, so a user-only delivery leaves them pending |
| `tests/turn-end-delivery.test.mjs` | edit | the six tests below |
| `tests/hook-goldens.test.mjs` and its golden files | edit | the Stop goldens take the new shape; SubagentStop's do not move |
| `tests/mutations/plugin/scripts/lifecycle.mjs.json` | edit | one entry per `Rests-on` name |

## Ordered Steps

1. [S1] Write the six tests of the Tests table and record the red run (TDD red). The tests capture the real hook program's JSON on fixtures they prepare (an unchecked write; a session log with an agent row for the same tree; a seeded artifact ledger result imported on a SessionStart).
2. [S2] Change `deliver` and `action.emitted` as the Affected Files rows say.
3. [S3] Give the nudge its identity; enumerate every `queueAction`/`actions.push` without a `rule` with a command, and put the command and the count in the sign-off. [proof: human: every advisory that can reach Stop has a rule and a key]
4. [S4] Update the Stop goldens; confirm the SubagentStop and PreToolUse goldens are byte-identical. [proof: acceptance]
5. [S5] Record one killed mutant per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs tests/hook-goldens.test.mjs 2>&1) \
  && for t in 'a Stop with unchecked work gives the agent the finding and the user a headline' 'a second Stop in the same turn adds nothing' 'a finding delivered to the agent for this tree is not delivered again, and a changed tree is said again' 'an artifact finding imported on an event that cannot reach the agent stays pending for the next Stop' 'the task-evidence nudge has an identity and is said once per tree' 'SubagentStop output is unchanged'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a Stop with unchecked work gives the agent the finding and the user a headline` | `tests/turn-end-delivery.test.mjs` | Stop on a fixture with an unchecked write: `hookSpecificOutput.additionalContext` names the finding; `systemMessage` is one line | none | S1, S2 |
| `a second Stop in the same turn adds nothing` | `tests/turn-end-delivery.test.mjs` | the same input with `stop_hook_active: true`: no `additionalContext` | none | S1, S2 |
| `a finding delivered to the agent for this tree is not delivered again, and a changed tree is said again` | `tests/turn-end-delivery.test.mjs` | a session log holding an agent row for the same rule, key and tree: nothing added; a different tree: said | none | S1, S2 |
| `an artifact finding imported on an event that cannot reach the agent stays pending for the next Stop` | `tests/turn-end-delivery.test.mjs` | an artifact finding imported on SessionStart (user-only) is delivered as context at the next Stop | none | S1, S2 |
| `the task-evidence nudge has an identity and is said once per tree` | `tests/turn-end-delivery.test.mjs` | two Stops on an unchanged checked tree with a changed task file: the nudge is added once | none | S1, S3 |
| `SubagentStop output is unchanged` | `tests/turn-end-delivery.test.mjs` | a SubagentStop with a finding: the output is the same as before this task | none | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests |
| 2 — something selects it | `main` in `lifecycle.mjs` calls `deliver` for every event; removing the Stop branch turns the first test red |
| 3 — the caller can discover it | the hooks reference documents Stop `additionalContext` |
| 4 — it is used | T1's probe shows the host honours it; the follow-up count in the parent record |

## Mutation Log

## Invariants

- PreToolUse delivery, both refusals and SubagentStop are unchanged byte for byte (their goldens do not move).
- What each rule judges is unchanged; only where its text goes and what is recorded.
- A main-agent turn continues at most once per Stop chain.

## Risks

- A loop or a nag: guarded twice and proven by tests and mutants.

## Stop Condition

Stop and ask if a finding can reach Stop without a rule and a key after S3, or if a SubagentStop golden moves.

## Out of Scope

- SubagentStop and TaskCompleted (deferred: `docs/BACKLOG.md` §378)

## Verification Log
