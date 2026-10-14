# ADR-098: What the plugin says matches what it does

**Status:** Accepted
**Date:** 2026-10-12
**Owner:** zy
**Spec:** None — no spec stage; the evidence is in Context, each claim re-read at its cited line on 2026-10-12
**Cross-references:** ADR-005, ADR-029, ADR-053, ADR-057, ADR-060, ADR-061, ADR-062, ADR-066, ADR-068, ADR-080, ADR-092, ADR-096, CLAUDE.md, .claude/rules/12-reviews.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** `ADR-098 T1: the codex-review skill launches through host-review`, `ADR-098 T2: review-ring's severity enum is blocking or advisory`, `advice: the ADR-ownership notice says nothing is blocked (ADR-098 T3)`
**Invalidates:** ADR-062 — its Decision "`codex` uses the invocation the review skill already specifies" (line 27) and its Existing Primitives "`codex-review` already pins `gpt-6-astra`" (line 19) stop being true: the skills launch through `host-review.mjs` and the pin becomes `gpt-6.1-sol` (T1).
**Served-path change:** A Codex review or advice started by either Codex skill runs through `host-review.mjs` with stdin closed, a hard-killed budget and the `gpt-6.1-sol` pin; every reviewer applies one blocking definition and one severity vocabulary, and every editing role is told not to publish; and the per-edit ADR-ownership notice stops telling the model it "blocks at commit and completion".

## Context

Phase 1 of the redesign the owner approved on 2026-10-12 is "subtract, and repair what misleads" (the measurements behind it are in
`docs/BACKLOG.md` §378). ADR-097, drafted the same day, takes the subtractions and defers these four repairs to this record by number.
A read-only audit of 2026-10-12 found each; every claim below was re-read at the cited line before it was written here.

**1. Three Codex command builders, and two of them can hang.**
- `plugin/scripts/host-review.mjs:113-118` builds `codex exec -C <repo> -s read-only -m CODEX_MODEL -c model_reasoning_effort=… -c sandbox_mode="read-only" --ephemeral <prompt>`
  with `timeout: 600_000` and no `input`, so Node closes the child's stdin (probed 2026-10-12: `spawnSync('cat', [], …)` returned in 3 ms).
  `CODEX_MODEL` is `'gpt-6-astra'` (`:11`). It passes neither `-o` nor `--ignore-user-config`, and reads the review from stdout (`:122`).
- `plugin/skills/codex-review/SKILL.md:137-142` and `:160-165`, and `plugin/skills/codex-advise/SKILL.md:74-80`, each write their own
  `codex exec` line, with `-o <unique output>`, and with `--ignore-user-config` when `exec --help` lists it (`codex-review:124`,
  `codex-advise:69-70`). Neither sets a budget ("Run Codex in the foreground, wait for its exit", `codex-review:33-34`; `codex-advise:70`)
  and neither redirects stdin: `git grep -n -E "dev/null|stdin|timeout" -- plugin/skills/codex-review plugin/skills/codex-advise` printed nothing.
