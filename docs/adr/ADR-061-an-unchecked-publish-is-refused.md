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

**Revision 2, 2026-09-22, before release (Codex review, xhigh, REQUEST CHANGES; the owner chose to fix all).** Three more defects were found, each now pinned in `tests/fail-open.test.mjs`. (1) A later `qh-check` that timed out, never started, or could not observe its tree outranked an earlier pass and was denied, which broke this record's own rule that a could-not-look does not refuse. Such a check is now a could-not-look standing: it warns, says unknown, and certifies nothing. (2) An unobservable write was cleared by any pass later in the LOG, and the importer can append a pass recorded before the write after it. A write now records how many check records existed when it happened (`checksSeen`), and only a pass with a higher `seq` covers it. A check that started before the write and finished after it still covers it; that residual is named, not closed. (3) The index-only warning said a check had passed when none had and the tree merely equalled the session start. The wording now follows the tree's actual standing.

**Revision 3, 2026-09-22, before release (owner's decision).** The refusal stays the default, and a project can turn it back into the warning with `"publish": "warn"` in `.quality-harness.json`. This is needed because the refusal is the one exception to the rule that gates advise (CLAUDE.md §3), and an adopter who wants the old contract should not have to fork. Only the exact value `"warn"` counts. Any other value is reported as ignored and keeps the refusal, so a typo cannot silently disable it. `tests/fail-open.test.mjs::a project can turn the publish refusal back into a warning, and only on purpose` pins both directions.

**Revision 4, 2026-09-22, before release (second Codex review, xhigh, REQUEST CHANGES; the owner chose to fix all).** Revision 2's could-not-look exemption also counted the INDEX, so an index whose check timed out rescued a working tree whose check FAILED. That was a fail-open, introduced by the fix. Only the tree's standing now decides the refusal, and an index that cannot be established has its own warning. A write whose check count was taken and failed (`checksSeen: null`) now stays outstanding instead of falling back to log position; only a record with no count at all, written before this field existed, falls back. The session note and the R1 and R2 advisories now say a check "could not observe" the tree rather than "no `qh-check` has passed" when one did pass. Codex judged the named residual — a check that starts before a git-invisible write and finishes after it — not soundly closable with the fields `checks.jsonl` records, because `seq` orders completions and a backward clock defeats `before.at`. It stays named.

**Revision 5, 2026-09-22, before release (third Codex review; the owner chose to fix all and push).** The opt-out is now read from the same root lookup the refusal was decided on. A second lookup that failed fell back to the current directory, which missed the root's `"publish": "warn"` and refused, or honoured a nested file instead. A failed lookup is now unknown and never refuses. When the working tree passed and the index could not be checked, the warning now says "not known to be checked" instead of "unchecked". R2 over several commits says "at least one of" when only some trees could not be established. The documentation no longer calls this "the one" refusal: ADR-060's reviewer guard also refuses, for read-only roles only.

**Revision 6, 2026-09-22, before release (the CI mutation campaign on 0150376).** The move from timestamp order to log order also let a check that was already running cover a write made during it. The test that asserted the opposite had been weakened in the first commit of this work, and that removed the only assertion keeping an R1 mutant RED; CI reported that mutant GREEN. A pass now covers a git-invisible write only when both orders agree: its record is newer (`seq`), and it started after the write (`startedAt`). The residual named in revisions 2 and 4 narrows to a clock that steps backwards during a check. A backward step at any other time now leaves the write outstanding, which is the cautious direction.

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
- [ ] A publish launched from a script file (`sh do-it.sh`, `python3 helper.py`) is not observed at
  all. The honest refusal is a git `pre-commit`/`pre-push` hook reading the same ledger (BACKLOG §269).

## Amended 2026-09-23 — what the refusal matches

The word match this record accepted ("a command that merely mentions either word is still refused …
a known false refusal") was measured for one day (BACKLOG §269): each false refusal taught the session
to put the text in a script file, and the same file then carried a real publish through unobserved —
fifteen such scripts in one session, one of which pushed a version bump on a tree no check had passed.
The classifier now matches an INVOCATION of `git commit` or `git push` — `git`, its options and their
values, the verb, through the quoting of `bash -c`, `pwsh -Command` and an argv list — and the
refusal names the invocation it saw. Scope (commit and push; the text of the Bash command; the
`"publish": "warn"` opt-out) is unchanged. What a script file launches was unobserved before and
still is; that is the follow-up above, and it is the honest one.

Same day, third round: a classifier over shell text does not converge — each review found forms it
missed (`"git" push`, `then git push`, `bash -lc`, `sudo -n`, a `--help` anywhere later suppressing a
real push) and data it refused (`echo "x; git push"`). So the mechanism is now two arms with different
authority (CLAUDE.md §16): the precise invocation match is the only thing that REFUSES, and the word
match this record originally accepted is kept as the WARNING arm — a form the precise arm misses is
warned about, never silent; a mention it wrongly matches costs a line, never a refusal. Both are
executed as tables in `tests/publish-command.test.mjs`.
