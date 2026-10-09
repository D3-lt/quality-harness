# Task ADR-093-T1: an armed session leaves a literal-variable directory commit to git

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one predicate in one file, its tests and campaign entries)
**Owner:** unassigned
**Produces:** `literalDirectoryVariables` — the literal directory variable reading of ADR-093's Decision
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an armed session admits a literal directory variable as a directory operand`, `a dollar outside a literal directory operand keeps the refusal`, `the unarmed arm does not read a literal directory variable`

## Goal

In an armed Bash session, rule P gives ADR-066's advice, not a refusal, to a commit whose only `$` words are a literal-assigned variable used as the operand of `cd`, `mkdir`, `git -C` or `git init`, so git's own hook judges the repository the commit lands in. Every other `$` still keeps the refusal.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `literalDirectoryVariables(commands)` (new, beside `freshDirectoryVariables`); `freshDirectoryText` takes the union of both sets; `directoryOperands` gains `mkdir` and a plain path suffix; `segmentVerdict`'s assignment rule returns 0 for a literal directory variable's assignment |
| `tests/publish-command.test.mjs` | edit | two fenced tests and one supplementary test beside the locked ones, through `armedSession` |
| `tests/mutations/plugin/scripts/lifecycle.mjs.json` | edit | three entries: one per Rests-on name, plus one that the unarmed arm stays unchanged |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/publish-command.test.mjs`, then write the tests in this task's Tests table beside the locked ones and record the red run (TDD red). Every path in a row is assembled at runtime from the test's own temporary directory (CLAUDE.md §6). Red today: an armed session refuses each data row.
2. [S2] Add `literalDirectoryVariables(commands)`: names assigned exactly once by a bare assignment command whose value matches ADR-093's pattern, spelled unquoted in the raw text, outside `HOOK_ENVIRONMENT_NAMES` and the shell-special names, named nowhere else as a word, in a text that names no shell-special name. It does not touch `freshDirectoryVariables`.
3. [S3] In `freshDirectoryText`, take the union of the fresh and the literal sets, but read the `mkdir` operand and the `/seg` suffix only for a literal variable (`directoryOperands` takes the set it is asked about). Every other `$` or backtick still returns the text unchanged, so `leavesHookInPlace` returns false.
4. [S4] In `segmentVerdict`, a literal directory variable's assignment segment returns 0. Every other `NAME=` segment still returns -1.
5. [S5] Record three killed mutants: one that drops the admission (the data test goes red), one that admits a `$` in any position (the twin goes red), one that lets `freshRepositoryCommit` read the literal set (the unarmed twin in the data test goes red). [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \
  && for t in 'an armed session leaves a literal-variable directory commit to git' 'an armed session still refuses a dollar it cannot place as a literal directory'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an armed session leaves a literal-variable directory commit to git` | `tests/publish-command.test.mjs` | armed and unchecked, none of these is `deny`: `S=<tmp>; mkdir $S/y && cd $S/y && git init -q && git commit -qm f`, the same with `"$S/y"`, `S=<tmp>; cd $S && git init -q && git add . && git commit -qm f`, and `S=<tmp> && git init -q $S && git -C $S commit -qm f`. DIRTY twins: the same rows unarmed are `deny`; a fresh-directory variable still gets exactly ADR-086's operand forms (`R=$(mktemp -d <tmp>/x.XXXX); mkdir $R` and `cd "$R/y"` stay `deny`); the unarmed `freshRepositoryCommit` still refuses a literal variable | none | S1, S2, S3, S4 |
| `an armed session still refuses a dollar it cannot place as a literal directory` | `tests/publish-command.test.mjs` | armed and unchecked, each is `deny`: `cd $S && git commit -qm f` (no assignment); `S=$(pwd); cd $S …`; `S=<tmp> S2=x; …`; `export S=<tmp>; cd $S …`; `S=<tmp>; S=/other; cd $S …`; `S=<tmp>; read S; cd $S …`; `S=<tmp>; cd ${S} …`; `S=<tmp>; cd $S/.. …`; `S=<tmp>/..; cd $S …`; `S=..; cd $S …`; `S="<tmp>"; cd $S …` and `S=<tmp>/\x; cd $S …` (quoted or escaped spelling); `S='<tmp> x'; cd $S …`; `S=-C; …`; `S=a,b; …`; `IFS=,; S=<tmp>; cd $S …`; `IFS=/; S=<tmp>; cd $S …`; `CDPATH=<tmp>; S=<tmp>; cd $S …`; `S=<tmp>; mkdir -p $S/y …`; `S=<tmp>; rm -rf $S/y && …`; `S=<tmp>; git -c core.hooksPath=$S commit …`; `S=<tmp>; git commit -qm $S`; `S=<tmp>; $S commit …`; `GIT_DIR=<tmp>; cd $GIT_DIR …`; a push | none | S1, S2, S3, S4 |
| `an admitted row run under bash commits only into the repository it created` | `tests/publish-command.test.mjs` | supplementary, NOT in the Acceptance fence (a skip on a git without config hooks would fail the fence's `grep -x`): executes each admitted row of the first test in a sandbox the test creates, with an outer repository in the sandbox and `HOME` set to the sandbox (CLAUDE.md §9), and asserts the commit lands in the repository the row created and the outer repository's HEAD is unchanged; re-measures that a target repository's own config does not switch off an injected hook | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests (two in the fence) |
| 2 — something selects it | `publishUnchecked`'s armed branch calls `leavesHookInPlace`, which calls `freshDirectoryText`; the data test drives the real PreToolUse hook, so dropping the admission turns it red |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the PreToolUse decision |
| 4 — it is used | a live armed session staging a scratch repository; nothing measures this yet |

## Mutation Log

## Invariants

- No `$` outside a literal directory variable used as a directory operand is ever admitted.
- A text whose publish invocations include a push gains nothing from this task.
- The unarmed arm (`freshRepositoryCommit`), PowerShell and the reviewer guard are unchanged.

## Risks

- The admission turns a refusal into advice that rests on git's hook. Where git's hook cannot start, it says it did not judge the event; ADR-086 Consequences names this and it applies here too.

## Stop Condition

Stop and ask if any twin row is not `deny` after S4, if `segmentVerdict`'s change admits any assignment other than a literal directory one, if `freshRepositoryCommit` changes its answer for any row, or if a test the steps edit has become locked.

## Out of Scope

- The unarmed arm (deferred: docs/BACKLOG.md §367)
- A value not stated as a plain literal (permanent: boundary: the hook judges the command's own text)

## Verification Log
