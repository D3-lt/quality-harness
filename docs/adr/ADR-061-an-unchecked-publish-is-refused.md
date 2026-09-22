# ADR-061: An unchecked publish is refused

**Status:** Accepted
**Date:** 2026-09-22
**Owner:** zy
**Spec:** None — no spec stage. The owner chose, on 2026-09-22, to close the fail-open holes and to refuse an unchecked publish rather than only warn.
**Cross-references:** ADR-005, ADR-060
**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/qh-check.mjs`
**Enforced-by:** `tests/fail-open.test.mjs::a constant success is not a check and an unchecked publish is refused`
**Invalidates:** none — checked
**Served-path change:** A command that names commit or push is refused, not merely warned, when the session log was read whole and the tree or index has no passing check.

## Context

ADR-060 records a check and warns before a command whose text contains `commit` or `push`. Measured on the shipped tree, 2026-09-22: a declared `check` of `true`, `:`, `exit 0`, `sh -c true` and `bash -c 'exit 0'` each exits 0, and `declaredCheckCommand` accepts any non-empty string, so that pass certifies. `unobservableWrites` keeps a write only when its timestamp is greater than the last pass, so a clock stepping backwards hides it. Two compact SessionStarts can both serve one note, because the serve is a read of the log followed by a separate append. `gitRepositoryRoot` returns null both when the directory is not a repository and when git does not answer.

## Existing Primitives Audit

`deliver` already turns an action with `deny` into `permissionDecision: deny` for the reviewer guard. `repositoryDiscovery` already splits a timed-out root query from "not a repository" inside `qh-check`. `firstMentionThisSession` already claims a name with `flag: 'wx'`. This decision reuses those three. It does not revive command-structure parsing.

## Decision

When the session log was read whole and the tree or the index differs from the session start and is not `check.passed`, rule P denies the command. When the log is incomplete, or the check events for that tree cannot be ordered, P warns and does not deny: a could-not-look must not refuse the command.

A declared check that is only a constant success (`true`, `:`, `exit 0`, or one layer of `sh -c` / `bash -c` around those, executed 2026-09-22) is refused. The origin is `refused` and no inferred command is substituted. `sh check.sh` and `npm test` stay declared. A zero-test summary stays `no-work`.

A write git cannot see stays outstanding until a later `check.passed` in a log read whole. An incomplete log leaves it outstanding. An order among check events that cannot be established is said as could-not-order, not as "no `qh-check` has passed".

A compact SessionStart claims the compaction id with an exclusive create before it serves the note. The second claimant does not serve it.

`git rev-parse` that errors or times out is not "not a repository". Callers that would otherwise certify or go silent on that answer say they could not look. A non-zero status with no spawn error remains "not a repository".

What would make the deny fail: a whole log, a tree that differs from the session start, and no `check.passed` for it, followed by `git commit` still running. That fixture can be built today in a temporary repository.

**Revision, 2026-09-22, before release (owner's decision).** Only the tree refuses. An index that differs from the session start and matches no checked tree warns, and the warning says the staged index is unchecked, not that no check passed. A check runs on the working tree, and `tree` includes unstaged and untracked files. So a staged change beside an untracked file equals no checked tree, and the first form denied it after every passing check. A peer found this live on PlayTrix; it was reproduced in a temporary repository, and `tests/fail-open.test.mjs::a passing check on the tree is not refused because the index differs from it` pins it. The word match on `commit` and `push` is unchanged: a command that merely mentions either word is still refused on an unchecked tree. The session that wrote this revision was refused that way itself, on a Bash command whose heredoc body contained the word. That is a known false refusal. Narrowing it needs command parsing, which ADR-060 retired.

## Alternatives Considered

- **Keep warning.** Rejected because a model that treats the warning as noise still publishes.
- **Widen the word list so `gh pr merge` is refused too.** Rejected because a list typed from memory is the classifier ADR-060 retired. A publish whose text contains neither `commit` nor `push` still runs; R2 names the commit afterwards.
- **Require every declared check to have failed once before a pass counts.** Rejected because one deliberate failure followed by `true` satisfies it, and it does not reject `true` itself.

## Component / Boundary Impact

None — internal to `lifecycle.mjs` and `qh-check.mjs`. The host already understands `permissionDecision: deny`.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PreToolUse `permissionDecision` | deny when P would have warned and the log is whole | `publishUnchecked` | Claude Code |
| `check` in `.quality-harness.json` | a constant success is `origin: refused` | `checkCommandOrigin` | advisories |
| compaction note | exclusive claim before serve | SessionStart | the next context |

## Inter-task Contracts

None.

## Implementation

One change, in the files this record governs. Acceptance is `node --test tests/fail-open.test.mjs` and `bash scripts/selftest.sh`.

## Consequences

- **Positive:** an unchecked `git commit` or `git push` does not run when the log can be read, and a declared `true` does not certify.
- **Negative:** a command that publishes without those words is still not refused before it runs.
- **Neutral:** other gates stay advisory.

## Out of Scope

- Refusing a publish whose text contains neither `commit` nor `push` (permanent: boundary: recognizing it before it runs is the parser ADR-060 retired).
- Making every advisory a denial (permanent: boundary: the owner refused only the unchecked publish).
- Proving an arbitrary declared command can fail, beyond rejecting a constant success and the existing zero-test summary (permanent: boundary: one staged failure does not make the command honest).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A torn log is mistaken for unchecked and the commit is refused | Low | High | incomplete and unordered logs warn and do not deny |
| A real check wrapped as `sh -c 'npm test'` is refused | Low | Med | only one layer around `true`, `:`, or `exit 0` is refused |

## Rollback

Revert the commit. The deny is a host permission on one command; no stored format changes except the compaction claim files under the existing marker directory, which are safe to delete.

## Follow-ups

- [ ] A publish that does not contain `commit` or `push` is still not refused before it runs.