- The rule that requires the redirect, `.claude/rules/12-reviews.md:26-28` ("`codex exec` blocks on an open stdin and hangs
  indefinitely … Always `< /dev/null`, and wrap it in a hard kill"), is repository guidance and does not ship.
- The pin: `git grep -n "gpt-6-astra" -- plugin` printed 8 lines (host-review `:11`; codex-advise `:30`, `:60`, `:76`; codex-review `:29`,
  `:94`, `:139`, `:162`), and both skills' descriptions say "GPT-6 Astra" (`:4` of each). The owner's reviewer since 2026-10-06 is
  `gpt-6.1-sol` at high effort; `git grep -n -i "gpt-6.1-sol" -- plugin` printed 35 shipped comment lines crediting its reviews.
- The review CLI exists (`host-review.mjs:146-158`), and `plugin/skills/quality-policy/SKILL.md` already routes quality-cycle's Codex pass
  through it. What the two skills lack is a way to send their own prompt through it. Their output shapes differ on purpose: quality-cycle
  needs ADR-062's JSON schema; the skills ask for a `VERDICT:` text block (`codex-review:173-180`) or an advice block (`codex-advise:91-99`).

**2. Two blocking definitions, two severity vocabularies, and the leaf contract said twice.**
- `git grep -n -i -E "blocks only when|blocking only if|blocking finding must|a blocker (must|requires)" -- plugin` printed 7 lines in 6
  files. Definition A (in scope or caused by the diff; material; exact evidence; a minimal in-scope remedy; why passing evidence does not
  settle it): `plugin/skills/quality-policy/SKILL.md:58-65`, `plugin/agents/qh-synthesis.md:23-26`, `plugin/workflows/quality-cycle.js:107`.
  Definition B (violated contract; exact location; reachable failure path; impact; smallest fix): `plugin/skills/review/SKILL.md:47-51`,
  `plugin/workflows/review-ring.js:89`. A hybrid (in scope, material, exactly evidenced, reproducible or contract-backed, minimally
  fixable): `plugin/agents/qh-correctness-reviewer.md:22-23` and `plugin/workflows/quality-cycle.js:56`.
- Severity: `review-ring.js:59` allows `blocking|minor` and returns `minors` (`:98-129`); `quality-cycle.js:47` and `host-review.mjs:32`
  allow `blocking|advisory`. `git grep -n minors -- plugin tests` names only `review-ring.js`.
- `git grep -n -i -E "leaf (role|reviewer)|read-only leaf|-LEAF:|you are a leaf|a leaf role" -- plugin` printed 22 lines in 15 files, 6 of
  them `CODEX-*-LEAF:` markers. The `SubagentStart` hook already gives every Claude subagent the contract (`plugin/scripts/completion-rules.mjs:374-397`,
  delivered by `on-subagent-start.mjs:10`, pinned in `tests/goldens/other-events.json:22`); the four shipped agent files repeat "You are a
  leaf" (`qh-correctness-reviewer.md:30`, `qh-narrow-fixer.md:19`, `qh-scope-reviewer.md:29`, `qh-synthesis.md:33`), and so do the workflow
  prompts. CLAUDE.md §19: an always-on byte is paid by every adopter.
- A workflow script cannot import a module (ADR-062 Revision 2), so a single source for prompt text there is a mirror held equal by a
  test, the shape ADR-092 already uses for the record definition.

**3. A shipped sentence claims a block that does not exist.** `plugin/scripts/facts-gate-dispatch.sh:354` prints, at PostToolUse, "facts-first
gate (ADR ownership) not satisfied yet for %s … It blocks at commit and completion.", and `run-shell-hook.mjs:385-394` hands that stdout to
the model as `additionalContext`. The same file's other PostToolUse notice says the opposite (`:458`: "Nothing is blocked — this is what the
gate sees, not a refusal"). Rule A queues an action with no `deny` (`artifact-pass.mjs:452`); `git grep -n "deny: " -- plugin/scripts` names
only `publish-verdict.mjs`, and the reviewer guard's deny is `on-pre-tool-use.mjs:23`. The plugin's refusals are exactly ADR-061's and
ADR-060's (CLAUDE.md §3), and since ADR-080 the artifact pass runs behind the boundary, its findings said at the next hook. The class,
`git grep -n -i -E "\bblocks? (at|final|the commit|completion|the boundary)|blocking failure|still blocks|and blocks" -- plugin/scripts plugin/bin plugin/hooks plugin/skills plugin/agents`,
printed 6 lines in 4 files: `facts-gate-dispatch.sh:3`, `:13` and `run-shell-hook.mjs:384` are members; `adr-lint:3566` and `:4989` speak of
adr-lint's own blocking exit (CLAUDE.md §3's `errors.append`) and `claims-rate.mjs:145` says "blocks nothing", so those three are not. Two
members that regex misses: the printed sentence at `:354` and `artifact-pass.mjs:69-70` ("Running out of window is itself a blocking
failure", two lines after `:67`, "a hook that dies on that deadline blocks nothing"); `git grep -n -E "It blocks at|is itself a blocking" -- plugin` finds both.

**4. The bare-mention advice fired 417 times in 18 main transcripts, armed or not; its repair is deferred.** `publish-verdict.mjs:318` (and
`:214`, `:247` on unobserved or torn state) says "… only mentions commit or push — a grep, an echo, a file name, or a form this hook does
not parse. Advisory; nothing is refused." Counted 2026-10-12 over this repository's Claude Code transcripts, as `hook_additional_context`
attachments carrying that text: 417 in 18 main transcripts and 74 in subagent transcripts. In the session that drafted this record the
session log holds `publish.hook-ran` (git's own hook is armed, ADR-066 Decision 3), and the advice was still delivered on read-only `grep`
calls. ADR-066 already leaves a proven plain invocation to git in an armed session (`publish-verdict.mjs:334-341`), and git's hook judges
every commit and push at the event whatever text launched it (`publish-hook.mjs:62-95`), unless the command switched that hook off.
`leavesHookInPlace` (`publish-command.mjs:1133-1156`) refuses the environment names git or the session reads (`HOOK_ENVIRONMENT_NAMES`,
`:846`), `hookspath` and `.git/` (`:1151`), and run-time construction (`$`, backticks, arithmetic). Measured 2026-10-12 over the 417
commands that drew the advice (their text only; not every one ran in an armed session): keeping the advice whenever the text names a
hook-environment variable, `hookspath`, `.git/`, `--no-verify` or `eval` would have kept it on 104 and dropped it on 313; keeping it also
on any `$` or backtick would drop it on 27; `leavesHookInPlace`'s whole grammar would drop it on 11.

A first form of the repair (say nothing for a mention in an armed Bash session whose text names none of those vectors) was drafted here
and withdrawn the same day, after a cold Codex review of this record found it fails open twice. The next attempt starts from both
counterexamples (CLAUDE.md §16: every "this is data" exemption needs its "this is code again" twin):
- **A raw-text predicate cannot see a static shell spelling that switches the hook off.** `unset G"I"T_CONFIG_COUNT; sh release.sh # commit`
  is a mention (`invoked` is null), and neither `HOOK_ENVIRONMENT_NAMES` nor the `hookspath`/`.git/` check matches its text (checked
  2026-10-12), yet bash removes the variable (reproduced 2026-10-12: after `export GIT_CONFIG_COUNT=3; unset G"I"T_CONFIG_COUNT` it is
  unset), and the session's injection of git's hook rests on it (`publish-verdict.mjs:119-121`). Suppressed there, the script publishes
  with the hook gone and nothing said.
- **Under `"publish": "warn"`, git's hook says nothing either.** `publish-hook.mjs:93` returns no message for a verdict that does not deny
  unless it is a fast pass or could-not-look, so in a warn-mode project the PreToolUse mention line is the only warning there is, and
  suppressing it turns a warning into silence.

Measured while drafting that repair: `publish-verdict.mjs:338-339` downgrades ADR-061's refusal when any `publish.hook-ran` is in the log,
while ADR-068's `awaitingArming` (`:127-130`) says a hook run before the latest offer is not arming. This record does not change `:339`
(see Follow-ups).

## Existing Primitives Audit

- `hostReview` and `resolveCodex` (`host-review.mjs:70-123`) already resolve the binary and build the review invocation: reshaped into the
  one builder; nothing is added beside it.
- `subagentContract` (`completion-rules.mjs:374-397`) already is the leaf contract for Claude subagents: kept as the one definition, unchanged.
- ADR-092's one definition with a tested mirror: reused for the blocking criteria where nothing can be loaded at run time.
- The hook goldens (`tests/hook-goldens.test.mjs`, `tests/goldens/`) already pin each event's output.

## Decision

1. **One Codex launcher (T1).** `host-review.mjs` is the only code that builds a `codex exec` command line. It always passes `-C <repo>`,
   `-s read-only`, `-c sandbox_mode="read-only"`, `--ephemeral`, `-m CODEX_MODEL` with the effort, `-o` into a fresh temporary directory it
   removes after reading (the file is the answer, and stdout only when the file is empty), and `--ignore-user-config` when the resolved binary's `exec --help` lists it. Stdin is `'ignore'` (a spawn's
   `/dev/null`). The run has one budget, `CODEX_TIMEOUT_MS` (600 s, today's value), after which it is killed with `SIGKILL` and the result
   is `unavailable` naming the budget, never clean. `CODEX_MODEL` becomes `gpt-6.1-sol`, the one place the pin is written. A new CLI form,
   `--host codex --prompt-file <path>`, sends a caller's prompt through the same builder and prints Codex's final message verbatim; both
   skills use it and keep their own prompt contracts, recursion markers and output blocks. It fails if a skill still writes a `codex exec`
   line, if a Codex run can block on stdin or outlive its budget, or if `gpt-6-astra` remains in `plugin/`.
2. **One blocking definition, one severity vocabulary, the leaf contract once per audience (T2).** The canonical blocking criteria are
   definition A, kept in `plugin/skills/review/SKILL.md` under `## Blocking findings` between marker comments, with all five of A's
   conditions, including the two B lacks: "a minimal in-scope remedy" and why "existing passing evidence does not already settle" the
   concern. T2's test asserts that content in the canonical block itself, so copying B into every place cannot pass it. B's "reachable
   failure path" is A's "direct trace"; B's other parts are A's in other words, and B's fields stay as review-ring's finding schema. Places
   that load nothing at run time carry a verbatim mirror held equal by a test: `qh-correctness-reviewer.md` and `qh-synthesis.md` (their
   system prompts), and `host-review.mjs`'s review prompt (Codex). Places that spawn or load a carrier reference it: `quality-policy` (the
   coordinator reads the review skill), `quality-cycle.js` (its roles are those two agents) and `review-ring.js` (its reviewer invokes the
   review skill). Severity is `blocking` or `advisory` everywhere; review-ring's `minor` becomes `advisory` and its result key `minors`
   becomes `advisories`. The leaf contract is `subagentContract` for a Claude subagent and `host-review.mjs`'s first prompt line plus the
   `CODEX-*-LEAF:` markers for a Codex session. Three agent files drop their "You are a leaf" line; `qh-narrow-fixer.md` replaces its
   line with "You do not commit or push." The workflow prompts (`consensus.js:30` included, which holds two sentences today) keep one role
   sentence (the substrings locked tests pin) and drop the rules the hook already gives, provided T2's S2 observes `SubagentStart` firing
   for a workflow's `agent()`. Every editing role keeps an explicit prohibition on publishing, because `subagentContract` gives an editing
   role none (`completion-rules.mjs:377-387`) and ADR-060's reviewer guard fences only read-only roles: review-ring's fixer prompt keeps
   "Do not commit or push." (`review-ring.js:116`), `qh-narrow-fixer.md` (the one agent whose `tools:` lists `Edit` and `Write`) gains
   it, and the execution skill keeps `:46`. It fails if two different blocking definitions remain, the canonical block is not definition
   A, a mirror drifts, any schema accepts `minor`, or an editing role loses its publish prohibition.
3. **Advice says it is advice (T3).** The ADR-ownership notice says nothing is blocked and when the artifact pass looks again (at a
   publish request, at turn end and at session end: `artifactRule` is imported by `on-pre-tool-use.mjs:8`, `on-turn-end.mjs:6` and
   `on-session-end.mjs:8`); the comments that say otherwise are corrected to what the code does. It fails if any member of the class
   above still claims the artifact gate blocks.
4. **The bare-mention repair is not taken here.** Its first form failed open twice (Context §4); it is deferred with both
   counterexamples, and the advice stays exactly as it is today.

Every task's Acceptance fence is red today: each names test titles in a file that does not exist yet, and T1's and T2's also count
lines in `plugin/` whose post-state differs from today's.

## Alternatives Considered

- **Make the skills parse ADR-062's JSON instead of their own blocks (one output shape).** Rejected: advice has no review schema, and the
  skills' blocks carry fields the schema lacks (TARGET, INSPECTED, RESIDUAL RISKS). One launcher removes every defect measured.
- **Write the redirect and a `gtimeout` into each skill's command (three builders, each fixed).** Rejected: that is the drift measured
  here; the skills already disagree with host-review on `-o` and `--ignore-user-config`.
- **Make definition B canonical.** Rejected: A is what the synthesis that decides a cycle applies, and A's fifth condition (why passing
  evidence does not settle it) has no counterpart in B.
