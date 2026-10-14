# Task ADR-102-T2: a syntax finding at the edit reaches the agent

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one condition in `run-shell-hook.mjs`, one test, one manifest entry)
**Owner:** unassigned
**Produces:** `post-edit-check.sh`'s finding as PostToolUse `additionalContext`
**Consumes:** stdout is empty for a clean file (T1)
**Data dependency:** hermetic for the test; S3 needs one live Claude Code session
**Proof map:** v1

## Goal

After a native edit of a broken file, the diagnostic `post-edit-check.sh` prints is handed to the agent as PostToolUse
`additionalContext`; a clean file hands it nothing.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/run-shell-hook.mjs` | edit | the `additionalContext` branch (`:388-396`) takes `post-edit-check.sh` as well as the facts gate |
| `tests/post-edit-check.test.mjs` | edit | add the test below, through the hook boundary (`node run-shell-hook.mjs post-edit-check.sh` with a PostToolUse payload) |
| `tests/mutations/plugin/scripts/run-shell-hook.mjs.json` | edit | the catalogue entry below |
| `scripts/components.json` | edit | the hook's consumer becomes `agent-context`, with its reason |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the broken file's diagnostic arrives as plain stdout).
2. [S2] Widen the branch to the two script names; update the manifest entry; record one killed mutant that narrows it back. [proof: mutation]
3. [S3] In one live session, edit a scratch `.mjs` file into a syntax error and read the agent's next turn for the diagnostic. [proof: human: the host's merging of two PostToolUse hooks' `additionalContext` is not observable from a test]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a syntax finding at the edit reaches the agent, and a clean edit hands it nothing")" = 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a syntax finding at the edit reaches the agent, and a clean edit hands it nothing` | `tests/post-edit-check.test.mjs` | through `run-shell-hook.mjs post-edit-check.sh` with a PostToolUse payload: a broken `.mjs` yields one JSON object whose `hookSpecificOutput.additionalContext` carries the diagnostic and nothing on plain stdout; a clean one yields empty stdout | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry, unchanged |
| 3 — the caller can discover it | the agent reads it in its context; S3 |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log

## Invariants

- The facts gate's wrapping is unchanged (its tests in `tests/gates.test.mjs` stay green).
- The hook exits 0; nothing is refused.

## Risks

- Two PostToolUse hooks both returning `additionalContext` for one edit: S3 reads both in the agent's context.

## Stop Condition

Stop and ask if S3 shows the agent does not receive the diagnostic.

## Out of Scope

- What the checkers print (T1)

## Verification Log
