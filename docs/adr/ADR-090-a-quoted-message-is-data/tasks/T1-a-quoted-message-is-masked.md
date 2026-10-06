# Task ADR-090-T1: a quoted commit message is masked before the downgrade rules read the text

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one helper and three call sites in one file, its tests and campaign entries)
**Owner:** unassigned
**Produces:** `maskedMessages(text)` — the text with each message value of ADR-090 Decision 1 replaced by `msg`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a quoted message value is masked before the downgrade rules read the text`, `a value that is not one quoted literal keeps today's verdict`, `a spelling that occurs twice is not masked`

## Goal

Rule P no longer refuses a commit, in ADR-066's armed downgrade or ADR-086's fresh-repository downgrade, whose
only blocking text is a quoted `-m`/`-F` value; every value that could run code, and every rule outside that
one position, decides as it does today.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `maskedMessages(text)` (new, beside `freshDirectoryText`), sharing `plainGitArguments`' short-cluster rule (`:4941`) rather than restating it; called first in `freshRepositoryCommit` (`:855`), `freshDirectoryText` (`:5090`) and `leavesHookInPlace` (`:5125`). Those three calls are what select it: `publishUnchecked` (`:5258`) reaches them unchanged |
| `tests/publish-command.test.mjs` | edit | three new tests beside the 115 locks, through `armedSession` |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/publish-command.test.mjs`, then write the three tests in the
   Tests table and record the red run (TDD red). Every path is assembled at runtime from the test's own
   temporary directory (CLAUDE.md §6). Red today: every data row is `deny`.
2. [S2] Add `maskedMessages(text)`. For each `shellWords` command whose argv[0] is literally `git` and not
   dynamic, and whose verb by `gitVerbIndex` is the literal `commit`, walk the arguments before any `--` with
   `plainGitArguments`' cluster rule and collect each value of `-m`, `--message`, `-F`, `--file`,
   `--message=` and `--file=`. Keep a value only when its word is not `dynamic` and its value part (the whole
   word, or the text after `=` or after the valued letter) is one quoted span whose source spelling — `'v'`, or
   `"v"` with `v` holding no `"` or `\` — occurs exactly once in the text. Replace each kept spelling with
   `msg`. Return the text unchanged when anything is unproven.
3. [S3] Call it first in `freshRepositoryCommit`, `freshDirectoryText` and `leavesHookInPlace`, so every
   existing rule reads the masked text. Nothing else changes.
4. [S4] Record one killed mutant per Rests-on name and add each to `tests/mutations.json`: one that drops the
   masking (the data test goes red), one that masks a dynamic or unquoted value (the twin test goes red), and
   one that drops the uniqueness guard (the twin test's `.git/hooks` row goes red). [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \
  && for t in 'a quoted commit message is data to the armed and fresh-repository downgrades' 'a message value that can run code keeps the refusal' 'the masked fresh-repository rows commit where the classifier says they do' 'an unarmed commit into a repository the command creates is advised, not refused'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a quoted commit message is data to the armed and fresh-repository downgrades` | `tests/publish-command.test.mjs` | on an unchecked tree none is `deny`. Unarmed, after `R=$(mktemp -d <tmp>/x.XXXX) && cd "$R" && git init -q && git commit -q --allow-empty`: `-m "push the fix"`, `-m "a;b"`, `-m "use ((x)) here"`, `-m "let it be"`, `--message="push the fix"`, `-m 'push; then {braces} and !bang'`, `-m "fix PATH handling"`, `-m "a\|b"`, `-m '$(git push)'`. Armed, `cd <tmp>/scratch && git commit`: `-m "fix PATH handling"`, `-m "see .git/config"`, `-m 'costs $5'`, `-m "env cleanup"`. ADR-090 Context, rows D1-D16 and T14 | none | S1, S2, S3 |
| `a message value that can run code keeps the refusal` | `tests/publish-command.test.mjs` | on an unchecked tree each is `deny`. Unarmed fresh: `-m "$(git push)"`, ``-m "`git push`"``, `--message="$(git push)"`, `-m "$GIT_DIR"`, `-m x; git push`, `-F <(git push)`, `-m "${x:-$(git push)}"`, `-m x && git push`, `-m "push" && git push`, `-- -m "push"`, `-Fm "push"`, `-m push`. Armed: `-m "$(git -C <session repo> commit -qm y)"`, `-nm "push"`, `-m {x,--no-verify}`, `-m x; GIT_CONFIG_COUNT=0 git commit -qm y`, `-m '.git/hooks' && cp x '.git/hooks'`. CLEAN twin: after `qh-check`, none is `deny` | none | S1, S2, S3 |
| `the masked fresh-repository rows commit where the classifier says they do` | `tests/publish-command.test.mjs` | each unarmed data row above, run under `bash -c` in the session repository with ADR-086 T2's environment, leaves the session repository's `HEAD` unchanged and creates one commit in the directory `mktemp` made, whose message is the value as written. This turns the record's reading of the data rows into a measurement | none | S1 |
| `an unarmed commit into a repository the command creates is advised, not refused` | `tests/publish-command.test.mjs` | ADR-086 T2's test, unchanged and locked: the masking narrows nothing ADR-086 already advised | none | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | the three predicates call `maskedMessages` first; the data test drives the real PreToolUse hook, so dropping a call turns its rows red |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the PreToolUse decision |
| 4 — it is used | a session committing a scratch repository with a quoted message; nothing measures this yet |

## Mutation Log

## Invariants

- No dynamic, unquoted or repeated value is masked.
- Only a value of `commit`'s `-m`, `--message`, `-F` or `--file`, before `--`, is masked.
- `publishCommandIn`, `commitOnlyCommand`, `mentionsCommitOrPush` and the reviewer guard read the unmasked text.

## Risks

- The source spelling of a double-quoted value cannot be rebuilt when it holds `"` or `\`; such a value is
  not masked and keeps today's verdict, which is the conservative side.

## Stop Condition

Stop and ask if any twin row is not `deny` after S3, if a data row commits outside its own directory in the
executing test, or if a test the steps edit has become locked.

## Out of Scope

- The lexer and wrapper readings — T2 and T3. An unquoted value and `-m "$(cat <<'EOF' … EOF)"` — ADR-090 Out of Scope.

## Verification Log
