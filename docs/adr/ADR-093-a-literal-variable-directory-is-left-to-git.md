# ADR-093: An armed session leaves a commit into a literal-variable directory to git

**Status:** Proposed
**Date:** 2026-10-09
**Owner:** Zy
**Spec:** None — no spec stage; the owner asked on 2026-10-09 for the scratch-repository false refusal measured that day (docs/BACKLOG.md §367) to be fixed, armed arm only
**Cross-references:** docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-086-a-fresh-repository-commit-is-not-refused.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. T1 adds campaign mutations per `Rests-on` name; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-086 — the clause of its Decision 1 that admits a `$` only for a fresh-directory variable (a `mktemp -d` substitution): in an armed session a variable whose value the text states as a plain literal is admitted as a directory operand too. Its unarmed arm (Decision 2) and every twin row it keeps are unchanged.
**Served-path change:** PreToolUse rule P, in an armed Bash session, advises (ADR-066's existing advice) instead of refusing a commit whose only `$` words are a literal-assigned variable used as a directory operand, so `S=/tmp/x; mkdir $S/y && cd $S/y && git init -q && git commit …` is judged by git's own hook.

## Context

- **The refusal (measured 2026-10-09, `main` at `2c9bb465`).** With no `qh-check` passed on the tree, a Bash command that built a scratch repository under the session's temp directory through a variable (`rm -rf $S/x && mkdir $S/x && cd $S/x && git init -q && git -c user.email=a@b -c user.name=n commit …`) was refused by PreToolUse rule P, in a session whose log held `publish.hook-ran` and whose environment held `GIT_CONFIG_COUNT`. BACKLOG §367.
- **What decides it (read at `34b808f0`).** `leavesHookInPlace` (`plugin/scripts/lifecycle.mjs:5864`) returns false when any `$` or backtick remains after `freshDirectoryText` (`:5826`) has made a fresh-directory variable's uses plain (`:5871`). A fresh-directory variable is only `V=$(mktemp -d <literal>)` (`freshDirectoryVariables`, `:5714`). A variable the text assigns a plain literal is not one, so `$S` keeps the refusal.
- **Replayed through the real hook (2026-10-09, a copy of this session's log in a scratch state directory, armed).** `mkdir /tmp/x && cd /tmp/x && git init -q && git commit …` and `cd /tmp/x && git init -q && git commit …` were not denied; `S=/tmp/x; mkdir $S/y && cd $S/y && git init -q && git commit …` was `deny`. The same text with a literal path is left to git; the variable is the only difference.
- **Why a literal-assigned variable is knowable, and the one way it is not.** The hook reads the command's own text. When the text assigns `S=/tmp/x` once, as a bare unquoted assignment of path characters only, `$S` is that literal: no glob, no leading `-`, no command substitution. `IFS` is the one way to split a plain value. Measured 2026-10-09 under bash: `IFS=,; S=/tmp/q,commit,--no-verify,-n; git -C $S commit` hands git `-C /tmp/q commit --no-verify -n commit`, and `IFS=/` splits `/tmp/q` into `tmp` and `q` (the cold review found this; zsh does not split, `/bin/sh` does). So the text must not name `IFS` or the other shell-special names at all. An inherited or computed value is not visible and stays refused. ADR-086 measured that in an armed session a directory operand, wherever it points, cannot remove git's own refusal (git 2.56.0, 2026-10-06), so what remains to exclude is a variable that changes the hook's environment or injects arguments.
- **The class: every site that decides a publish refusal on a command's text.** Enumerated 2026-10-09 with `mrw read --grep 'publishUnchecked|publishCommandIn|leavesHookInPlace|readOnlyVerdict|publishVerdict' plugin/scripts plugin/bin`; the sites are those ADR-086 listed. Only the armed predicate `leavesHookInPlace` changes; `freshRepositoryCommit` (the unarmed arm) reads `freshDirectoryVariables` and must not see the new variables.
- **CLAUDE.md §16 governs.** A block needs stronger evidence than advice, and every exemption has a "this is code again" twin. Each admitted shape below turns a refusal into advice, never into silence, and each has a twin that stays `deny`.

## Existing Primitives Audit

- **`freshDirectoryVariables`** (`lifecycle.mjs:5714`): not changed. The unarmed arm consumes it, so widening it would widen that arm. A sibling `literalDirectoryVariables` is added beside it (reshape: same walk over `shellWords` commands, a different value test).
- **`freshDirectoryText`** (`:5826`) and **`directoryOperands`** (`:5750`): reused. `freshDirectoryText` takes the union of both variable sets; `directoryOperands` gains `mkdir` and a plain path suffix on the operand.
- **`segmentVerdict`** (`:5643`): its assignment rule returns -1 for any `NAME=` segment; a literal directory variable's assignment returns 0, as the fresh one does.
- **`HOOK_ENVIRONMENT_NAMES`** (`:5711`), **`ARITHMETIC`** (`:844`), **`maskedMessages`** (ADR-090): reused, not restated.
- **`armedSession`** (`tests/publish-command.test.mjs:325`): the tests drive the real PreToolUse hook through it, armed and unarmed.

## Decision

A **literal directory variable** is a name `V`, outside `HOOK_ENVIRONMENT_NAMES` and outside the shell-special names (`IFS`, `CDPATH`, `PWD`, `OLDPWD`, `SHELLOPTS`, `BASHOPTS`, `PS4`, `PROMPT_COMMAND`, `BASH_*`), assigned exactly once in the command text as a bare assignment command `V=<value>`. The value is spelled unquoted and unescaped in the raw text (the parser strips quotes, so the spelling is checked against the text) and matches `^/?[\w.][\w./-]*$` with no `.` or `..` segment: it holds no `$`, backtick, quote, glob, brace, space, comma, colon, `@`, `%`, `+` or leading `-`. `V` is named nowhere else as a word (`export V`, `local V`, `read V`, `for V`), and the text names no shell-special name anywhere, `IFS` above all.

In an armed Bash session, `leavesHookInPlace` treats a use of a literal directory variable as plain when the word is `$V`, `"$V"`, `$V/seg…` or `"$V/seg…"` (each `seg` plain, not `.` or `..`) and stands as the sole operand of `cd`, the sole operand of `mkdir` (no option), the value of `git -C`, or the directory operand of `git init`. These operand forms apply to literal directory variables only: a fresh-directory variable keeps exactly ADR-086's admission (`$V` and `"$V"` as `cd`, `-C` and `init` operands), so ADR-086's rows are unchanged. Every other `$` or backtick still returns false, and every other rule of the function (`.git/`, `hookspath`, environment names, arithmetic, a push in the text) still runs over the whole text. Git's hook then judges the repository the commit lands in. Nothing about the unarmed arm, a push, PowerShell, git's own hook, the `"publish": "warn"` opt-out or the reviewer guard changes.

**This fails if**, through the real PreToolUse hook, any twin row of T1's refusal test is not `deny` on an unchecked tree, or if a data row is refused, or if a data row run under bash commits anywhere but the repository it created. Valid for POSIX shells under the Bash tool, git 2.56.0, bash 3.2.57 and zsh 5.9.2 on macOS (ADR-086's measurements); another git or shell is unmeasured.

## Alternatives Considered

- **(a) Leave it as is.** The literal-path spelling already passes in an armed session. Rejected: a scratch directory held in a variable is the ordinary spelling, and every false refusal teaches a session to route git through a script, the channel BACKLOG §269 measured carrying a real unchecked publish.
- **(b) Admit the literal-assigned variable, as decided.** Chosen: it uses only what the text states and widens ADR-086's own admission by one value test.
- **(c) Admit any `$NAME` as a directory operand.** Rejected: an inherited value is invisible, can hold spaces or `-c core.hooksPath=…`, and `git -C $S` would split it into arguments.
- **(d) Extend the unarmed arm to `mkdir` or a literal variable.** Deferred: the unarmed proof admits no program in the chain and took several review rounds for `mktemp` alone.
- **(e) `"publish": "warn"`.** Rejected as the fix, as in ADR-086 (c): it turns every refusal in a project into a warning.

## Component / Boundary Impact

None — internal to rule P in `plugin/scripts/lifecycle.mjs`. The host boundary, git's hook and the session log's events are unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PreToolUse `permissionDecision` for a Bash command in an armed session | a commit whose `$` words are literal directory variables used as directory operands gets ADR-066's advice instead of `deny` | T1 | Claude Code |

## Inter-task Contracts

None

## Implementation

See `docs/adr/ADR-093-a-literal-variable-directory-is-left-to-git/tasks/README.md`.

## Consequences

- **Positive:** a session can stage a scratch repository under a variable-held path in one Bash command without routing git through a script.
- **Negative:** an unarmed session still refuses the same text, and in an armed session where git's hook cannot start, the scratch-to-checkout fail-open ADR-086 names applies to these forms too.
- **Neutral:** one more shape of advice in armed sessions; ADR-086's twin rows `cd "${R}"` and `cd "$R/.."` stay refused for a fresh variable (brace and `..` are not admitted here either).

## Out of Scope

- The unarmed arm (deferred: docs/BACKLOG.md §367, ADR-086 Alternative (e))
- `rm` or any other command taking a variable operand (permanent: boundary: only the directory operands of `cd`, `mkdir`, `git -C` and `git init` are read; a deletion operand is data loss, not set-up)
- A value not stated as a plain literal in the text (permanent: boundary: the hook judges the command's own text, as `leavesHookInPlace` already says)
- A push (permanent: boundary: `git remote add o <this checkout> && git push o` publishes into this checkout)
- PowerShell and ADR-060's reviewer guard (permanent: boundary: `shellWords` reads POSIX shell text; a read-only role commits nowhere)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A literal variable reaches a repository whose config removes git's hook | Low | High | ADR-086 measured that local `command`, `event`, `enabled` and `core.hooksPath` do not (git 2.56.0, 2026-10-06); T1 re-measures in its executing test |
| A name the text assigns plainly but another form redefines (`export V`, `read V`, a second assignment) | Low | High | the variable must be assigned once and named nowhere else; twins for each |
| Advice read as permission to commit into this checkout | Low | Low | the advice is ADR-066's, which names git's hook as the judge and `qh-check` as still needed |

## Rollback

Revert T1's commit. No stored format changes.

## Follow-ups

- [ ] Owner decision: amend CLAUDE.md §3's sentence on the sanctioned refusals to name this exemption once Accepted, as ADR-086's Follow-up 1 asks for its own.