- **Put the blocking criteria into the `SubagentStart` contract.** Rejected (CLAUDE.md §19): every subagent of every adopter would pay for
  text only reviewers use.

## Component / Boundary Impact

`host-review.mjs` becomes the only Codex launcher (argv, stdin, budget, pin); the codex skills own only their prompts and output
contracts. `plugin/skills/review/SKILL.md` owns the blocking criteria; `completion-rules.mjs` keeps owning the Claude leaf contract.
`facts-gate-dispatch.sh`, `run-shell-hook.mjs` and
`artifact-pass.mjs` change text and comments, not behaviour. Each has one reason to change after this.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `host-review.mjs` CLI | new `--host codex --prompt-file <path>` form: prints the final message; exit 2 with a reason on failure or timeout | T1 | `codex-review`, `codex-advise` skills |
| `host-review.mjs` `CODEX_MODEL` | `gpt-6.1-sol` | T1 | quality-cycle's Codex pass, both skills, the result's `model` field |
| Codex child process | stdin `ignore`; `-o` file; `--ignore-user-config` when listed; `SIGKILL` at `CODEX_TIMEOUT_MS` | T1 | the Codex CLI |
| `reviewPrompt` | gains the blocking-criteria mirror | T2 | Codex |
| review-ring workflow result | severity `minor` becomes `advisory`; key `minors` becomes `advisories` | T2 | whoever invokes `/quality-harness:review-ring` (no reader in `plugin/` or `tests/`: `git grep -n minors`) |
| agent definitions, workflow prompts | leaf line removed or shortened; blocking text mirrored or referenced | T2 | Claude Code subagents |
| PostToolUse `additionalContext` (ADR ownership) | no longer claims a block | T3 | the model |
| `.claude/rules/12-reviews.md:26-28` | the launcher closes stdin and kills at its budget | T1 | sessions in this repository |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `reviewPrompt` in `host-review.mjs` in its post-T1 form | T1 | T2 | No: T2 adds the criteria mirror to the prompt T1 leaves |

