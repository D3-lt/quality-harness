# ADR-104: A commit whose literal `-C` path names another repository is not this checkout's publish

**Status:** Proposed
**Date:** 2026-10-15
**Owner:** Zy
**Spec:** None — no spec stage; the owner asked on 2026-10-15 ("proceed", answering whether the sign-off on pending items meant drafting this record) for BACKLOG §367's false refusal to get a record
**Cross-references:** docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-068-git-refuses-in-a-linked-worktree-and-says-when-it-is-armed.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md, docs/adr/ADR-086-a-fresh-repository-commit-is-not-refused.md, docs/BACKLOG.md, .claude/rules/16-classifiers-are-empirical.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per mechanism; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-061 — its text refusal no longer refuses a Bash `git -C <absolute literal> commit` whose target's git directory, probed at the hook, is not this checkout's; that commit is advised instead. ADR-086 — Alternative (e), deferred there, is taken here with the rows it asked for. ADR-081 — `commitOnlyCommand` accepts `-c user.<key>=<value>` before the verb, as `plainPublishes` already does (T2).
**Served-path change:** PreToolUse rule P advises, rather than refuses, a Bash `git -C <absolute path> commit` into a repository whose git directory differs from this checkout's, on an unchecked or fast-pass tree, armed or not; and a fast pass admits one `git -c user.name=… commit`.

## Context

- **The refusal, observed 2026-10-15 in this repository.** On a tree where only the fast check had passed, rule P refused
  `git -C <scratchpad>/fx-vitest -c user.email=… -c user.name=… commit -qm base; echo "commit exit $?"` (and its `fx-jest` twin)
  with "this one is not proven to be one commit". The scratch directory is a fixture repository under the session's temp
  directory; the commit publishes nothing from this checkout. BACKLOG §367 recorded the same class on 2026-10-09 (`git init … &&
  git commit` in a scratch repository, refused on an unchecked tree) and §371 (1) its advice-only twin.
- **Why it refuses (read 2026-10-15 at `b483d1db`).** Three separate reasons, one per path:
  - fast pass: `commitOnlyCommand` (`plugin/scripts/publish-command.mjs:35-54`) needs one command (`:40`) and admits only
    `-C` and `--no-pager` before the verb (`:47-52`), so both the `; echo` and the `-c user.*` defeat it;
  - armed: `leavesHookInPlace` (`:1133`) returns false for any `$` (`:1140`), here the `$?` in the trailing echo;
  - unarmed and unchecked: nothing in `publishUnchecked` (`plugin/scripts/publish-verdict.mjs:331-363`) looks at where a
    literal `-C` points; `publishVerdict` judges the session's working directory.
- **ADR-086 deferred exactly this as Alternative (e)**, "never observed", asking for measured symlink, `/private/tmp`,
  case-folding and `..` rows and "this is code again" twins. It is now observed, and the rows are below.
- **Measured 2026-10-15** (git 2.56.0, macOS, throwaway repositories in the scratchpad: `A` standing for the session's
  repository, its subdirectory `A/sub` as the working directory, `B` a separate repository). Each row is
  `git -C <path> rev-parse --path-format=absolute --git-common-dir`, then `fs.realpathSync.native`:

  | `-C` path | Result |
  |-----------|--------|
  | `.` from `A/sub`, `..`, `A`'s absolute path, `../../A` | `A/.git` |
  | a symlink to `A` | `A/.git` |
  | a linked worktree of `A` | `A/.git` |
  | a directory whose `.git` FILE says `gitdir: <A>/.git` | `A/.git` |
  | an untracked nested repository `A/nested` | `A/nested/.git` |
  | `B` by its `/private/tmp` path, its `/tmp` path, and its name case-folded | `B/.git`, all three |
  | a path that does not exist | exit 128, "cannot change to" |
  | `B`, with `GIT_DIR=<A>/.git` in the probe's environment | `A/.git` |

  **So the target's identity is decidable at the hook, and a path comparison is not enough:** the gitfile row is a
  directory outside `A` whose commit lands in `A`. Only git's own resolution, compared after `realpath`, sees it.
- **Why this is not ADR-086's rejected Alternative (d).** (d) rejected running the command's own text ahead of it (`$(mktemp
  …)`, `realpath "$R"`). This runs none of it: the probe is a fixed `rev-parse` on a path the text spells literally. What (d)
  feared, an answer that differs from the one the command gets, remains possible only if something changes the target between
  the hook and the command, so the text may run no program before the commit (Decision), and a concurrent writer is named as
  residual (Risks).
