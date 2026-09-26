# ADR-066: Git itself refuses an unchecked publish, and a plain invocation is left to it

**Status:** Accepted
**Date:** 2026-09-26
**Owner:** Zy
**Spec:** None — no spec stage; ADR-061's open follow-up and BACKLOG §301
**Cross-references:** docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/BACKLOG.md, docs/research/2026-09-26-model-out-of-the-loop.md, CLAUDE.md
**Governs:** plugin/scripts/lifecycle.mjs, plugin/scripts/publish-hook.mjs
**Enforced-by:** `publish-hook: an unchecked commit is refused by git in the repository it runs in`
**Invalidates:** ADR-061 — its Out of Scope line "Refusing a publish whose text contains neither `commit` nor `push` (permanent: boundary: recognizing it before it runs is the parser ADR-060 retired)": git now recognises a commit or push at the event, so a script file's publish is refused; and CLAUDE.md §3's wording of the sanctioned refusal as "a command naming commit or push" is amended to include that event
**Served-path change:** in a Bash session whose git runs config-based hooks, an unchecked `git commit` or `git push` is refused by git at the event in the repository it runs in, including from a script file and under `git commit --no-verify`; a plain invocation, or a mere mention of one, is no longer refused on its text.

## Context

ADR-061 refuses an unchecked `git commit` or `git push` from the text of a shell command. Its amendments record why that does not converge: six review rounds in two days each found forms it missed or data it refused. It named the honest answer as its open follow-up: "A publish launched from a script file … is not observed at all. The honest refusal is a git `pre-commit`/`pre-push` hook reading the same ledger (BACKLOG §269)." Since then the classifier has needed §296, §298 and §300 in three more releases, and it keeps a pinned list of known false refusals. On 2026-09-26 it refused a `git commit` inside a scratch repository because the SESSION's repository was unchecked: text cannot say which repository a command commits into.

**The host passes the session to git.** `CLAUDE_CODE_SESSION_ID` is set in Bash and PowerShell tool subprocesses and equals the hook payload's `session_id`. A SessionStart hook may append `export` lines to `CLAUDE_ENV_FILE`, which later Bash calls source; PowerShell is not documented to source it. (Claude Code docs, env-vars and hooks pages, read 2026-09-26.)

**Git runs a hook injected through the environment, beside the repository's own.** From the RelNotes:
- `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` shipped in 2.31.0;
- config-based hooks (`hook.<name>.command`, `.event`, `.enabled`) shipped in 2.54.0;
- git-hook(1) says "The default `<hook-name>` from the hookdir is run last".

Measured 2026-09-26 on git 2.55.0 and Apple Git 2.54.0, in scratch repositories:

| Case | Result |
|---|---|
| hook on `pre-commit`, no repository hook | ours saw the session id; exit 1 refused the commit |
| the commit launched from a script file; `git -C repo` from Python | refused, in `repo` |
| the repository's own hook in `core.hooksPath` or `.git/hooks` | both ran; ours was added |
| `git commit --no-verify` with `pre-commit` | not run (exit 0) |
| `git commit --no-verify`, `--amend --no-verify`, with `prepare-commit-msg` | ran; exit 1 aborted the commit |
| `prepare-commit-msg` under merge / cherry-pick / rebase | ran, with source `merge` or `message`; git's `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge`, `rebase-apply` tell them apart |
| `-c hook.qh-publish.enabled=false`, `.command=true`, `.event=`, `env GIT_CONFIG_COUNT=0`, `--no-verif`, `-anm`, a repo-local `hook.qh-publish.enabled false` | the hook did not run (exit 0) — each is matched by today's classifier and refused |
| a repo-local disable with `hook.qh-publish.enabled=true` also exported | the hook ran (exit 1) |
| `reference-transaction` | ran under `--no-verify` and aborted the commit, but fires on every ref update (reset, fetch, rebase), and cannot stop a push |

Default gits: Ubuntu 22.04 2.34, 24.04 2.43, Debian 12 2.39, macOS Command Line Tools 2.54, Git for Windows 2.55, and the GitHub runners 2.55 (Launchpad, sources.debian.org, runner-images readmes, read 2026-09-26). Below 2.54 the `hook.*` keys are ignored, so a session there must never count as armed.

The class — every site that decides a publish refusal — enumerated with:

```bash
grep -n "publishUnchecked\|publishCommandIn\|PUBLISH_COMMAND\b\|KNOWN_FALSE_REFUSALS" plugin/scripts/*.mjs plugin/hooks/*.json tests/*.mjs | awk -F: '{print $1}' | sort | uniq -c
```

Run 2026-09-26: `plugin/scripts/lifecycle.mjs` (7), `tests/publish-command.test.mjs` (11), `tests/evidence-flip.test.mjs` (3). One production site. The reviewer guard (`readOnlyVerdict`) is a different rule and is not in this class.

## Existing Primitives Audit

- **`publishUnchecked()`** decides deny-or-warn from the session log, the tree's check standing, the opt-out and the log's completeness. Its decision is extracted into one function both callers use.
- **`importCheckRecords()`** has one call site, in `recordHookEvent`. The extracted verdict calls it too, so a `qh-check` that ran just before the commit, in the same script, is seen.
- **`observe()`, `publishSetting()`** are reused. The `"publish": "warn"` opt-out silences the git hook as well.
- **`publishCommandIn()`** and its tables stay. They gain one predicate: whether a matched invocation leaves the hook in place.
- **Nothing is written into a repository.** The hook is injected per session through the environment.

## Decision

1. **One verdict.** `publishVerdict({ cwd, sessionId, observation })` imports `checks.jsonl` and returns what rule P decides today: refuse, warn, or nothing, with its text. Rule P and the git hook both call it.