## Implementation

See `tasks/README.md`: T1 (one Codex launcher), T2 (one review contract), T3 (advice says advice).

## Consequences

- **Positive:** no Codex run the plugin starts can hang on stdin or run unbounded; the reviewer model is one constant; every reviewer
  applies one definition; every editing role is told not to publish; the model is no longer told a block exists.
- **Negative:** a skill run needs Node and `host-review.mjs` where it needed only `codex`; review-ring's result key changes; the
  bare-mention advice keeps firing until its deferred repair lands.
- **Neutral:** what each gate judges, both refusals and the `SubagentStart` contract text are unchanged; relock cost is zero in every task
  as planned (counted per task).

## Out of Scope

- Rewriting the codex skills' prompt contracts or output blocks (permanent: boundary: the launcher is the defect; the contracts are the skills' own)
- Pi and Cursor invocations in `host-review.mjs` (permanent: boundary: ADR-062 owns them, and nothing here measured them)
- The removals of the same phase (permanent: boundary: ADR-097 owns them)
- Leaving a bare mention of commit or push to git's own hook where it is armed; Context §4 holds the two counterexamples the next attempt starts from (deferred: docs/BACKLOG.md §378)
- Any new refusal (permanent: boundary: CLAUDE.md §3 keeps exactly two)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `gpt-6.1-sol` absent from an adopter's bundled Codex catalog | Med | Med | T1 S2 measures it; an unlisted model is `unavailable`, never clean |
| 600 s kills a long `ultra` review that would have finished | Med | Low | the result names the budget; the constant is one line |
| `SubagentStart` does not fire for a workflow's `agent()` | Med | Med | T2 S2 observes it first; its Stop Condition keeps the workflow text if not |
| A mirror drifts from the canonical blocking text | Low | Med | T2's test compares them byte for byte after whitespace folding |
| ADR-097 edits `quality-policy/SKILL.md:51-54` while T2 edits `:56-75` | Med | Low | different lines; whichever lands second re-reads the file |