- **The class: every site that decides a publish refusal from a command's text.** Enumerated 2026-10-15 with
  `mrw read --grep 'publishUnchecked|publishCommandIn|leavesHookInPlace|commitOnlyCommand|freshRepositoryCommit' plugin/scripts plugin/bin`:
  3 files, `plugin/scripts/on-pre-tool-use.mjs` (the caller), `publish-command.mjs` (the readers) and `publish-verdict.mjs`
  (the decision). The decision has one place to change, beside ADR-086's branch (`:350-358`). `publish-hook.mjs` judges at git's
  event in the repository the commit lands in and needs no change.
- **The `-c user.*` sibling.** `mrw read --grep "argv\[index\] === '-C'|=== '-c' &&" plugin/scripts`, 2026-10-15: three readers
  of git's options before the verb, three answers — `:49` (`commitOnlyCommand`) no `-c` at all, `:105` (`freshRepositoryCommit`)
  `user.name` and `user.email`, `:791` (`segmentVerdict`) any `user.<key>`. T2 gives them one answer.

## Existing Primitives Audit

- **`shellWords`** (`plugin/scripts/shell-words.mjs`): reused as is for the split, the joiners and the dynamic words.
- **`ABSOLUTE`** (`publish-command.mjs:232`) and **`INHERITED_REDIRECTS`** (`:64`): reused, not restated.
- **`plainGitArguments`** (`:757`): reused to vet the commit's own arguments, as `segmentVerdict` does.
- **`publishCommandIn`** (`:720`): reused to prove the text after the commit invokes no publish.
- **ADR-086's branch in `publishUnchecked`** (`publish-verdict.mjs:350-358`): the model for the new branch, its keyed advice
  (`<key>:fresh`) and its Bash-only position.
- **`armedSession`** (`tests/publish-command.test.mjs:331`): the tests drive the real PreToolUse hook through it, armed and unarmed.

## Decision

1. **A literal-path commit is proven by its text (T1).** `foreignCommitPath(command, env, platform)` in `publish-command.mjs`
   returns the path `L` when ALL of these hold, and `null` otherwise:
   - the parse is complete; the hook's environment carries no `INHERITED_REDIRECTS` name;
   - the FIRST command is the only git command and the only publish: `git` with no assignment, substitution, dynamic word,
     unquoted heredoc or redirection; before its verb only `-C L` (required, first) and `-c user.<key>=<value>`; a verb of
     `commit`, whose own arguments pass `plainGitArguments`. One git process discovers its repository once, so nothing the
     command itself runs can move the target between discovery and commit (Codex cold review, P1: a second git step's clean
     filter can re-point a symlinked `L`);
   - `L` is absolute FOR THE PLATFORM — on POSIX it starts with `/`; on Windows a drive letter and a separator, or `/` — and
     holds no `$`, backtick, `~`, glob or `..` segment; `\B` and `C:/B` are not absolute on POSIX (Codex cold review, P2:
     `ABSOLUTE` admits both);
   - every command after the commit is proven data: joined by `;`, `&&` or a newline, its program a literal `echo` or `true`,
     with no assignment, substitution, redirection or heredoc; a `$?` or other parameter in an `echo` argument is data. Not
     "invokes no publish": `publishCommandIn` returning `null` means not recognised, and `g=git; $g push` is not recognised
     (Codex cold review, P1; CLAUDE.md §16).
2. **The hook proves where it lands (T1).** `publishUnchecked` then probes `git -C L rev-parse --path-format=absolute
   --git-common-dir` and the same in `input.cwd`, each with a timeout and `windowsHide`, and compares the two after
   `realpathSync.native`. When both succeed and differ, the verdict — a refusal or an advice, unchecked or fast pass, armed or
   not — becomes the advice "this commit lands in a repository other than this checkout (its git directory differs), so this
   checkout's state does not refuse it (ADR-104). If it was meant for this checkout, run `qh-check` first.", keyed
   `<key>:foreign`. A probe that fails, times out or prints nothing proves nothing, and the verdict stands.
3. **A fast pass admits one commit with an identity (T2).** One constant, `USER_IDENTITY = /^user\.\w+=/`, is read by all three
   option readers (`:49`, `:105`, `:791`), so `commitOnlyCommand` admits `-c user.<key>=<value>` before `commit`. A chained
   `; echo` stays not-one-commit: that is ADR-081's rule working, recorded as the cost of chaining in §371.
4. **Nothing else changes.** A relative path, `cd L && git commit`, PowerShell, a push, git's own hook, the `"publish": "warn"`
   opt-out and ADR-060's reviewer guard are untouched.

**This fails if**, through the real PreToolUse hook, a same-repository row of T1's Tests table is advised with the `:foreign`
text in any session state, or refused-turned-advised on an unarmed unchecked tree; or a foreign row is refused. A same-repository
row in an armed session keeps whatever ADR-066 already says of it. The rows are valid for POSIX shells under the Bash tool, git
2.56.0 on macOS as measured; Windows paths take the same probe and are exercised by the CI Windows job, not measured here.

