# Task ADR-060-T3: A read-only role cannot commit or push, and its other changes are reported

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** the word rule, the reviewer deny and R3
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); `checks.jsonl` written by `qh-check` (T2); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the word rule`, `the reviewer deny of Edit and Write by tool name`, `the deny decided before observation`, `R3 over tree, index and HEAD by agent id`, `each named test actually running`, `the regression suites that pin the reviewer guard`

## Goal

`containsCommitOrPush(command)` is the only reading of command text. For a read-only role, `readOnlyVerdict` denies Edit, Write, MultiEdit and NotebookEdit by tool name, and any Bash command the word rule matches. Every other Bash call is allowed, including `qh-check`. R3 reports a tree, index or HEAD change during that agent's run.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the test below |
| `plugin/scripts/lifecycle.mjs` | edit | `containsCommitOrPush`; `readOnlyVerdict` uses tool name and the word rule instead of `bashVerdict`; R3 on `subagent.ended` |
| `tests/mutations.json` | edit | entries whose `from` lives in `bashVerdict` are retired |
| `plugin/scripts/reviewer-guard.mjs` | edit | header comment: the guard reads one word rule, and a payload it cannot read still passes. Its recorded "a command this hook cannot parse … passes" no longer describes anything, because nothing is parsed |
| `plugin/agents/qh-correctness-reviewer.md`, `plugin/agents/qh-scope-reviewer.md`, `plugin/agents/qh-synthesis.md` | edit | guard comments match |
| `tests/reviewer-guard.test.mjs` | edit | Bash refusal cases the word rule does not match are removed; wrapped publishes are added |

## Ordered Steps

1. [S1] Write the test and see it fail on an assertion (TDD red).
2. [S2] Add `containsCommitOrPush`: `commit` or `push` with no letter, digit, `_` or `-` directly before or after. Replace the Bash half of `readOnlyVerdict` with it, and decide the deny before the loop observes.
3. [S3] Implement R3 on `subagent.ended` for a read-only role, paired by `agentId`. It compares tree, index and HEAD with that agent's `subagent.started`, and names current status paths, paths staged now and new commits.
4. [S4] Run the fence green and record mutants:
   - drop `push` from the word rule;
   - observe before deciding the deny;
   - pair R3 by `agentType`;
   - drop the index from R3.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a read-only role cannot commit or push and its other changes are reported)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a read-only role cannot commit or push and its other changes are reported'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a read-only role cannot commit or push and its other changes are reported` | `tests/observed-events.test.mjs` | Temp repositories, hooks driven as processes.<br>• **Denied:** `git commit -m x`, `git push`, `bash -c 'git commit -m x'`, `pwsh -Command 'git push'`, a Python `subprocess.run(["git","push"])`, and Edit. A denied PreToolUse appends no event to the log.<br>• **Allowed:** `qh-check`, `node -e 'console.log(1)'`, `uniq < README.md`, `git log --oneline`, and `grep -n pre-commit README.md`.<br>• **R3 (staggered reviewers):** one that runs `git add` reports the staged path; one that runs `sort -o out.txt README.md` reports `out.txt`; one that changes nothing reports nothing.<br>• **R3 (overlapping reviewers):** the message says the state changed during that reviewer's run. | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | PreToolUse, SubagentStart and SubagentStop route through the loop, and the agents' frontmatter runs `reviewer-guard.mjs`; the test drives them as processes; S4's mutants break each |
| 3 — the caller can discover it | the refusal message names what the role may do instead |
| 4 — it is used | every quality-cycle and review-ring run |

## Mutation Log

## Invariants

- Edit, Write, MultiEdit and NotebookEdit stay denied for read-only roles.
- No command text is read except by the word rule.
- A payload the guard cannot read passes.
- The old PreToolUse commit advisory and the old completion advisories are unchanged until T4 and T5.
- Every `tests/mutations.json` entry matches exactly once after this task.

## Risks

- A split word, a config alias or a script evades the word rule; R2 and R3 report the resulting commits, and a push is not reported. Named in ADR-060's Consequences.

## Stop Condition

Stop and ask if the SubagentStart or SubagentStop payload lacks `agent_id` or `agent_type`.

## Out of Scope

- A per-subagent sandbox (permanent: boundary: no such host setting is measured here)

## Verification Log