## Rollback

Revert the task's commit. No stored state changes. The one contract change is review-ring's result key (`minors` to `advisories`),
which nothing in `plugin/` or `tests/` reads.

## Follow-ups

- [x] Owner decision: `publish-verdict.mjs:338-339` downgrades ADR-061's refusal when any `publish.hook-ran` is in the log, while ADR-068's `awaitingArming` treats a hook run before the latest offer as not arming. Using `awaitingArming` there too would refuse a plain commit in that window (the fail-closed direction). Found while drafting the deferred mention repair; not reproduced live.
  Answered 2026-10-14 (owner: reproduce first). Reproduced at the PreToolUse boundary: `tests/publish-command.test.mjs` "a hook run before the latest offer does not arm the session" failed on the old line, since a new offer is recorded only for a new env file, which Bash reads only from the next prompt. Fixed: `armedByGit` in `publish-verdict.mjs` applies `awaitingArming`, so the window keeps ADR-061's refusal (`"publish": "warn"` still opts out); its catalogue mutant is killed.
- [x] Owner action: adr-write's step 5 asks for one cold read-only review of a split-task record before it is presented; the drafting session was a leaf role not permitted to spawn one, so none was run.
  Run 2026-10-14 (a read-only correctness reviewer, at `40b59917`; its Acceptance fences re-run green). Two blocking findings fixed the same day: T3's ownership notice promised a re-check "at the next publish, turn end or session end" that SessionEnd never runs and that the artifact pass skips for content it already answered (the notice now says it is not checked again until the file changes); and T1's own-launch pattern saw only a quoted binary (a second test finds any spelling, with an unquoted catalogue mutant). Outside the record, `host-review --range` refused a dotted release tag; fixed. The six advisory findings are in docs/BACKLOG.md §378.