## Alternatives Considered

- **(a) Leave it, and stage scratch commits through a node script.** Rejected: that workaround is the channel BACKLOG §269
  measured carrying a real unchecked publish past the text refusal; every false refusal teaches it.
- **(b) Compare `L` with this checkout's toplevel, or with `git worktree list`.** Rejected on the gitfile row: a directory
  outside the checkout whose `.git` file points at it commits here, and no path comparison sees that.
- **(c) The probe, as decided.** Chosen: git's own resolution, compared after `realpath`, matches every measured row.
- **(d) Also accept `cd L && git commit`.** Deferred: a second grammar for the same probe, never observed refused; §367 keeps it.
- **(e) `"publish": "warn"`.** Rejected as the fix: it turns every refusal into a warning, including the ones ADR-061 exists for.
- **(f) Exempt silently.** Rejected under CLAUDE.md §16: a classification that removes a refusal says so, once per tree.

## Component / Boundary Impact

None — internal to rule P (`plugin/scripts/publish-command.mjs`, `plugin/scripts/publish-verdict.mjs`). The host boundary, git's hook and the session log's events are unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PreToolUse `permissionDecision` and rule P text for a Bash command | a proven literal-path commit into another repository gets advice keyed `<key>:foreign` instead of `deny` | T1 | Claude Code, the session log's `action.emitted` dedupe |
| PreToolUse `permissionDecision` on a fast-pass tree | `git -c user.<key>=… commit` is one commit | T2 | Claude Code |

## Inter-task Contracts

None — T1 and T2 change different readers and share no symbol.

## Implementation

See `docs/adr/ADR-104-a-literal-path-commit-elsewhere/tasks/README.md`.

## Consequences

- **Positive:** a session can commit into a fixture or sibling repository by its absolute path without routing git through a
  script, so the workaround that hid real publishes is no longer needed for this case.
- **Negative:** two git processes per proven command at PreToolUse (only when the text proof holds). A relative `-C` stays
  refused, and so do a program or a second git step before the commit (`git -C L add . && git -C L commit`), so staging and
  building a fixture go in a separate call from the commit.
- **Neutral:** one advisory line per tree in sessions that do this.

## Out of Scope

- A relative `-C` path (permanent: boundary: the hook's `cwd` is not proven to be the shell's working directory when the command runs)
- `cd <literal> && git commit` (deferred: docs/BACKLOG.md §367)
- A program, `git init` or a second git step (`add`) before the commit in the same command (permanent: boundary: any program can write `L/.git` as a gitfile pointing at this checkout, which the measured gitfile row shows lands here, and a git step can run `L`'s clean filter, which can re-point a symlinked `L`)
- `GIT_DIR`, `GIT_WORK_TREE` or `--git-dir` / `--work-tree` spelled in the command (permanent: boundary: each redirects the commit away from `L`, so the probe of `L` would not describe it)
- A push into or from another repository (permanent: boundary: a push from `L` can name this checkout as its remote)
- PowerShell (permanent: boundary: `shellWords` reads POSIX shell text)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Another process rewrites `L/.git` between the probe and the commit | Low | High | residual and named; no program in the command's own text may run before the commit; armed sessions still have git's hook at the event |
| A text the grammar admits commits here | Low | High | every twin row runs through the real hook; the grammar is a list of what is plain, never of what is dangerous |
| The probe hangs or is slow on a loaded machine | Low | Low | a timeout; a failed probe keeps the refusal |
| `L`'s own hooks (`pre-commit`, `post-commit`) run code that publishes this checkout | Low | Med | the same boundary as a script file (ADR-066): `L`'s code is git's hook's to see in an armed session; the text after the commit admits only `echo` and `true` |

## Rollback

Revert T1's and T2's commits. No stored format changes; `:foreign` keys already in a session log are ignored by older code.

## Follow-ups

- [ ] Owner decision: amend CLAUDE.md §3's sentence on the sanctioned refusal to name this exemption, once Accepted.
- [x] Codex cold review of the draft, 2026-10-15 (gpt-6.1-sol, high), REQUEST CHANGES, seven findings, all confirmed against source and amended here: P1 an unrecognised tail (`g=git; $g push`) carried a push — the tail is now proven data; P1 a second git step's clean filter can re-point a symlinked `L` — one git command only; P2 `ABSOLUTE` admits `\B` and `C:/B` on POSIX — absolute is per platform; P2 T1's fence counted a union of names — each name is counted; P2 the twin matrix omitted measured rows and contradicted the armed downgrade — completed, `:foreign` never on a same-repository row; P2 T2's test did not reach all three readers — it does; P2 neither new test file was in the declared fast check — both tasks wire theirs.
