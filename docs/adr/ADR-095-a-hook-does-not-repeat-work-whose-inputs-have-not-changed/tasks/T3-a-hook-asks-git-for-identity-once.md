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
| `an answer one caller kept reads the same to the other: observe then lookup, and lookup then observe` | `tests/identity-memo.test.mjs` | supplementary, NOT in the Acceptance fence: found at execution — the lookup and the observation keep one entry for the toplevel, and the first version stored two shapes under one key, so the lookup read observe's entry as "git printed no root" and every publish check read the root as unknown | none | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | the git helpers in `tree-facts.mjs` call the memo; removing the call turns the first test red |
| 3 — the caller can discover it | n/a: internal |
| 4 — it is used | the Stop measurement of S4 |

## Mutation Log
- 2026-10-11 · d45c491e* · mutant killed · exit 1 · `plugin/scripts/tree-facts.mjs` · never reuses an identity answer, so the toplevel is asked again at every call · acceptance-sha256:371291e4a1a546347494f09fb170a11a89407f52604014d86c3455ae7c634e8f · covers:an identity question is asked once per process
- 2026-10-11 · d45c491e* · mutant killed · exit 1 · `plugin/scripts/tree-facts.mjs` · keys the memo without the directory, so a second repository is handed the first one's answer · acceptance-sha256:371291e4a1a546347494f09fb170a11a89407f52604014d86c3455ae7c634e8f · covers:the memo is per directory
- 2026-10-11 · d45c491e* · mutant killed · exit 1 · `plugin/scripts/tree-facts.mjs` · remembers the tree after the add, so a later observation sees the old tree · acceptance-sha256:371291e4a1a546347494f09fb170a11a89407f52604014d86c3455ae7c634e8f · covers:no question about the tree is memoised

## Invariants

- Only identity questions are remembered; a question whose answer can change inside a hook (the tree, the index, HEAD) is asked every time (CLAUDE.md §16).

## Risks

- A `cd` inside the process changing what the same argument list means: the directory is in the key.

## Stop Condition

Stop and ask if any caller passes a relative directory (then the key must be the resolved one, or the memo is dropped).

## Out of Scope

- The two `write-tree` calls and `git status`/`diff` (permanent: boundary: tree questions; the observation is the point)

## Verification Log
- 2026-10-11 · d45c491e* · exit 1 · `out=$(node --test --test-reporter=tap tests/identity-memo.test.mjs 2>&1) \ …` · acceptance-sha256:371291e4a1a546347494f09fb170a11a89407f52604014d86c3455ae7c634e8f · ms:2553 · test-lock-sha256:296f83e9544b3160aa05602ea7b7bec013f1cbc7a36a2a83a57ca07361a57c24 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvaWRlbnRpdHktbWVtby50ZXN0Lm1qcwlhIFN0b3AgZXZlbnQgYXNrcyBnaXQgZm9yIHRoZSByZXBvc2l0b3J5IHRvcGxldmVsIG9uY2UJYTY1OWQ2NzUwZjJjYTVkYTdiZjcxZGEwMjc0ZDdmNDdiMDhkZTE1ZjkwOGUzMTg3OTE0OTYyMGMzZjc5NmRhYgpib2R5CXRlc3RzL2lkZW50aXR5LW1lbW8udGVzdC5tanMJbm8gcXVlc3Rpb24gYWJvdXQgdGhlIHRyZWUgaXMgbWVtb2lzZWQ6IGEgc3RhdHVzIGFza2VkIHR3aWNlIGFyb3VuZCBhIHdyaXRlIHNlZXMgdGhlIHdyaXRlCWRiZjQwNTkzMGVhNGMwNDY2NjkyMzY0NTY4NzYxNGE5MmI5YjNiNjE1NzhiYjMzODY1ODIwMmM2NGU0ZGQ3ZTAKYm9keQl0ZXN0cy9pZGVudGl0eS1tZW1vLnRlc3QubWpzCXRoZSBtZW1vIGlzIHBlciBkaXJlY3Rvcnk6IHR3byBkaXJlY3RvcmllcyBpbiBvbmUgcHJvY2VzcyBhcmUgdHdvIGFuc3dlcnMJOGZkOGYxOWM1MDEyYzY1MzU5MWNkNDM4YjM4MjA0NmVmYWZkZDgyYzNmNjBiM2U2OTczNjdhM2ZlY2M5YTc5Yw
  ```
  ```
- 2026-10-11 · d45c491e* · exit 0 · `out=$(node --test --test-reporter=tap tests/identity-memo.test.mjs 2>&1) \ …` · acceptance-sha256:371291e4a1a546347494f09fb170a11a89407f52604014d86c3455ae7c634e8f · ms:3645
- 2026-10-11 · d45c491e* · exit 0 · `out=$(node --test --test-reporter=tap tests/identity-memo.test.mjs 2>&1) \ …` · acceptance-sha256:371291e4a1a546347494f09fb170a11a89407f52604014d86c3455ae7c634e8f · ms:3165
- 2026-10-11 · d45c491e* · exit 0 · `out=$(node --test --test-reporter=tap tests/identity-memo.test.mjs 2>&1) \ …` · acceptance-sha256:371291e4a1a546347494f09fb170a11a89407f52604014d86c3455ae7c634e8f · ms:2957
- 2026-10-11 · human-observed · observed by the executing session on macOS, 2026-10-11, scripts/hook-cost.mjs on a clone of this repository: baseline (S2) the turn-end event 16 children with rev-parse --show-toplevel x6, 2 write-tree, 3 status; after (S4) 11 children with the toplevel asked once, the two git-path questions once each, and status x3 and write-tree x2 unchanged, since tree questions are deliberately not remembered; SessionStart cold event 17 children before, 15 after (the toplevel x3 became x1); found at execution and fixed: the first version kept two result shapes under one key (the lookup and observe), so the lookup read observe's entry as an empty root and the publish check said the root was unknown in nine tests, caught by the regression run, now one shape and a supplementary test for both orders; approved
