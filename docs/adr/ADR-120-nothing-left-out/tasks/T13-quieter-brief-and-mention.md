# Task ADR-120-T13: branch-state reads the session's worktree and says a permanent unknown once; `git stash push` is no push

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** branch-state's cwd and permanent-unknown rule; the mention arm's stash rule
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

branch-state reports the worktree the session's payload names, a repository whose remotes name no GitHub host is said once per session, and the mention advisory no longer fires on `git stash push`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/branch-state-cwd.test.mjs` | create | the cwd and permanent-unknown rows (0 locks: new) |
| `tests/mention-stash.test.mjs` | create | the stash rows (0 locks: new) |
| `plugin/scripts/branch-state.mjs` | edit | read the hook payload's `cwd` when present (`main`, :929-1027) and use it for every directory the script derives, from `mrw read --grep 'process\.cwd\(\)|cwd:' plugin/scripts/branch-state.mjs`: the shell's cwd (:75), the detached refresher (:836), the review ledger (:937), and both cache lookups (:957, :981); a `no remote names a GitHub host` state is keyed once per session, not per head change (:919-924) |
| `plugin/scripts/publish-verdict.mjs` | edit | `mentionsCommitOrPush` (:36-48): `stash push` after `git` is no push |
| `core/hooks/publish.go` | edit | the same (:33-64) |
| `tests/mutations/plugin/scripts/branch-state.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a payload whose `cwd` is a linked worktree reports that worktree; a repository with only a Bitbucket remote prints its unknown at the first prompt and nothing on later prompts whose head changed; a GitHub repository whose run is in progress still says it once per change; `git stash push` draws no mention, `git push` and `git -c x=y push` still do.
2. [S2] Read the payload `cwd`; key the permanent unknown per session.
3. [S3] Add the stash rule to the mention arm, Node and Go.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs 2>&1) \
  && for n in "branch-state reports the session's worktree and says a permanent unknown once" \
      "git stash push is no push, and a real push is still mentioned"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `branch-state reports the session's worktree and says a permanent unknown once` | `tests/branch-state-cwd.test.mjs` | cwd and the once-per-session key | — | S1, S2 |
| `git stash push is no push, and a real push is still mentioned` | `tests/mention-stash.test.mjs` | the mention arm | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A repository that gains a GitHub remote mid-session: the state changes, so it is said again.

## Stop Condition

Stop if the host starts UserPromptSubmit with no payload `cwd`: the fallback stays `process.cwd()`, said as such.

## Out of Scope

- The rest of §383's mention over-matching (quoted arguments of `gh`, grep patterns) (permanent: boundary: a quoted word can be code again in an interpreter's argument, CLAUDE.md §16; it needs measured rows per program, not this task)

## Verification Log
