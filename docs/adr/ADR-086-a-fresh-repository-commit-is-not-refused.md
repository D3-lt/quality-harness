# ADR-086: A commit into a repository the command creates is not this checkout's publish

**Status:** Accepted
**Date:** 2026-10-06
**Owner:** Zy
**Spec:** None — no spec stage; the owner asked on 2026-10-06 for the scratch-repository false refusal (docs/BACKLOG.md, ADR-074's leftovers, "A candidate false refusal in the publish hook") to be exempted
**Cross-references:** docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-067-the-publish-classifier-reads-the-command-as-the-shell-splits-it.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md, docs/BACKLOG.md, CLAUDE.md, .claude/rules/16-classifiers-are-empirical.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. T1 and T2 each add one campaign mutation per `Rests-on` name; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-061 — its text refusal no longer refuses a commit whose command text proves it lands in a repository that same command created in a fresh `mktemp -d` directory; that commit is advised instead. ADR-066 — Decision 4's rule that any `$` keeps the refusal (`leavesHookInPlace`) is narrowed: a `$NAME` assigned from `mktemp -d` and used only as a directory operand is plain text. CLAUDE.md §3's wording of the sanctioned refusal is the owner's to amend (Follow-ups).
**Served-path change:** PreToolUse rule P advises, rather than refuses, a Bash `git commit` into a repository the same command creates in a `mktemp -d` directory. In an armed session this covers the first observed spelling, `;` included, and the second wherever its command assigned `R` from `mktemp -d` in the same text, and git's own hook then judges the repository the commit lands in. In an unarmed session it covers only an `&&`-chain the text proves, which admits no program that writes into the directory, so only an empty-tree (`--allow-empty`) commit.

## Context

- **The refusal (BACKLOG, ADR-074 leftovers, and its 2026-10-06 recurrence note).** On an unchecked tree,
  rule P refused a `git commit` whose target was a fresh scratch repository, on 2026-09-29 and twice on
  2026-10-06. The spellings given for 2026-10-06 are
  `R=$(mktemp -d <scratchpad>/x.XXXX); cd $R && git init -q && git add . && git commit -qm f` and a
  `git -C $R commit`; the full text of the second command is not recorded anywhere, so whether it
  assigned `R` itself is UNKNOWN. Both were worked around by spawning git from a node script, which the
  text refusal never sees. That workaround is the channel BACKLOG §269 measured carrying a real,
  unchecked publish through (ADR-061's 2026-09-23 amendment).
- **Why it refuses (read 2026-10-06 at `3ff59fb`).** `publishCommandIn` (`plugin/scripts/lifecycle.mjs:4221`)
  names `git commit` in both spellings. `publishVerdict` (`:5010`) judges the session's working directory,
  not the repository the commit lands in. `publishUnchecked` (`:5111-5133`) leaves a plain invocation to
  git in an armed session, but `leavesHookInPlace` (`:4986`) returns false for any `$` or backtick
  (`:4990`), so both spellings keep the refusal armed or not. BACKLOG's 2026-09-30 entry, "A refusal of a
  commit in a scratch repository, classified as by design", names exactly that line.
- **What the hook can see (measured 2026-10-06 through `shellWords`, `plugin/scripts/shell-words.mjs:19-23`).**
  The first spelling splits into five commands: a bare assignment whose `substitutions` holds
  `mktemp -d <template>` and whose `ended` is `;`; `cd $R` with word 1 `dynamic`; `git init -q`,
  `git add .`, `git commit -qm f`, each `ended` `&&`. `R`'s VALUE is not visible and cannot be; only that
  it was assigned from a `mktemp -d` substitution, how each command is joined, and where `$R` stands. A
  subshell `( … )` shows only as an `ended` of `)` on its last command; the opening paren leaves no mark.
- **Measured 2026-10-06** (git 2.56.0, GNU bash 3.2.57, zsh 5.9.2, macOS `sh`; scratch directories only):

  | Case | Result |
  |------|--------|
  | `R=$(mktemp -d /nonexistent/x.XXXX); …` | `R` is empty, status 1, and the `;` runs on |
  | then `cd "$R"` (quoted, empty) | exit 0, the directory is unchanged — bash, zsh and sh |
  | then `cd $R` (unquoted, empty) | exit 0, the directory becomes `$HOME` — bash, zsh and sh |
  | `R=$(mktemp -d /nonexistent/x.XXXX) && …` | the chain stops, status 1 |
  | `git init` in an existing repository | exit 0, "Reinitialized existing Git repository" |
  | `git init` in an empty directory inside a repository | a nested repository; `rev-parse --show-toplevel` names the nested one |
  | `git -C "" rev-parse --show-toplevel` | the current directory's repository |

  **So the owner's first spelling cannot be proven safe from its text.** Where `mktemp` fails, `;` carries
  on; a quoted `cd "$R"` stays in the session's checkout, `git init` reinitialises it with exit 0, and the
  commit lands HERE, unchecked. Only `&&` after the assignment proves `R` names a directory `mktemp` made.
- **Measured 2026-10-06, git 2.56.0: a target repository's own config does not switch off a hook injected
  through `GIT_CONFIG_COUNT`.** With a probe hook injected as ADR-066 injects its own
  (`hook.probe.command`, `.event`, `.enabled=true`), `git hook run prepare-commit-msg` ran it after the
  scratch repository set, one at a time, a local `hook.probe.command`, an empty `hook.probe.event`,
  `hook.probe.enabled=false`, and `core.hooksPath=/dev/null`. ADR-066 measured only the `enabled` key.
  So in an armed session a directory operand, wherever it points, cannot remove git's own refusal. Git
  then judges the repository the commit lands in: a fresh repository holds no log for this session and
  passes (ADR-066 Decision 2, `tests/publish-hook.test.mjs:300`, "a scratch repository still passes"),
  and this checkout, reached through a failed `mktemp`, is refused.
- **Whether the refused sessions were armed is UNKNOWN.** This drafting session's Bash carries the
  exports (`GIT_CONFIG_COUNT` set, `CLAUDE_CODE_SESSION_ID` set); no session log of the refusals was read.
  BACKLOG's 2026-09-30 entry attributes its refusal to `leavesHookInPlace`, but `:5125` evaluates that
  predicate before it checks for `publish.hook-ran`, so the attribution does not show that session was
  armed either. The 2026-10-06 recurrence "inside a read-only triage subagent" may instead have met ADR-060's
  reviewer guard (`readOnlyVerdict`, `:4249`), which refuses any commit by a role in `READ_ONLY_ROLES`
  whatever the repository; which refusal it was is UNKNOWN.
- **The class: every site that decides a publish refusal on a command's text.** Enumerated with
  `mrw read --grep 'publishUnchecked|publishCommandIn|leavesHookInPlace|readOnlyVerdict|publishVerdict' plugin/scripts plugin/bin`,
  2026-10-06: `plugin/scripts/lifecycle.mjs` (15 sites), `plugin/scripts/publish-hook.mjs` (3) and
  `plugin/scripts/reviewer-guard.mjs` (3). `publishUnchecked` is the one text decision that refuses for
  ADR-061. `publish-hook.mjs` judges at git's event, in the real repository, and needs no change.
  `reviewer-guard.mjs` is ADR-060's guard and is left out on purpose (Out of Scope).
- **CLAUDE.md §16 governs this change.** A block needs stronger evidence than advice, and every "this is
  data" row needs a "this is code again" twin beside it. Each exemption below turns a refusal into ADVICE,
  never into silence, and each has its twins.

## Existing Primitives Audit

- **`shellWords`** (`plugin/scripts/shell-words.mjs:26`): reused as is. Its `assignments`,
  `substitutions`, `dynamic`, `ended` and `pipeTo` fields are everything both tasks read; no new lexing.
- **`leavesHookInPlace`** (`lifecycle.mjs:4986`): T1 narrows its `$` rule (`:4990`) for one shape. Its
  quoting, expansion, `.git/`, `hookspath` and environment-name rules (`:4993-4999`) are unchanged and
  still apply to the whole text.
- **`publishUnchecked`** (`:5111`): T2 adds one branch beside ADR-066's armed downgrade (`:5125-5128`),
  in the same Bash-only position.
- **The environment-name rule** (`:4999`) and **`HOOK_UNSAFE_FIRST`** (`:4870`): reused by T2's grammar,
  not restated.
- **`commitOnlyCommand`** (`:814`) and ADR-081's fast-pass advisory (`:5067-5078`): the model for T2's
  advisory shape and keyed dedupe; not changed.
- **`armedSession`** (`tests/publish-command.test.mjs:325`): both tasks' tests drive the real PreToolUse
  hook through it, armed and unarmed.

## Decision

A **fresh-directory variable** is a name `V`, outside the environment names `:4999` rejects, whose only
assignment in the command text is a bare assignment command `V=$(mktemp -d <literal words>)`: no other
word in that substitution, no `$`, backtick or glob in its operands, and no `export`, `local` or later
reassignment of `V`.

1. **Armed: a fresh-directory variable used as a directory is plain text (T1).** `leavesHookInPlace`
   treats `$V` and `"$V"` as plain when `V` is a fresh-directory variable assigned earlier in the text
   and the word is the only operand of `cd`, the value of `git -C`, or the directory operand of
   `git init`. The `mktemp -d` substitution of that assignment is plain too. Every other `$` or backtick
   still returns false, and every other rule of the function is unchanged. In an armed Bash session the
   first observed spelling, `;` included, becomes ADR-066's existing advice, and so does the second
   wherever its command assigned `R` from `mktemp -d` in the same text. Whether it did is UNKNOWN; a bare
   `git -C $R commit` stays refused (T1's twin). Git's hook then judges the repository the commit lands in.
2. **Unarmed: an `&&`-chain the text proves is advised (T2).** `publishUnchecked` advises instead of
   refusing a Bash command when ALL of these hold:
   - the parse is complete, with no heredoc, no pipe, and no command ending in `)`;
   - the first command is the fresh-directory assignment, and every command after it is joined by `&&`
     (no `;`, newline, `||`, `|` or `&`);
   - the second command is `cd "$V"` or `cd $V`, and the third is `git init` with no operand and no
     option but `-q` or `--quiet`;
   - every later command is `git`, with no option before its verb but `-c user.name=…` and
     `-c user.email=…`, and a verb of `add` or `commit`;
   - every publish invocation in the text is a commit;
   - the text holds no name `:4999` rejects.

   The advice says the commit lands in a repository the command creates, so this checkout's unchecked
   state does not refuse it, and that `qh-check` is still needed if the commit was meant for this checkout.
   Its key is the verdict's key with `:fresh` appended, so it is said once per tree and does not swallow a
   later mention's advice.
3. **Nothing else changes.** A `;`-joined spelling in an unarmed session is still refused. So are a push,
   PowerShell, git's own hook, the `"publish": "warn"` opt-out and the reviewer guard, which are untouched.

**This fails if**, through the real PreToolUse hook, any twin row in T1's or T2's Tests table is not
refused on an unchecked tree. It also fails if a data row is refused, or if a data row run under bash
commits anywhere but the repository it created. The `;` row run with a failing `mktemp` must commit into
the session's repository, as measured; T2's executing test replays that. Valid for POSIX shells under the
Bash tool. The measurements are git 2.56.0, bash 3.2.57 and zsh 5.9.2 on macOS. Whether another `cd`
treats an empty operand otherwise is unmeasured, and only T2 depends on it.

## Alternatives Considered

- **(a) Leave it as is.** Staging through a node script is the documented workaround. Rejected because
  that workaround is the text refusal's blind spot: every false refusal teaches a session to route git
  through a script, and BACKLOG §269 measured a real unchecked push travelling that way. The refusal
  costs a turn each time and buys no protection, because the target was never this checkout.
- **(b) The exemption, as decided.** Chosen. It is two arms, because the armed arm can lean on git's
  event-time hook and so needs less proof, while the unarmed arm has only the text.
- **(c) `"publish": "warn"` in `.quality-harness.json`.** Rejected as the fix. It exists, and it turns
  EVERY refusal in a project into a warning, including the unchecked commits into this checkout that
  ADR-061 exists for. An adopter can still choose it.
- **(d) Resolve `$R` by running the substitution, or `realpath` a `cd` target, before the command runs.**
  Rejected: it executes the command's own text ahead of the command, and its answer can differ from the
  answer the command gets.
- **(e) Exempt a commit whose literal `cd` or `-C` path is outside this checkout** (the literal-path twin
  BACKLOG's 2026-09-30 entry names). Deferred. It was never observed, and it needs measured symlink,
  `/private/tmp`, case-folding and `..` rows, plus its own "this is code again" twins such as `cd .` and
  `cd "$(git rev-parse --show-toplevel)"`.
- **(f) Exempt silently, with no advice.** Rejected under CLAUDE.md §16: a classification that removes a
  refusal says so. The line costs one advisory per tree, because it is keyed.
- **(g) Accept any `git init` before the commit as proof.** Rejected on measurement: `git init` in an
  existing repository exits 0, so `git init -q && git commit` from this checkout commits here.

## Component / Boundary Impact

None — internal to rule P in `plugin/scripts/lifecycle.mjs`. The host boundary, git's hook and the session log's events are unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PreToolUse `permissionDecision` for a Bash command | an armed fresh-directory commit gets ADR-066's advice instead of `deny` | T1 | Claude Code |
| PreToolUse `permissionDecision` and rule P text for a Bash command | an unarmed `&&`-chain fresh-repository commit gets new advice, keyed `<key>:fresh`, instead of `deny` | T2 | Claude Code, the session log's `action.emitted` dedupe |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the fresh-directory variable reading (`freshDirectoryVariables`) | T1 | T2 | No — T2 reads the same definition rather than restating it |

## Implementation

See `docs/adr/ADR-086-a-fresh-repository-commit-is-not-refused/tasks/README.md`.

## Consequences

- **Positive:** a session can stage and commit a scratch repository in one Bash command without routing
  git through a script, so the workaround that hid real publishes from the text refusal is no longer
  needed for this case.
- **Negative:** in an unarmed session the owner's observed `;` spelling is still refused. It only becomes
  advice when written with `&&`, which the refusal text does not yet suggest (Follow-ups). And because
  T2's grammar admits no program between `cd "$V"` and the commit, the directory is empty when `git add`
  runs. So an unarmed session can only make an empty-tree commit (`--allow-empty`) this way. The observed
  use, staging a fixture, is served only when armed. The armed arm rests on git's event-time hook. Where a
  session is armed but git's hook cannot start (its own message, "could not start … was not judged"), the
  scratch-to-checkout fail-open of a failed `mktemp` is not refused at all.
- **Neutral:** one more advisory line per tree in sessions that do this; the reviewer guard and git's hook are unchanged.

## Out of Scope

- A commit with a literal `cd` or `-C` path outside this checkout (deferred: docs/BACKLOG.md, the ADR-074 leftovers entry "A candidate false refusal in the publish hook" and the 2026-09-30 literal-path twin)
- Unarmed staging forms with a program between `cd "$V"` and the commit, such as `cp -R <fixture>/. .` (permanent: boundary: any program can write `$V/.git` as a gitfile pointing at this checkout's repository, so the text cannot prove where the commit lands; the armed arm covers them through git's hook)
- The `git -C "$V"` form in an unarmed session (permanent: boundary: T2 proves only the `cd` form; the armed arm covers `-C`)
- A push from a fresh repository (permanent: boundary: `git remote add o <this checkout> && git push o` publishes into this checkout, and nothing in the text proves otherwise)
- ADR-060's reviewer guard (permanent: boundary: a read-only role commits nowhere, whatever the repository)
- PowerShell (permanent: boundary: `shellWords` reads POSIX shell text, and PowerShell does not source the env file ADR-066 arms)
- Session-environment `GIT_DIR` or `GIT_WORK_TREE` set outside the command (permanent: boundary: the hook judges the command's own text, as `leavesHookInPlace` already says at `:4983-4984`)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A form T2's grammar admits commits into this checkout | Low | High | every admitted row is executed under bash by T2's executing test; the grammar admits no program and no non-`&&` joiner; twins for each measured escape |
| The armed arm's directory operand reaches a repository whose config removes git's hook | Low | High | measured 2026-10-06 that local `command`, `event`, `enabled` and `core.hooksPath` do not; T1 re-measures in its test |
| A `mktemp` shadowed by a function or alias defined in the same text | Low | Med | T2 admits no command before the assignment and no function definition, and `alias` is in `HOOK_UNSAFE_FIRST`; T1 inherits the same rules |
| Advice that a session reads as permission to commit into this checkout | Low | Low | the text names the fresh repository and says `qh-check` is still needed for this checkout |

## Rollback

Revert T1's and T2's commits. No stored format changes; the `:fresh` advisory keys already in a session log are ignored by the older code.

## Follow-ups

- [ ] Owner decision: amend CLAUDE.md §3's sentence on the sanctioned refusal to name this exemption, once Accepted.
- [ ] Owner decision: should the unarmed refusal text name the `&&` spelling T2 accepts, so a `;` spelling is corrected rather than routed through a script?
- [ ] Observed while drafting, not investigated: this session's `GIT_CONFIG_COUNT` was 18, the six ADR-066 keys repeated three times, although ADR-066 Decision 3 says the exports are skipped when the env file already carries them.
- [ ] Owner decision: does T2 earn its surface? It can only advise an empty-tree commit (Consequences). Withdrawing T2 leaves the unarmed path exactly as ADR-061 has it, and T1 still serves armed sessions.
