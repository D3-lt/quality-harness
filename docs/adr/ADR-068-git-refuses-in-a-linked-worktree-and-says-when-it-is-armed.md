# ADR-068: Git refuses in a linked worktree too, and the session is told when it is armed

**Status:** Accepted
**Date:** 2026-09-27
**Owner:** Zy
**Spec:** None — no spec stage; ADR-066's Follow-ups and BACKLOG §304 items 3 and 4, the second record the owner chose on 2026-09-27
**Cross-references:** docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-067-the-publish-classifier-reads-the-command-as-the-shell-splits-it.md, docs/BACKLOG.md
**Governs:** plugin/scripts/publish-hook.mjs, plugin/scripts/lifecycle.mjs, plugin/scripts/publish-verdict.mjs, plugin/scripts/tree-facts.mjs
**Enforced-by:** `tests/publish-hook.test.mjs::an unchecked commit in a linked worktree of the session's repository is refused`
**Invalidates:** none — checked. ADR-066 Decision 2's "a repository holding no log for that session is not this session's project" is narrowed, not reversed: a linked worktree of a repository that holds the log is the session's project.
**Served-path change:** an unchecked `git commit` or `git push` in a linked worktree of the session's repository is refused by git's hook, as it is in the main checkout; and after a compaction or resume, SessionStart says that git's refusal arms only from the next prompt.

## Context

ADR-066 moved the publish refusal into git's own `prepare-commit-msg` / `pre-push` hook. The hook decides "is this the session's project?" by whether the repository it runs in holds a session log for `CLAUDE_CODE_SESSION_ID`. That keeps a scratch repository's commit out of it, which was the point (a scratch-repository commit refused on 2026-09-26).

A linked worktree (`git worktree add`) keeps its OWN state directory, on purpose: two worktrees must not read each other's checks as their own (event-log.mjs `stateDir`, Codex review of 2.108.0). So the worktree holds no session log, and the hook passes it.

Measured 2026-09-27 on git 2.55.0, a scratch repository with a session log in its main checkout, through `runPublishHook`:

| Where the unchecked commit is | Hook exit |
|---|---|
| the main checkout | 1, refused |
| a linked worktree of it | 0, passed |

Rule P's text refusal does not cover the gap either. It judges the tree of the session's working directory, so `git -C ../wt commit` is judged against the main checkout. ADR-066 recorded why text cannot say which repository a command commits into. So an unchecked commit in a worktree passes both refusals. BACKLOG §304 item 3 recorded this as a question; it is a fail-open.

§304 item 4: after a compaction, the exports SessionStart writes to `CLAUDE_ENV_FILE` reach the Bash tool only from the next USER prompt. Measured 2026-09-26 in the session that built 3.0.0: three commits between the compaction and that prompt ran without git's hook. It fails safe, because the text refusal still applies, and it is silent: the session is not told that git's refusal is not yet in place. ADR-066's Follow-up asked whether to say so. The timing is Claude Code's, and the plugin cannot change when the env file is sourced.

The class, every place that decides "is this repository this session's project" for the refusal, enumerated with:

```bash
grep -n "readEvents(cwd, session).length === 0\|not this session's project" plugin/scripts/*.mjs
```

Run 2026-09-27: one site, `plugin/scripts/publish-hook.mjs`.

## Existing Primitives Audit

- **`runPublishHook`**: its no-log gate is narrowed; everything after it is unchanged.
- **`stateDir` / `readEvents`**: unchanged. The worktree keeps its own state, so its checks stay its own.
- **`publishVerdict`**: unchanged. On a worktree with no events of its own, it already answers "unchecked" until a `qh-check` runs in that worktree, which records there.
- **`offerPublishHook`** and the SessionStart output (ADR-066 T2): T2 adds one line where `publish.offered` is logged and no `publish.hook-ran` follows it.

## Decision

1. **A linked worktree of the session's repository is the session's project.** When the repository git runs the hook in holds no log for the session, the hook asks git for the COMMON git directory (`git rev-parse --git-common-dir`). If that repository's state holds the session's log, the hook judges the worktree, against the worktree's own checks, exactly as it judges the main checkout. A repository whose common directory holds no log is still not the session's project, so the scratch-repository case keeps passing.

2. **The session is told when git's refusal is not yet armed.** When SessionStart runs with `source` `compact` or `resume`, has just offered the hook, and the log shows no `publish.hook-ran` since the offer, its output says so in one line: git's refusal takes effect from the next prompt, and until then the text refusal applies. It blocks nothing and changes no verdict.

**What would make this fail:**
- an unchecked commit in a linked worktree that exits 0;
- a checked worktree's commit refused;
- a scratch repository's commit refused (the ADR-066 case);
- the armed line missing after a compaction with no hook run, or printed when the hook has run.

T1 and T2 build each of these as a test.

## Alternatives Considered

- **Share one state directory across worktrees.** Rejected: the 2.108.0 review found two worktrees then read each other's checks as their own, which is the defect this project exists to demonstrate the absence of.
- **Have rule P's text refusal resolve `git -C <dir>` and `cd <dir> && git …`.** Rejected: ADR-066 recorded that text cannot say which repository a command commits into, and git's hook sees the real one.
- **Arm the session by rewriting each Bash command to source the env file (`updatedInput`).** Rejected: it edits the user's commands to fix a timing the host owns; saying so costs one line and changes nothing the session runs.

## Component / Boundary Impact

- **`publish-hook.mjs`** gains the common-directory lookup.
- **`lifecycle.mjs`** SessionStart gains one line.
- No new boundary; the host and git interfaces are ADR-066's.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| git's `prepare-commit-msg` / `pre-push` hook | a linked worktree of the session's repository is judged | T1 | git |
| SessionStart output (`compact`, `resume`) | one line when offered but not yet armed | T2 | Claude Code, the session |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| none | — | — | No — T1 and T2 are independent |

## Implementation

See `tasks/README.md`:
- T1: git's hook judges a linked worktree of the session's repository.
- T2: SessionStart says when git's refusal is not yet armed.

## Consequences

- **Positive:** the refusal holds in a worktree; a session after a compaction knows which refusal is in force.
- **Negative:** one more `git rev-parse` per hook run where the repository holds no log (about 10 ms, measured with the other git calls in ADR-066).
- **Neutral:** a worktree's first commit needs a `qh-check` run in that worktree, as a new checkout does.

## Out of Scope

- Changing when Claude Code sources `CLAUDE_ENV_FILE` (permanent: boundary: the host owns that timing)
- `reference-transaction` for merges, rebases and cherry-picks (deferred: docs/adr/ADR-066-git-refuses-an-unchecked-publish.md Follow-ups, an owner decision)
- Submodules (deferred: docs/BACKLOG.md §306, no case measured)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A worktree the session never meant to publish from is refused | Low | Low | it is refused only while unchecked; `qh-check` there, or `"publish": "warn"`, as anywhere |
| `--git-common-dir` answers relative to cwd on some gits | Med | Med | resolve it against cwd; T1 tests a worktree outside the main checkout's directory |

## Rollback

Revert the commits. Nothing is written into any repository; the log lookup only reads.

## Follow-ups

- [ ] After a release, count `publish.offered` without a following `publish.hook-ran` per session (session-profile), to size the unarmed window.
