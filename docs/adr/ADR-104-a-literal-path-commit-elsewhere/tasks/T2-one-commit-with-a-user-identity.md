# Task ADR-104-T2: one commit with a user identity is one commit

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one constant read at three sites, one test file)
**Owner:** unassigned
**Produces:** `USER_IDENTITY` in `plugin/scripts/publish-command.mjs`
**Consumes:** none
**Proof map:** v1

## Goal

The three readers of git's options before the verb answer `-c user.<key>=<value>` the same way, so on a fast-pass tree
`git -c user.name=… commit` is one commit (ADR-104, Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/publish-command.mjs` | edit | `USER_IDENTITY`, read at `commitOnlyCommand` (`:47-52`), `freshRepositoryCommit` (`:105`) and `segmentVerdict` (`:791`) |
| `tests/commit-identity.test.mjs` | create | the test below |
| `.quality-harness.json` | edit | `tests/commit-identity.test.mjs` in `fastCheck` |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: `commitOnlyCommand` rejects `-c user.name=x`).
2. [S2] Add `USER_IDENTITY` and read it at the three sites.
3. [S3] Record a killed mutant on `commitOnlyCommand`'s `-c` arm. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/commit-identity.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a commit with a user identity reads the same at all three readers, and other -c keys do not")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a commit with a user identity reads the same at all three readers, and other -c keys do not` | `tests/commit-identity.test.mjs` | through `commitOnlyCommand`, `freshRepositoryCommit` and `leavesHookInPlace` alike: `-c user.name=x`, `-c user.email=x` and `-c user.signingkey=x` (which `freshRepositoryCommit` refuses today) are admitted; twins at all three: `-c core.hooksPath=x`, `-c alias.ci=…`, `-c user.name` with no value; and `.quality-harness.json`'s `fastCheck` names this file; `-c user.name=x commit; echo` stays not one commit | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `USER_IDENTITY` |
| 2 — something selects it | `commitOnlyCommand`, read by `publishUnchecked` |
| 3 — the caller can discover it | the fast-pass advice instead of a refusal |
| 4 — it is used | through the real PreToolUse hook in the test |

## Mutation Log

## Invariants

- No `-c` key outside `user.` is admitted anywhere it was not before.

## Risks

- None beyond ADR-104's.

## Stop Condition

Stop and ask if a `user.` key is found that runs a program or moves the repository.

## Out of Scope

- A chained command on a fast pass (permanent: boundary: ADR-081 admits one commit and nothing else)

## Verification Log
