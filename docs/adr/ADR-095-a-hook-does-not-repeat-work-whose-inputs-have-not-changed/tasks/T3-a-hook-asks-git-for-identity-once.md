# Task ADR-095-T3: a hook process asks git for the repository's identity once

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one module, tests)
**Owner:** unassigned
**Produces:** identity questions answered once per process
**Consumes:** `scripts/hook-cost.mjs --json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an identity question is asked once per process`, `the memo is per directory`, `no question about the tree is memoised`

## Goal

Within one hook process, `git rev-parse --show-toplevel`, `--git-path <name>` and `--show-object-format` are answered once per (argument list, directory), and nothing else about git is remembered.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/tree-facts.mjs` | edit | `gitRepositoryRoot`, `gitRepositoryLookup` and the git-path lookups go through a per-process memo built on `once` |
| `tests/identity-memo.test.mjs` | add | three tests |
| `tests/mutations/plugin/scripts/tree-facts.mjs.json` | edit | one entry per `Rests-on` name |

## Ordered Steps

1. [S1] Write the three tests of the Tests table and record the red run (TDD red).
2. [S2] Measure the Stop event with T1 first and put the 13 children, the 4 toplevel repeats and the milliseconds in the sign-off as the baseline. [proof: human: the baseline table is in the sign-off]
3. [S3] Memoise only the three identity questions, keyed by (argument list, directory) for the life of the process.
4. [S4] Measure again with T1: the toplevel is asked once; put the after figures in the sign-off. [proof: human: the Stop event's `rev-parse --show-toplevel` count is 1 and no other child disappeared]
5. [S5] Record one killed mutant per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/identity-memo.test.mjs 2>&1) \
  && for t in 'a Stop event asks git for the repository toplevel once' 'the memo is per directory: two directories in one process are two answers' 'no question about the tree is memoised: a status asked twice around a write sees the write'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a Stop event asks git for the repository toplevel once` | `tests/identity-memo.test.mjs` | the real hook program against a fixture repository: exactly one `rev-parse --show-toplevel` child | none | S1, S3 |
| `the memo is per directory: two directories in one process are two answers` | `tests/identity-memo.test.mjs` | two repositories asked in one process give their own toplevels (the dirty twin of a global memo) | none | S1, S3 |
| `no question about the tree is memoised: a status asked twice around a write sees the write` | `tests/identity-memo.test.mjs` | `status`, `diff`, `write-tree`, `add` and `ls-files` are spawned every time they are asked | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | the git helpers in `tree-facts.mjs` call the memo; removing the call turns the first test red |
| 3 — the caller can discover it | n/a: internal |
| 4 — it is used | the Stop measurement of S4 |

## Mutation Log

## Invariants

- Only identity questions are remembered; a question whose answer can change inside a hook (the tree, the index, HEAD) is asked every time (CLAUDE.md §16).

## Risks

- A `cd` inside the process changing what the same argument list means: the directory is in the key.

## Stop Condition

Stop and ask if any caller passes a relative directory (then the key must be the resolved one, or the memo is dropped).

## Out of Scope

- The two `write-tree` calls and `git status`/`diff` (permanent: boundary: tree questions; the observation is the point)

## Verification Log