2. **Git refuses, on `prepare-commit-msg` and `pre-push`.** `plugin/scripts/publish-hook.mjs <event>`:
   - It first records `publish.hook-ran` in the session log.
   - Without `CLAUDE_CODE_SESSION_ID`, it exits 0.
   - On `prepare-commit-msg`, it exits 0 while git shows a merge, cherry-pick, revert or rebase in progress. That keeps the scope at `git commit`. (A `merge` source was checked too at first; the catalogue showed git's own state already covers every case it did.)
   - Otherwise it calls `publishVerdict` in the repository git runs it in. It prints a refusal and exits 1; anything else exits 0.
   - A repository holding no log for that session is not this session's project, and passes.

   `prepare-commit-msg` is used, not `pre-commit`, because `--no-verify` does not skip it.

3. **SessionStart offers the hook; the hook proves it.** When `CLAUDE_ENV_FILE` is set, and git run in the session's repository names a probe config hook, SessionStart appends exports:
   - two hooks, `hook.qh-publish-commit` on `prepare-commit-msg` and `hook.qh-publish-push` on `pre-push`, each with its `command`, its `event` and `enabled=true` (two names because git appends its own arguments to a config hook's command without saying which event is running, so each command names its event);
   - the index is written as a shell expansion over the `GIT_CONFIG_COUNT` in force when the file is sourced;
   - the exports are skipped when the file already carries them.

   It records `publish.offered`, or `publish.unarmed` with the probe's answer. **A session counts as armed only once `publish.hook-ran` appears in its log.** A shell that never sourced the file, a git below 2.54, or a different git on PATH never arms it.

4. **Rule P leaves only a plain invocation to git.** In an armed session, and only for the Bash tool, rule P advises instead of denying when the matched invocation provably leaves the hook in place. That means:
   - no `-c hook.*` and no `-c core.hooksPath`;
   - no `GIT_CONFIG*`, `env` or `unset` in the command;
   - no `--no-v…` prefix of `--no-verify` on a push;
   - no `n` in a bundled short-option cluster of a commit.

   Every other matched form, every PowerShell call, and every unarmed session keeps ADR-061's deny unchanged. The reviewer guard (ADR-060) is untouched.

What would make this fail:
- In an armed session: an unchecked `git commit` from a script file, or `git commit --no-verify`, that exits 0.
- A checked tree's commit refused, including `qh-check && git commit` in one script.
- An escape form from the table above that is no longer refused.
- A PowerShell `git commit` that is advised.

Each can be built today in a temporary repository, and T1-T3 build them. Valid for Claude Code sessions whose Bash tool sources `CLAUDE_ENV_FILE`, with git ≥ 2.54. How many sessions arm is recorded, not assumed.

## Alternatives Considered

- **A zero-dependency shell lexer (BACKLOG §301 Stage 3 as first planned).** Rejected. It parses the same text more precisely, still cannot see a script file, and still judges the session's repository instead of the one committed into.
- **`pre-commit` as the commit hook.** Rejected: `--no-verify` skips it, and `prepare-commit-msg` covers the same commits without that hole.
- **`reference-transaction`.** Rejected as the gate. It aborts even `--no-verify` commits, but it fires on every ref update, which widens the refusal to reset, rebase and fetch, and it cannot stop a push. Recorded for a later scope decision.
- **Install hooks into the repository.** Rejected: it writes into an adopter's tree, and `core.hooksPath` replaces their hooks.
- **Arm on the SessionStart probe alone.** Rejected by review: the log would say armed where the shell never sourced the file, which is a could-not-look read as a verdict (ADR-005).
- **Advise on every matched invocation when armed.** Rejected by review. Seven measured spellings disable the hook, and each is refused today.

## Component / Boundary Impact

- **`lifecycle.mjs`** gains `publishVerdict` as the single owner of the decision, and the `leavesHookInPlace` predicate for rule P.
- **`publish-hook.mjs`** is new. It is invoked only by git through the injected config.
- **The host boundary** gains one use of `CLAUDE_ENV_FILE`.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `CLAUDE_ENV_FILE` | appended `GIT_CONFIG_*` exports for `hook.qh-publish-commit` (`prepare-commit-msg`) and `hook.qh-publish-push` (`pre-push`), each `enabled=true` | SessionStart (T2) | the Bash tool's git |
| `plugin/scripts/publish-hook.mjs <event>` | new; exit 1 refuses the git event | T1 | git |
| session log | `publish.hook-ran` (T1), `publish.offered` / `publish.unarmed` (T2) | T1, T2 | rule P (T3), `session-profile` |
| PreToolUse rule P | armed + Bash + plain invocation: advice; otherwise ADR-061 | T3 | Claude Code |
| CLAUDE.md §3, the operating skill | the sanctioned refusal names the git event | T3 | readers |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `publishVerdict()`, `publish-hook.mjs`, `publish.hook-ran` | T1 | T2, T3 | No — rule P is unchanged until T3 |
| the exports and `publish.offered` | T2 | T3 | No — no `publish.hook-ran` means unarmed, which is today |

## Implementation

See `tasks/README.md`:
- T1: one verdict and the git hook.
- T2: SessionStart offers the hook through the env file.
- T3: rule P leaves only a plain invocation to an armed session's git.

## Consequences

- **Positive:**
  - a commit or push is refused where it happens, in its own repository, from any launcher, and under `git commit --no-verify`;
  - a plain invocation or a mention is no longer refused on its text in an armed session.
- **Negative:**
  - `git push --no-verify` and the config escapes still rest on text, and are refused there as today;
  - PowerShell and gits below 2.54 keep ADR-061 unchanged.
- **Neutral:**
  - every commit and push in an armed session starts one Node process (about 80 ms, measured 2026-09-26);
  - the classifier stays.

## Out of Scope

- Arming PowerShell sessions (deferred: docs/BACKLOG.md §301, the remaining text refusal)
- Removing the text refusal entirely (deferred: docs/BACKLOG.md §301, once `publish.hook-ran` counts are in)
- Refusing merges, rebases, cherry-picks or resets (permanent: boundary: the sanctioned refusal is commit and push; `reference-transaction` would widen it, an owner decision recorded in Follow-ups)
- Writing hooks into any repository (permanent: boundary: the plugin never installs into an adopter's tree)
- Other git clients (libgit2, IDE git) (permanent: boundary: they do not run the injected config)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Most Linux adopters' git is below 2.54 | High | Low | never armed there; ADR-061 unchanged; `publish.unarmed` records the probe's answer |
| Another writer of `CLAUDE_ENV_FILE` or the user's profile collides on `GIT_CONFIG_*` indices | Low | Med | the index is a shell expansion at source time; T2 tests an existing count |
| The hook refuses a checked tree | Low | High | one verdict for both callers; it imports `checks.jsonl`; T1's twin runs a real `qh-check` in the same script; `"publish": "warn"` silences both |
| A user-typed `!` command carries the session id and meets the hook | Med | Low | it gets the same verdict an agent's command gets today; T3's live check records it |

## Rollback

Revert the commits. Nothing is written into any repository. The exports live only in the session's env file, and the new log events are ignored by older readers.

## Follow-ups

- [ ] Owner decision: should `reference-transaction` widen the refusal to every new commit on a branch (merge, rebase, cherry-pick)? Measured 2026-09-26: it aborts those, and `--no-verify` commits, in the prepared phase.
- [ ] After a release, count `publish.hook-ran` against `publish.unarmed` across sessions, and decide whether the text refusal can shrink further.
