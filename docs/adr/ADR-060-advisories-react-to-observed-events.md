# ADR-060: Advisories react to observed events, not to parsed commands

**Status:** Accepted
**Date:** 2026-09-17
**Owner:** zy
**Spec:** None — no spec stage. The owner decided the direction on 2026-09-17: "use events … better event names for separation, then watch for events in our internal loop, then do the actions … simple". After Codex's loss review of revision 2, the owner kept a small publish guard. After Codex's review of revision 3 and the refusal rates measured below, the owner chose a guard that reads one thing from a command: whether it contains the word `commit` or `push`. Revision 5 answers two reviews of revision 4, and the owner chose to try it on a local branch before accepting.
**Cross-references:** ADR-005, ADR-035, ADR-041, ADR-042, ADR-044, ADR-047, ADR-048, ADR-051, ADR-053, ADR-054, ADR-056, ADR-058, ADR-059, `docs/BACKLOG.md` §213, `docs/BACKLOG.md` §216, `docs/BACKLOG.md` §217, `docs/BACKLOG.md` §218, `docs/BACKLOG.md` §220, `docs/BACKLOG.md` §221
**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/event-log.mjs`, `plugin/scripts/classify-command.mjs`, `plugin/scripts/reviewer-guard.mjs`, `plugin/scripts/statusline.mjs`, `plugin/scripts/run-shell-hook.mjs`, `plugin/scripts/facts-gate-dispatch.sh`, `plugin/hooks/hooks.json`, `plugin/bin/qh-check`, `plugin/bin/qh-check.cmd`, `plugin/scripts/qh-check.mjs`

Class: every advisory `lifecycle.mjs` derives from a Bash command's text rather than from what happened. Enumerated 2026-09-17 at `a7c5e57`:
- `git grep -c "\bclassifyCommand(\|\bisPotentialMutationCommand(\|\bbashMarkdownMutationPaths(\|\bisValidationCommand(\|\banalyzeTranscript(\|\breadOnlyVerdict(" -- plugin` matches 23 lines in `lifecycle.mjs` and 4 in `classify-command.mjs`.
- `git grep -w "analyzeTranscript\|readOnlyVerdict" -- plugin/scripts` adds the consumers `statusline.mjs` and `reviewer-guard.mjs`.
- `git grep -c -w "isGitPublishCommand\|shellCommandRegions\|gitSubcommand\|shellSegments\|commandInvocation\|heredocBodies" -- plugin` finds the shell helpers only in `lifecycle.mjs` (64 lines) and `classify-command.mjs` (4).
- 64 top-level parsing symbols hold 1,378 of `lifecycle.mjs`'s 4,923 lines.
- `plugin/scripts/*.mjs` totals 10,277 lines.

One reading of command text stays, deliberately: whether a Bash command contains the word `commit` or `push` (T3, T4).

**Enforced-by:** `tests/observed-events.test.mjs::the scripted session advises as its step table lists`, `tests/observed-events.test.mjs::a check event is written by qh-check`, `tests/observed-events.test.mjs::a read-only role cannot commit or push and its other changes are reported`, `tests/observed-events.test.mjs::the command classifiers are gone`, `tests/evidence-flip.test.mjs::degrading the evidence changes the answer, at every surface that can give a positive one`
**Invalidates:**
- **ADR-047:** an unrecognised command no longer matters to what is reported. The only command text read is the `commit`/`push` word rule.
- **ADR-041, ADR-042, ADR-048:** markers, UNPROVEN authorship and its validation term go.
- **ADR-051:** "Advise names only proven paths" survives; the paths come from git and from Edit/Write events.
- **ADR-053:** the check-then-commit chain clause goes. The Swift Testing clause stays.
- **ADR-054:** the git-wrapper argument clause goes. The hashing clauses stay.
- **ADR-056:** withdrawn.
- **ADR-058 and ADR-059:** superseded.
- **ADR-035:** the claim ledger stays, with an explicit outcome order and a version field (T5).
- **ADR-044:** the statusline composition stays, fed by the event log.

These current behaviours go:
- the unresolved-deletion commit advisory;
- `environmentExcuse`, replaced by check outcomes;
- the reviewer's refusal of Bash writes whose text contains neither `commit` nor `push`.

These stay, because they read a message or event data, not a command:
- the docs-only/EVIDENCE-LIMITED and interim-reply suppressions;
- `evidenceNudge`;
- the `hasBackgroundWork` skip.

**Served-path change:** in a repository with a check, a session is advised about work or commits no `qh-check` passed on, but only when git or an Edit/Write event shows a change. That happens before a Bash command containing `commit` or `push` runs, and at the end of a turn, task or subagent. Each finding is advised once per rule and evidence state. A read-only role cannot edit, or run a Bash command containing `commit` or `push`. Any other tree, index or HEAD change during its run is reported. Reads, loops and a check spelled differently no longer produce messages.

## Context

The commit and completion advisories guess from each Bash command's text whether it wrote, which file, and whether it ran a check. Guessing what arbitrary shell does has no end state, and 2026-09-16/17 measured that:
- **Two records:** ADR-058 (seven tasks) and ADR-059 (five tasks) added 319 lines of such rules.
- **Three reviews:** a cold review and two Codex rounds found 15 defects in them. Ten were fixed, and five new ones were open at `a7c5e57`, among them a fail-open (`printf x > f; rg --pre false …` becomes `unrecognised`, so a failed run records no write) and false refusals of reads (`uniq < README.md`, `sort -to README.md`).
- **Two repairs undo each other:** withdrawing ADR-059 T4 closes three of those and reopens the wrapped `uniq IN OUT` fail-open.
- **No fewer messages:** BACKLOG §213's replay counted 21 advisories before those records and 21 after on one recorded session. That is a message count, not proof that the corrected path lists gained nothing.

Every writing tool except Bash already names its target (`file_path`); Bash is the one opaque event. Its effects are observable instead:
- **The working tree:** a content hash via a copied index, `git add -A` and `git write-tree`, with both commands under `GIT_INDEX_FILE=<copy> GIT_OBJECT_DIRECTORY=<temp> GIT_ALTERNATE_OBJECT_DIRECTORIES=<repository objects>`. Measured 2026-09-17:
  - 30–56 ms on this repository's 571 files, with the same hash in three runs;
  - equal to the plain form;
  - in a scratch repository with a modified and an untracked file, 3 repository objects before and 3 after, the index and `git status` unchanged.
- **The index:** `git write-tree` over a copy of the real index, without `add`.
- **Commits:** `git rev-list <first HEAD>..HEAD`.
- **Checks:** a check the plugin runs can write its own result (CLAUDE.md §4).

**Revision 3's review** (Codex `gpt-6-astra`, xhigh, 2026-09-17, REQUEST CHANGES, 14 findings) was reconciled against `a7c5e57` by execution:
- Today's reviewer guard refuses `pwsh -Command 'git push'` and a Python `subprocess.run(["git","push"])` (exit 2), and `isGitPublishCommand` recognises neither. Revision 3's guard would have allowed both, and a push leaves nothing for R3 to observe.
- On a zero-test summary with exit 0, `validationVerdict` returns `no-work` for `npm test` but `passed` for `sh check.sh` and `bash scripts/selftest.sh`. It returns `unstarted` for exit 127 and `timeout` for 124, which revision 3's import rules turned into `check.failed`.
- `claims-rate.mjs`'s `tally` counts a row with `evidence: "events/1"` as unrecognised.
- `emitJson` (`lifecycle.mjs:3164`) replaces the pending output, so two rules in one hook would deliver one.
- `archiveHistory` (`run-shell-hook.mjs:435`) reads `HEAD` for multi-path batches.
- Today's guard refuses `qh-check` to a reviewer (exit 2).

By reading, it also found:
- the scenario's count contradicted its rules (P never suppressed R1, and `commit -am` left a file untracked);
- one T3 mutant could not fail;
- nothing stored non-git writes, and R3's index paths came from deleted objects;
- hooks had no deadline, and the per-edit gate could repeat A's finding.

**What a reviewer guard costs, measured 2026-09-17** over this repository's seven transcripts of `qh-*` reviewer subagents (115 Bash calls):
- today's classifier guard refused 31, counted from its own refusal messages;
- a strict allowlist of read commands, prototyped over the same calls, would refuse 41, mostly `$` expansions, `node` probes and `mrw` subcommands other than `read`;
- the word rule would refuse 1.

Over this repository's 30 main-session transcripts (13,150 Bash calls), 1,896 contain the word. They include all 1,173 that `isGitPublishCommand` reads as a publish.

**The owner's decisions on the losses:**
- **Kept by a rule that runs before the command:** a warning before a Bash command containing `commit` or `push`, and refusing such a command, Edit and Write to a read-only role.
- **Restored inside the event model:**
  - native writes outside git's view, re-opening the finding per write;
  - tracking without git, in a temporary state directory;
  - commit detection independent of the final tree;
  - no-work, unstarted and timeout check outcomes;
  - re-advice after a new failure;
  - artifact validation of committed files, with the session's first HEAD as deletion base;
  - fresh compaction and session-end notes;
  - the suppressions, the `adr-verify` reminder and the inferred-check caveat;
  - a report of a reviewer's other changes;
  - shipped guidance.
- **Accepted and named:** see Consequences and Out of Scope.

BACKLOG status:
- **Closed:** §217, the repetition counter, becomes one advisory per rule and evidence state.
- **Obsolete:** §213, §216, §218, §219, §220 and §221 have nothing left to parse. Closing lines land with T7.

## Existing Primitives Audit

- **`handleHook` dispatch** (lifecycle.mjs) — **reshape** into reviewer deny → translate → observe → react → deliver.
- **`findGitDir`** (git-directory.mjs) and `git rev-parse --git-path index` / `--git-common-dir` — **reuse**, so linked worktrees work.
- **`projectCheckCommand`, `checkCommandOrigin`** — **reuse**: what `qh-check` runs, the opt-in, and the declared/inferred caveat.
- **`validationVerdict`** — **reuse** on `qh-check`'s kept output and exit status. For `qh-check` the zero-test reading no longer depends on the command's spelling, since the command is the project's check by definition.
- **`runArtifactGates`, `archiveHistory`, `facts-gate-dispatch.sh`** — **reuse**; the deletion base becomes a parameter (T6).
- **`recordClaim`, `hasBackgroundWork`, `interimResponse`, `evidenceLimited`, `docsOnly`, `evidenceNudge`** — **reuse** with observed inputs.
- **`emitJson`/`advise`** — **replace** with one delivery step per hook (T1).
- **`readOnlyVerdict`, `readOnlyRole`, `decisionContextFor`** — **keep**; `readOnlyVerdict` becomes tool name plus the word rule (T3).
- **The session marker files under `os.tmpdir()`** (`sessionGenerationPath`) — **replace** with reading the event log for R4's once-per-session checks.
- **The Python bin layout and forwarders** — **reuse**: `qh-check` is a Python bin exec'ing `plugin/scripts/qh-check.mjs`.
- **`classify-command.mjs`, `VALIDATION_PATTERNS`, `analyzeTranscript` and the transcript command classifiers, `isGitPublishCommand`, `gitSubcommand`, `shellCommandRegions`, `shellSegments`, `commandInvocation`, `heredocBodies`** — **replace and delete** once nothing calls them (T7).

## Decision

**Hooks are the only event source. Each hook becomes a named internal event. One loop observes git and Edit/Write targets, appends to a per-session event log, runs the rules and delivers their actions as one output. The only command text read is whether a Bash command contains the word `commit` or `push`.**

**Storage.** The state directory is `<git-dir>/quality-harness/` in a git repository, where `<git-dir>` is `git rev-parse --absolute-git-dir` and so belongs to one worktree. Outside a repository it is `<os.tmpdir()>/quality-harness/<sha256 of the canonical cwd>/`. It holds `sessions/<session_id>.jsonl` and `checks.jsonl`, so a check run in one worktree never clears another worktree's findings. Every event carries `at`.

| Event | From | Carries |
|-------|------|---------|
| `session.started` | the first SessionStart for this `session_id` (a compact SessionStart does not reset it) | `observation` |
| `turn.ended` / `task.completed` | Stop (skipped while `hasBackgroundWork`) / TaskCompleted | `observation` |
| `context.compacting` / `session.ending` | PreCompact / SessionEnd | `observation` |
| `subagent.started` / `subagent.ended` | SubagentStart / SubagentStop | `agentId`, `agentType`, `observation` |
| `publish.requested` | PreToolUse Bash, outside a read-only role, whose command contains the word `commit` or `push` | `observation` |
| `file.written` | PostToolUse Edit/Write/MultiEdit/NotebookEdit | `path` (absolute); `observable` (false outside the repository, in an ignored path, or without git); `blob` (the written content's git hash, when observable) |
| `check.passed` / `check.failed` / `check.unproven` / `check.no-work` / `check.unstarted` / `check.timeout` | a `checks.jsonl` record the log has not seen | `before`, `after`, `exit`, `signal`, `command`, `origin` |
| `artifact.gated` | the per-edit PostToolUse gate (`run-shell-hook.mjs`) and rule A, once per path they gated | `path`, `blob`, `complete` (true only when the gate returned a verdict for that content; false for a timeout, `UNRUN` or `UNPROVEN`) |
| `action.emitted` | the delivery step, once per delivered action | `rule`, `key` |

**The word rule.** A command contains `commit` or `push` when either word appears with no letter, digit, `_` or `-` directly before or after it. Nothing else about the command is parsed.

**Observation.** An observation is `{ok: true, tree, index, head}` or `{ok: false, reason}`:
- the tree is hashed with a copied index, `add -A` and `write-tree`; the index with `write-tree` on a copy; both under a temporary object directory with the repository's objects as alternate;
- it is not ok when git is absent or fails, when the git calls together exceed 5 seconds, or when the log cannot be appended;
- a not-ok observation never equals another and never satisfies a check.

**The loop,** on every hook event:
1. For a read-only role's PreToolUse, apply the reviewer deny before anything else.
2. Translate the hook into its event.
3. Observe, and import unseen check records.
4. Append both to the log.
5. Run the rules.
6. Deliver one output. A deny is delivered alone; otherwise every advisory is joined in the order P, R1, R2, R3, R4, A. Append `action.emitted` only for what was delivered.

**Rules.** R1, R2, R4 and P require `projectCheckCommand(cwd)`, the opt-in today's advice already requires. R3, A and the reviewer deny do not.
- **"Checked" for a tree:** its latest check event is `check.passed`. A check event belongs to the tree of its `after` observation.
- **The evidence revision** of a tree is its number of check events. Each key below includes it, so a later check re-opens the finding.
- **P `publish-unchecked`** (`publish.requested`, before the command runs): the tree or the index is not checked and differs from `session.started`.
  - The message says this repository's tree is unchecked and that the command about to run contains `commit` or `push`, and names `qh-check`. It does not claim the command publishes this repository.
  - Key `(P, tree, index, revision)`.
- **R1 `unchecked-work`** (turn, task or non-read-only subagent end), when:
  - the tree differs from `session.started` and is not checked, and P has not named this tree at this revision; or
  - a `file.written` with `observable: false` came after the start (`before.at`) of the last `check.passed`.

  The message lists `git status --porcelain` paths relative to the repository, and the number of written paths outside it without naming them (CLAUDE.md §17). It names `qh-check` and, when the check is inferred, says so and asks for it to be declared. The key is `(R1, tree, revision, count of unobservable writes)`. It is skipped by the docs-only/EVIDENCE-LIMITED and interim-reply conditions, and followed by `evidenceNudge` when a check passed and task files changed.
- **R2 `unchecked-commits`** (the same boundaries): commits in `rev-list <first HEAD>..HEAD` whose tree:
  - is not checked;
  - is not the observed working tree, which R1 speaks for;
  - was not named by P at its current revision.

  Key `(R2, commit, revision of its tree)`. The message calls them "newly reachable commits", not "authored in this session".
- **R3 `review-changed-state`** (`subagent.ended` for a read-only role): the tree, index or HEAD differs from the same `agentId`'s `subagent.started` observation.
  - The message lists the current `git status --porcelain` paths relative to the repository, the paths staged now (`git diff --cached --name-only`), and the commits in `rev-list <its start HEAD>..HEAD`.
  - It says the state changed during that reviewer's run, not who changed it.
  - Key `(R3, agentId)`.
- **R4 `could-not-look`,** once per session and `cwd`: the observation is not ok, the project has a check, and the event log has no prior `could-not-look` delivery for this `cwd`. It says what could not be observed (ADR-005), and that Edit/Write paths are still tracked.
- **A `artifact-invalid`** (turn, task and subagent end, `context.compacting`, `publish.requested`). It runs `runArtifactGates`, with the first HEAD and then HEAD as deletion bases, over:
  - the paths in `git diff --name-only <first HEAD>`, the untracked status paths, and observable `file.written` paths;
  - minus paths whose current blob has an `artifact.gated` event with `complete: true`.

  It runs nothing when no path remains. Each path it gates appends `artifact.gated`; a path the budget left unchecked is named `UNRUN` and gets no complete event, so the next boundary retries it. Its budget is 45 s at `publish.requested`, 20 s at `context.compacting` and 90 s elsewhere. Key `(A, tree, gate output hash)`.
- **Reviewer deny** (PreToolUse, read-only role): Edit, Write, MultiEdit and NotebookEdit by tool name, and a Bash command containing the word `commit` or `push`.

**Notes and ledger.** PreCompact and SessionEnd observe before they write, and `sessionStateNote`/`previousSessionNotice` read the log. ADR-035 rows keep `evidence` in its four values, the first that applies:
1. `could-not-look`: the observation is not ok;
2. `no-check`: the project has no check;
3. `unverified`: the tree differs from `session.started` and is not checked, a commit in `rev-list <first HEAD>..HEAD` has an unchecked tree, or an unobservable write came after the start of the last `check.passed`. This is computed from those facts alone, not from R1 or R2, so a P warning, dedupe or a suppression never turns it into `verified`;
4. `verified`: otherwise, including a session with no change.

Each row adds `version: "events/1"`, and `mutations` is the number of paths R1 would list plus the unobservable writes.

**A check is an event `qh-check` writes.** `qh-check`:
1. resolves the repository root (the canonical `cwd` outside git) and `projectCheckCommand`; with none, it says so and exits 2;
2. observes;
3. runs the command at the root, streaming its output and keeping the last 64 KiB, and forwards SIGINT and SIGTERM to it;
4. observes again;
5. appends `{before, after, exit, signal, command, origin, verdict, at}` to `checks.jsonl`. `verdict` is `validationVerdict`'s reading of the kept output and exit status, with the zero-test reading independent of the command's spelling;
6. exits with the check's code.

Import turns each record into one event, the first that applies:
1. `check.unstarted`: the verdict is `unstarted`;
2. `check.timeout`: the verdict is `timeout`, or a signal was recorded;
3. `check.failed`: a non-zero exit;
4. `check.unproven`: inside a git repository, the `before` and `after` trees differ, or either observation is not ok. Outside one, where no observation can be ok, this step does not apply, and a pass clears only unobservable writes recorded before it started;
5. `check.no-work`: the verdict is `no-work`;
6. `check.passed`.

A command that masks its own failure (`… || true`) is the project's declared check, and `qh-check` records what it returned.

**What would make it fail, and whether that data exists:** T5's scripted session drives the hooks and `qh-check` as processes in repositories A (declared `check`) and B, with the logs outside both. The test compares each step's delivered rules with this table, and any other delivery fails it:

| Step | What happens | Delivered |
|------|--------------|-----------|
| 1 | SessionStart | — |
| 2 | Write `a.md`; Stop | R1 |
| 3 | Stop | — |
| 4 | `qh-check` passes; Stop | — |
| 5 | PreToolUse, then run `git add -A && git commit -m one`; Stop | — |
| 6 | PreToolUse, then run `git -C <B> commit --allow-empty -m other`; Stop | — |
| 7 | `cat a.md`, `grep -n heading a.md`, a `for` loop over `ls`; Stop | — |
| 8 | SessionStart `compact`; Stop | — |
| 9 | Write `b.md`; run `sh check.sh` directly; PreToolUse `git add -A && git commit -m two` | P |
| 9′ | run it; Stop | — |
| 10 | Write `c.md`; SessionStart `compact`; Stop | R1 |
| 11 | Edit `a.md`; PreToolUse `bash -c 'git add -A && git commit -m three'` | P |
| 11′ | run it; Stop | — |
| 12 | Edit `a.md`; PreToolUse `git --git-dir=<A>/.git --work-tree=<A> -C <B> commit -am four` | P |
| 12′ | run it; Stop | — |
| 13 | `qh-check` passes; Stop | — |
| 14 | Outside any hook, commit a new `d.md` as `five`, then remove it as `six`, so the tree equals step 13's checked tree; Stop | R2 naming `five` |
| 15 | `qh-check` fails on the same tree; Stop | R1 |

The same steps in a repository with no check deliver nothing. Step 14 cannot catch R2 skipping a commit whose tree equals the session start; T5's `an unchecked commit is named even when its tree equals the session start` does. T5 also runs the revision 4 reviews' cases: a check passing in another worktree, and the ledger after a warned, unchecked commit. T1 records the observation cost, and fails if observation writes any repository object or changes the index. T7 fails if `classify-command.mjs` is missing or exports a symbol — it stays, emptied, so earlier records' `Governs:` paths still resolve — or if any deleted parsing symbol is still defined or imported under `plugin/`.

## Alternatives Considered

- **Keep patching the classifier.** Rejected because it does not converge: three review rounds found 15 defects and each round's repairs made new ones (Context).
- **A pure event model with no rule before the command runs.** Rejected because it reports a publish only after it happens, and it cannot stop a reviewer's commit or push, or see a push at all.
- **Recognise the git subcommands `commit` and `push` in the command's structure (revision 3).** Rejected because wrapped publishes pass it (`pwsh -Command 'git push'`, a Python subprocess; measured in Context), a push leaves nothing to report afterwards, and it keeps the shell parsing helpers.
- **A strict allowlist of read commands for reviewers.** Rejected because it would refuse 41 of the 115 measured reviewer calls, including the probes reviews rely on (CLAUDE.md §16), and it rebuilds a per-command option table.
- **Keep today's classifier guard for reviewers only.** Rejected because it refused 31 of the same 115 calls, keeps `classify-command.mjs` with its five open defects, and leaves this record deleting less.
- **A host sandbox for read-only roles.** Rejected because no per-subagent read-only setting is measured in this repository.
- **A PostToolUse Bash hook observing after every call.** Rejected because it pays a hook and a fingerprint per call, needs persistent tree objects for paths, and advises on commits by key mismatch. Turn-end observation, `rev-list` and the publish warning cover the same events.
- **Recognise a raw check from a PostToolUse payload.** Rejected because it brings back command matching and an unmeasured exit-status field. `qh-check` makes the evidence tool-written.
- **Revision 4 of this record.** Rejected because of two reviews on 2026-09-17. `checks.jsonl` under the common git directory let a check in one worktree clear another's finding. The ledger derived `unverified` from R1 and R2, which skip a tree P warned about, so a warned unchecked commit could be recorded `verified`. Rule A skipped a blob without knowing its per-edit gate finished, and cached a whole tree after a pass that left paths `UNRUN`. Outside git every check imported as `check.unproven` while T5 expected it to clear the finding. `Governs:` had no step adding the new `qh-check` files once they exist, T7's absence check named a subset of the deleted symbols, and a line ceiling stood in for the decision.
- **Revision 3 of this record.** Rejected because of Codex's revision 3 review, reconciled in Context. Its scenario count contradicted its rules, its ledger rows were unreadable, and one hook could lose a finding. Its check import discarded unstarted and timeout. It had no storage for non-git writes and no hook deadlines. Its task order left artifacts unchecked and refused `qh-check` to reviewers, and one T3 mutant could not fail.
- **Revision 2 of this record.** Rejected because of Codex's loss review. It dropped reviewer publish refusal and pre-publish warnings. Its once-per-tree key hid later failures and let one rule silence another, and it gated artifact validation behind the check opt-in and missed committed files. PreCompact and SessionEnd notes went stale, zero-test runs passed, and native writes outside git's view went unnoticed. R3 could not name paths and R4 had nowhere to remember. Its commit boundary relied on timestamps, its statusline had no age source, a T5 mutant could not fail, and it left shipped guidance teaching the raw check.
- **Revision 1 of this record.** Rejected because of 26 cold-review findings, folded into revision 2.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| event loop, rules, word rule, delivery | `plugin/scripts/lifecycle.mjs` | reviewer deny → translate → observe → react → deliver replaces transcript command parsing |
| `observe(cwd)`, `stateDir(cwd)` | `plugin/scripts/lifecycle.mjs` (exported) | shared by the hooks and `qh-check` |
| `qh-check` | `plugin/bin/qh-check` (Python, execs node) + `plugin/scripts/qh-check.mjs` | the check event's only writer |
| reviewer guard | `plugin/scripts/reviewer-guard.mjs`, `plugin/agents/qh-*.md` | Edit/Write by tool name, Bash by the word rule |
| deleted-path history lookup | `plugin/scripts/run-shell-hook.mjs`, `plugin/scripts/facts-gate-dispatch.sh` | deletion bases passed in instead of `HEAD` |
| statusline | `plugin/scripts/statusline.mjs` | renders the last observation with its age |
| shipped guidance | `plugin/README.md`, `plugin/skills/adr-execute/SKILL.md`, `subagentContract`/`runTheCheckSentence` | name `qh-check` |
| command classifier | deleted | nothing classifies commands |

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| session event log | new: `sessions/<session_id>.jsonl` in the state directory | T1 | rules, notes, ledger, statusline |
| check record | new: `checks.jsonl` in the state directory | T2 | the loop |
| `qh-check` CLI | new bin with `--version`; runs the project check at the root and exits with its code | T2 | agents, reviewers, humans, advisories |
| `plugin/hooks/hooks.json` | the existing PostToolUse Edit/Write/MultiEdit/NotebookEdit block gains `lifecycle.mjs` beside its two shell hooks; timeouts unchanged | T1 | Claude Code |
| advisory output | one delivered output per hook, from P, R1, R2, R3, R4 and A | T1, T3–T6 | sessions |
| `QUALITY_HARNESS_HISTORY_BASES` | new environment variable from `runArtifactGates` to `run-shell-hook.mjs` and `facts-gate-dispatch.sh`: the revisions to look deleted paths up in, in order | T6 | the artifact gates |
| `artifact.gated` events | new: written by `run-shell-hook.mjs` after the per-edit gate, and by rule A | T6 | rule A |
| ADR-035 claim rows | outcome order and `version: "events/1"` | T5 | `claims-rate.mjs` |
| exports of `classifyCommand`, `analyzeTranscript`, `isGitPublishCommand` and the other parsing symbols | removed | T7 | tests, statusline |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `observe(cwd)`, the state directory, the session event log and delivery (T1) | T1 | T2, T3, T4, T5, T6, T7 | No — new |
| `checks.jsonl` written by `qh-check` (T2) | T2 | T3, T4, T5 | No — new |
| the word rule, the reviewer deny and R3 (T3) | T3 | T4, T7 | Yes — the reviewer guard changes |
| rule P (T4) | T4 | T5, T6, T7 | Yes — the pre-commit advisory changes |
| rules R1, R2 and R4, the ledger and the statusline (T5) | T5 | T6, T7 | Yes — the old completion advisories stop |
| rule A, the deletion bases and the observing notes (T6) | T6 | T7 | Yes — artifact inputs change |
| `tests/observed-events.test.mjs` (file exists) (T1) | T1 | T2, T3, T4, T5, T6, T7 | No — one writer creates it |

## Implementation

See `docs/adr/ADR-060-advisories-react-to-observed-events/tasks/README.md`.

## Consequences

- **Positive:**
  - no completion advisory depends on how a command is spelled;
  - a read-only role cannot edit, or run a Bash command containing `commit` or `push`, wrapped or not, and any other tree, index or HEAD change during its run is reported;
  - each finding is advised once per rule and evidence state, and re-opens when evidence changes;
  - committed artifacts are still validated, with deletions judged against the session's first HEAD;
  - completion and publish advisories stay silent in a repository without a check, while artifact and reviewer reports still run;
  - command-text parsing goes, except the word rule.
- **Negative:**
  - **Check coverage:**
    - A check counts only when run through `qh-check`; focused or wrapped checks and `mrw --check` no longer clear the finding.
    - A declared check that masks its own failure is recorded as it returns.
    - A check the host kills with SIGKILL leaves no record.
    - Outside a git repository nothing can be observed, so a pass clears the unobservable writes recorded before it started without confirming the tree held while it ran. Inside one that case is `check.unproven`; outside there is no observation to compare it against, so the import step does not apply. Never clearing was the alternative and was rejected: it leaves a finding nothing can close in a directory the harness cannot read. Named here because revision 5 changed the Decision rather than the test, and a Decision changed to permit something must say what it now permits.
  - **Reviewers:**
    - A reviewer's Bash writes whose text contains neither word are reported after the review, not refused; today refuses most of them.
    - A change that leaves tree, index and HEAD as they were is not reported: a write restored before the reviewer ends, a permission change, or a write outside the repository or into an ignored or submodule path.
    - A publish whose text avoids both words is neither refused nor, for a push, reported. Examples: a split word such as `pu''sh`, an alias defined in a config file, a script.
    - A read whose text contains either word is refused; one of the 115 measured calls was.
  - **Publish warning:**
    - It warns about this repository's state even when the command targets another repository.
    - It also warns when a command only mentions a word: 723 of 13,150 measured main-session calls did so without being a recognised publish. It warns once per state.
  - **Visibility:**
    - Bash writes outside git's view are invisible to every rule; Edit/Write writes there are tracked.
    - Other tools' writes, such as an MCP server's, are seen only through the tree.
    - A session whose changes return the tree to its starting state is not advised, even when a check then fails on it.
    - A session the plugin began watching LATE — installed, enabled or upgraded mid-session — has no `session.started`. Over a clean tree the first observation becomes the baseline, marked `late`, and what happened before it is said once to be unobserved. Commits made earlier in that session are therefore never listed. Over a dirty tree no baseline is taken, and the changed paths keep being reported as unchecked.
  - **Attribution:**
    - A commit made on another branch and left there is not listed.
    - Edits by the user or another tool in the same tree count as unchecked work.
    - Commits pulled in are listed as newly reachable, not attributed.
  - **Reminders:** a finding is not repeated after compaction or in later turns unless its evidence changes.
  - **Artifacts:** an archive created and deleted within one session is in neither deletion base.
  - **Cost:** each observed hook pays an observation (30–56 ms here, bounded at 5 s), and A pays its gates for paths without a complete result for their current content.
  - **Statusline:** it shows the last observation and its age, so it can lag an edit until the next hook.
  - **Claim ledger:** `verified` becomes tree-based and rows carry `version: "events/1"`, so rates before and after are not directly comparable.
- **Neutral:** ADR-044's statusline composition is unchanged.

## Out of Scope

- Refusing, before it runs, a read-only role's Bash write whose text contains neither `commit` nor `push` (permanent: boundary: the owner chose the word rule over an allowlist after the refusal rates in Context)
- Counting a raw check run outside `qh-check`, or other tools' checks such as `mrw --check` (permanent: boundary: only a tool-written check event counts; recognising others means reading their commands)
- Bash writes to ignored paths, outside the repository, inside submodules, or through clean filters (permanent: boundary: invisible to the observation; Edit/Write targets there are still events)
- Attributing a change or commit to the actor who made it (permanent: boundary: git records content and history, not which process in a shared tree wrote them)
- Recording a check the host kills with SIGKILL (permanent: boundary: the process cannot write after it, and the finding stays open)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Observation cost grows with repository size | Med | Med — each observed hook pays it | T1 records the cost here; past 5 s the observation is not ok and R4 says so |
| Agents keep running the raw check and see advisories until they use `qh-check` | High at first | Low | T5 changes the shipped guidance and every message names `qh-check` |
| The word rule is evaded (a split word, a config alias, a script) | Low | Med — no warning or reviewer refusal, and a push is not reported | R2 and R3 report the resulting commits; named in Consequences |
| The word rule refuses a reviewer's read that mentions a word | Low (one of 115 measured calls) | Low — the reviewer reports instead | the refusal message says what to do |
| Two hook processes race on the log | Low | Low — an advisory may repeat once | appends are single-line writes |
| A task commit changes behaviour before the record is complete | Low | Med | tasks are not released separately; the release follows T7 and the Codex review (Follow-ups) |

## Rollback

Revert the task commits. The persistent state is `<git-dir>/quality-harness/` in each worktree and `<os.tmpdir()>/quality-harness/`. All of it is plugin-owned and safe to delete.

## Follow-ups

- [x] After T1–T7 land, count the advisories one real working session receives and record them in BACKLOG §217 beside §213's 21, with the session's commit count and the number of `qh-check` runs. Measured 2026-09-22: the installed claims ledger has no `events/1` row, so a session was driven on `365706b`. It spoke twice, made 2 commits and 1 `qh-check` run.
- [x] Run a Codex review of the executed record before any tag (CLAUDE.md §12). 2026-09-22, gpt-6-astra, xhigh, exit 0, REQUEST CHANGES on `115948b`. A root query that does not answer no longer certifies a pass (`365706b`; CI run 35700491224 succeeded). The acceptance line names the tombstone. Overlapping compact SessionStarts can both serve one note; that stays the named limit.
