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
- 2026-10-15 · f1297c97* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a fast pass would admit any -c key before commit, including core.hooksPath · acceptance-sha256:bbeae9cddac535d6aec80c68f979371b5a79f0438653fb87d35a886663a4803b

## Invariants

- No `-c` key outside `user.` is admitted anywhere it was not before.

## Risks

- None beyond ADR-104's.

## Stop Condition

Stop and ask if a `user.` key is found that runs a program or moves the repository.

## Out of Scope

- A chained command on a fast pass (permanent: boundary: ADR-081 admits one commit and nothing else)

## Verification Log
- 2026-10-15 · f1297c97* · exit 1 · `out=$(node --test --test-reporter=tap tests/commit-identity.test.mjs 2>&1) \ …` · acceptance-sha256:bbeae9cddac535d6aec80c68f979371b5a79f0438653fb87d35a886663a4803b · ms:261 · test-lock-sha256:6ce192ca78411b65bb2b8b138f453252533efb88e122d9896774fc6b01509e38 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29tbWl0LWlkZW50aXR5LnRlc3QubWpzCWEgY29tbWl0IHdpdGggYSB1c2VyIGlkZW50aXR5IHJlYWRzIHRoZSBzYW1lIGF0IGFsbCB0aHJlZSByZWFkZXJzLCBhbmQgb3RoZXIgLWMga2V5cyBkbyBub3QJYmEwNTFhZDM1ZDczMzJiM2I1NTE5YzI5ZDgzMmEwZDUwNTRlNDcwYTQ5ZDI1OGY0ZjE2YzExZWFhN2FjYTYyOA
  ```
  ```
- 2026-10-15 · f1297c97* · exit 0 · `out=$(node --test --test-reporter=tap tests/commit-identity.test.mjs 2>&1) \ …` · acceptance-sha256:bbeae9cddac535d6aec80c68f979371b5a79f0438653fb87d35a886663a4803b · ms:591
