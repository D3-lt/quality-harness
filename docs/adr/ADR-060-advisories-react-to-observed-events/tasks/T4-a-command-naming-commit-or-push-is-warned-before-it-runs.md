# Task ADR-060-T4: A command naming commit or push is warned before it runs

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** rule P
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); `checks.jsonl` written by `qh-check` (T2); the word rule, the reviewer deny and R3 (T3); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `rule P warning before the command runs`, `the word rule selecting publish.requested`, `the rule-and-evidence key for P`, `the check opt-in`, `the kept pre-publish artifact pass`, `each named test actually running`, `the regression suites that pinned the old commit advisory`

## Goal

Outside a read-only role, a PreToolUse Bash command the word rule matches raises `publish.requested`. P advises when the tree or index is not checked and differs from `session.started`, once per `(tree, index, revision)`. The old PreToolUse commit advisory and its unresolved-deletion advisory go, while its artifact pass stays until T6.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the test below |
| `plugin/scripts/lifecycle.mjs` | edit | `publish.requested` and P; the old PreToolUse commit branch loses its advisory and deletion advisory and keeps its `runArtifactGates` call |
| `tests/mutations.json` | edit | entries whose `from` lives in the removed commit and deletion advisories are retired |
| `tests/lifecycle.test.mjs`, `tests/advice-accuracy.test.mjs`, `tests/hook-work.test.mjs`, `tests/gate-rules.test.mjs`, `tests/staged-product.test.mjs`, `tests/unread-advice.test.mjs`, `tests/unread-advice-followon.test.mjs` | edit | tests of the removed commit advisory go (found with `git grep -l PreToolUse -- tests`); their parsing helpers stay until T7 |

## Ordered Steps

1. [S1] Write the test and see it fail on an assertion (TDD red).
2. [S2] Raise `publish.requested` from the word rule and implement P as in ADR-060's Decision. Remove the old commit advisory and the unresolved-deletion advisory, keeping the pre-publish artifact pass.
3. [S3] Remove the tests of the removed advisories. [proof: acceptance]
4. [S4] Run the fence green and record mutants:
   - fire P on a checked tree;
   - drop the revision from P's key;
   - let P's message say the command publishes this repository;
   - select `publish.requested` with `isGitPublishCommand` instead of the word rule.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a command naming commit or push is warned before it runs)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a command naming commit or push is warned before it runs'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/hook-work.test.mjs tests/gate-rules.test.mjs tests/staged-product.test.mjs tests/unread-advice.test.mjs tests/unread-advice-followon.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a command naming commit or push is warned before it runs` | `tests/observed-events.test.mjs` | Temp repositories with a declared check, coordinator hooks driven as processes.<br>• With an unchecked edit, `git commit -m x` gets P; `git push` in the same state gets nothing.<br>• After another edit, `pwsh -Command 'git push'` gets P; after another, `git -C <other> commit` gets P.<br>• After `qh-check` passes, `git commit -m x` gets nothing; after `qh-check` then fails on the same tree, it gets P again.<br>• A repository without a check gets nothing.<br>• The message names `qh-check` and does not say the command publishes this repository. | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | PreToolUse Bash routes through the loop; the test drives it as a process; S4's mutants break each |
| 3 — the caller can discover it | the message names `qh-check` |
| 4 — it is used | every commit and push a session runs through Bash |

## Mutation Log

## Invariants

- The pre-publish artifact pass runs as before until T6.
- Every `tests/mutations.json` entry matches exactly once after this task.
- No command text is read except by the word rule.

## Risks

- P also warns on a command that only mentions a word; it does so once per state, named in ADR-060's Consequences.

## Stop Condition

Stop and ask if a PreToolUse Bash payload lacks `tool_input.command`.

## Out of Scope

- Warning about the state of a repository other than the hook's `cwd` (permanent: boundary: the observation is of the hook's `cwd`)

## Verification Log
