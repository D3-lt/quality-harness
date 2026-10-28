# ADR-120: Nothing left out — the shell grammar, a retired spec fact, the session's own plugin, a Stop that can act

**Status:** Accepted
**Date:** 2026-10-21
**Owner:** Zy
**Spec:** None — no spec stage; the owner's approved plan of 2026-10-21 over what ADR-119 named as left out, explored read-only at ee802e5d
**Cross-references:** docs/BACKLOG.md, docs/adr-archive/ADR-040-sessionstart-ready-uses-the-listing.md, docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-067-the-publish-classifier-reads-the-command-as-the-shell-splits-it.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-097-remove-what-nothing-acts-on.md, docs/adr/ADR-099-sessionstart-does-not-list-ready-tasks.md, docs/adr/ADR-108-the-hooks-say-what-to-do-next.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-111-the-turn-end-judges-against-a-baseline.md, docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work.md, docs/adr/ADR-116-qh-ships-as-release-assets-fetched-and-verified.md, docs/adr/ADR-119-what-the-backlog-still-holds.md
**Governs:** `plugin/scripts/shell-words.mjs`, `core/hooks/shellwords.go`, `plugin/scripts/shell-grammar.mjs`, `core/hooks/shellgrammar.go`, `plugin/scripts/check-command.mjs`, `core/hooks/checkcmd.go`, `core/hooks/publishcmd.go`, `core/hooks/publishcmd.go`, `plugin/bin/spec-verify`, `plugin/scripts/work-next.mjs`, `plugin/scripts/standalone-link.mjs`, `plugin/bin/qh-root`, `core/hooks/publish.go`, `core/hooks/orientation.go`, `core/hooks/turnend.go`, `core/hooks/turnend.go`, `plugin/lib/record.py`, `plugin/bin/adr-lint`, `plugin/bin/adr-next`, `plugin/templates/tasks-readme-template.md`, `plugin/scripts/check-ledger.mjs`, `core/hooks/ledger.go`, `plugin/scripts/publish-hook.mjs`, `plugin/bin/adr-verify`, `plugin/scripts/branch-state.mjs`, `plugin/scripts/facts-gate-dispatch.sh`, `core/hooks/artifact.go`, `plugin/templates/task-template.md`
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per mechanism; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-096 — its Decision continues a turn on any check; under T6 the two rules that tell the agent to run the check (R1, an unchecked tree; R2, unchecked commits) continue the turn only when the check is declared, and on an inferred check reach the user alone. Every other rule (A, W, N, R4, R5) and every other origin (`none`, `refused`, `unreadable`, `unproven`) keeps ADR-096's, ADR-108's and ADR-111's delivery unchanged. ADR-097 — its deferral of removing `post-edit-check.sh` until a retirement tag exists becomes a decision against removal (T3). ADR-119 T3 — its narrow reading of a stop word in a sign-off (any negative word in the note's own words stops it) becomes, under T7, the note's last verdict word deciding; the forms it neutralised stay neutralised. ADR-096's locked tests in `tests/turn-end-delivery.test.mjs` (36 locks over ADR-096 T1–T3, from `python3 scripts/test-locks.py tests/turn-end-delivery.test.mjs` on 2026-10-21) stay byte-identical unless a row's fixture asserts R1 or R2 on an inferred check, which T6 then relocks with its reason.
**Served-path change:** a declared check whose exit status the shell grammar fixes under every POSIX shell is refused, including a skipped group, a negated group, a POSIX function definition and a shadowed builtin; a check using bash-only syntax is no longer refused as constant; a group piped to a shell or to xargs is read through the bytes it prints; a spec fact can be tagged `@retired`; a home-directory forwarder runs the session's own plugin copy; the §390 relock advice is said once per check pair; a Stop continues a turn to run the check only when the project declared it; adr-next evaluates a cross-record dependency in a corpus named `NNN-slug.md`; a sign-off's last verdict word decides whether it stops; a withdrawn task reads stopped whatever its evidence; a human sign-off naming a step covers that step only; a pass stands while only declared prose changed, for every reader; adr-verify runs a long fence in the background and records it; a check that cannot start here continues no turn; a commit into another repository named by a relative path is judged by that repository; branch-state reports the session's worktree and says a permanent unknown once; the mention advisory no longer fires on `git stash push`; a mutant fence that never sees the mutated copy is inconclusive, and a missing ignored dependency is could-not-run; an edit that moves another task's locked test names that task at commit; generated specs are not gated.

## Context

ADR-119 shipped in 3.8.50 and named seven things as left out. The owner's direction, 2026-10-21: nothing is left out of a plan
or moved to the backlog during its execution. This record takes the four that are code here, and the bench finding of the same
day; the three that are other records' tasks (ADR-116 T1–T3, ADR-110 T2–T3, ADR-112 T1–T3) are executed in the same plan under
their own records (Implementation).

What three read-only explorations and a cold Codex review found at ee802e5d:

- **The shell fold has no grammar, and the lexer's records cannot carry one.** `plugin/scripts/shell-words.mjs` returns a flat
  list of command records; a group is marked only by `groupEnd`, set only when a pipe follows its `}` (`shell-words.mjs:103-107`,
  `core/hooks/shellwords.go:218-224`), and function syntax is dropped (`shell-words.mjs:54`). `true || { true; false; }` and
  `true || true; false;` lex to identical records, as do `{ npm test;` and `{ npm test; }`. `listStatus`
  (`plugin/scripts/check-command.mjs:185-220`, `core/hooks/checkcmd.go:250-333`) folds that list left to right.
- **What it gets wrong, measured 2026-10-21** under `/bin/bash` and `/bin/sh` (both bash 3.2.57 here) and `/bin/dash`, with
  `npm test` stood in by `false`, against `constantSuccessCheck` at ee802e5d:
  - Accepted, and exit 0 under all three shells: `true || { true; false; }`, `! { true; false; }`, `! { npm test; false; }`,
    `f() { false; } && true`, `{ false & } || false`, `true || true | { cat; false; }`, `false() { :; }; false`.
  - Bash-only syntax: `function f() { false; } && true` and `function f { false; } || false` exit 0 under bash and 2 under
    dash. The first is refused today, which is a false refusal where `/bin/sh` is dash; `qh-check` runs a check through
    `/bin/sh` (`plugin/scripts/qh-check.mjs:46,61`).
  - A real check misread through shadowing: `true() { false; }; true` exits 1 everywhere.
  BACKLOG §381 (`:3202-3206`) records the owner's 2026-10-15 direction for this: a grammar, not another patch.
- **The publish readers cannot see what a group prints** (BACKLOG §393): `{ echo hi; echo 'git push'; } | sh` is read as no
  publish (ADR-066's git hook mitigates it); a nested group loses its boundary (a false refusal); the xargs reader trusts a
  group's last command (`publish-command.mjs:674-678`, `publishcmd.go:1049-1053`). `literalOutput` (`publish-command.mjs:785-787`,
  `publishcmd.go:1256`) yields candidate strings, not stdout bytes, so it cannot be summed as is: `{ printf %s '#'; echo 'git
  push'; } | sh` runs a comment, `printf '%s\n'` in its place runs the push, and `{ printf %s '#' >&2; printf 'git p%s\n' ush;
  } | sh` pushes and is read today as nothing at all.
- **A spec fact cannot be retired** (§381 item 25): `plugin/bin/spec-verify` accepts only `@draft`, `@spec` and `@implemented`
  (`SCEN_RE` :112-113, fact rows :758-780), and `work-next.mjs` `specBoundIds` (:426-433) counts every id whatever its tag
  (:669-671), so the ADR-040 spec's F-1 rows still bind tests ADR-099 deleted.
- **A forwarder runs the newest installed plugin, not the session's** (§389's resolver half): `RESOLVER`
  (`plugin/scripts/standalone-link.mjs:74-91`) reads `installed_plugins.json` and the cache. `CLAUDE_PLUGIN_ROOT` is unset in
  a session's Bash (measured 2026-10-20 and 2026-10-21), but the SessionStart env file reaches it. Its two writers are
  `offerPublishHook` in Node (`plugin/scripts/publish-verdict.mjs:142-162`) and in Go (`core/hooks/orientation.go:540-579`,
  called at :635); the Node one writes only after git's hook-capability probe and skips a file that already holds
  `hook.qh-publish-` (:151-154).
- **The §390 advice repeats per task** (§392): `check_test_lock` (`plugin/bin/adr-lint:2956-2983`) advises once per done task
  from `lock_findings` (`plugin/lib/record.py:4152-4164`); one check change printed 57 identical lines on a peer corpus.
- **A Stop continues a turn on a check that cannot run.** A peer's SWE-bench bench (tool-multipathreadwrite, branch
  adr-162-t5-stage-5, `docs/bench/stage-5/`) found the plugin at v3.8.40 cost more per task and solved no more; its hook records
  show the Stop continuation on an inferred check in containers whose test dependencies are absent. `checkCommandOrigin`
  (`check-command.mjs:313-374`) returns `declared`, `inferred`, `none`, `refused`, `unreadable` or `unproven`;
  `completion-rules.mjs:663` and `turnend.go:198-203` drop it, so an inferred check continues the turn as a declared one does.
  The figures stay in the peer's repository (CLAUDE.md §6).
- **adr-next misreads another corpus's records and sign-offs** (an outside report from a peer corpus on 3.8.50, 2026-10-21,
  confirmed against source). `foreign_state` (`plugin/bin/adr-next:1027`) globs `ADR-*.md`, so in a corpus whose records are
  `NNN-slug.md` every cross-record Depends-on reads "cannot evaluate"; adr-lint fixed the same glob (`plugin/bin/adr-lint:4388`,
  BACKLOG §190). And `human_outcome` (`:408-449`) stops on any negative word in the note's own words, so a sign-off that ends in
  "approved" after describing what was observed stops: `human_outcome` returns `stop` for "observed: … trip the FAIL guard …;
  approved", "observed: reranker stopped: fused order in 0.4 s …; approved" and "observed: the run printed [build failed];
  approved" (measured 2026-10-21 at ace624b2).
- **Three more from the same corpus's review of 3.8.50** (2026-10-21, each reproduced on a scratch fixture at 8d021b2a).
  A task whose own `**Status:**` is withdrawn prints `done` when it has exit-0 evidence and `stopped` when it has none:
  `classify` tests done first (`plugin/bin/adr-next:1370-1372`) and reads `stopped_by` only after (`:1384`). One
  `· human-observed ·` row clears the unsigned-step advice for every `[proof: human]` step (`plugin/lib/record.py:1226`). And
  `plugin/templates/tasks-readme-template.md:36,50` allows four README cell words while adr-lint accepts a terminal word
  that matches the task file (`plugin/bin/adr-lint:2583-2613`). Two other claims did not hold: exit 3 is documented
  (`plugin/bin/adr-next:35-37`), and a relock's snapshot is the lock read (`plugin/lib/record.py:4054-4058`).
- **Three field reports the owner asked for** (2026-10-21: an infrastructure repository, a Go CLI repository, a product
  repository; each a peer session's measured transcript and ledger summary, cited here by finding, never by figure, CLAUDE.md
  §6). They agree: the gates re-prove facts nothing changed (a full check demanded on markdown-only trees, repeatedly),
  hooks spend turns they cannot use, and the value is in independent review and tool-written evidence. Confirmed against
  source at 6f895503, each with its site: a pass carries over only through ADR-094's `prose` reuse inside `qh-check`
  (`plugin/scripts/check-ledger.mjs:140-159`), while the publish verdict and the turn end match `after.tree` alone
  (`:422-425`), and the Go twin has no prose branch at all (`core/hooks/ledger.go:174-186`); a long Acceptance has no way to
  be recorded but by re-running it in the foreground; a declared check whose program is absent still continues a turn; a
  commit into another repository is judged by the session's repository unless the path is one absolute literal
  (`plugin/scripts/publish-command.mjs:172-204`); branch-state ignores the payload's `cwd` and repeats a permanent
  "COULD NOT LOOK" on every head change (`plugin/scripts/branch-state.mjs:224-241`, `:919-924`); the mention arm reads `git
  stash push` as a push (BACKLOG §383); `adr-verify --mutant` cannot tell a fence that `cd`s out of the copy from a weak
  test (`plugin/bin/adr-verify:954-984`, `:2036-2041`) and grades a missing ignored dependency exit 1, not could-not-run
  (`:1966-1977`); nothing at commit names a task whose locked test an edit moved (`scripts/test-locks.py` is manual);
  the spec gate honours a fixed skip list but no `linguist-generated` or project ignore list
  (`plugin/scripts/uninteresting.mjs:18`); the task template has no line for what a test double does not model. Two
  findings did not hold at HEAD: the "still stands" repetition is no longer emitted, and the commit advisory already names
  `qh-check`.

### The class, enumerated

Each set below came from a command run on 2026-10-21 at ee802e5d (mrw's regular expressions are RE2: `|` alternates).

| Class | Command | Output |
|-------|---------|--------|
| A reader of the lexer's command records | `mrw read --count --grep 'shellWords\(' plugin/scripts/ core/hooks/` | 34 lines in 9 files: `check-command.mjs`, `publish-command.mjs` (13), `ledger-guard.mjs`, `shell-words.mjs` (2), `checkcmd.go`, `publishcmd.go` (13), `ledger_guard.go`, `shellwords.go`, `parity_test.go` (T1, T2) |
| A direct caller of `constantSuccessCheck` | `mrw read --grep 'constantSuccessCheck\|ConstantSuccessCheck' plugin/scripts/ core/hooks/` | `fastCheckCommand` (`check-command.mjs:310`), `checkCommandOrigin` (`:333`), their Go twins (`checkcmd.go:128,480`), and `parity_test.go:152`; every other reader is transitive, through the origin (T1) |
| A reader of a group's boundary | `mrw read --count --grep 'groupEnd\|GroupEnd' plugin/scripts/ core/hooks/` | 13 lines in 6 files: the lexers, `listStatus` and `stdinScripts`, Node and Go; `xargsInvocations` reads none (T1, T2) |
| A spec tag or spec id reader | `mrw read --count --grep '@(draft\|spec\|implemented)\|draft\\\|spec\\\|implemented' plugin/bin/ plugin/scripts/ plugin/lib/` and `mrw read --count --grep 'F-\\d\|UC\\d' plugin/scripts/ plugin/bin/` | `spec-verify` (11 and 2 lines), `adr-lint` (5 and 4), `work-next.mjs` (1 and 3) (T3) |
| A plugin-root resolver or its writer | `mrw read --count --grep 'CLAUDE_PLUGIN_ROOT\|installed_plugins' plugin/scripts/standalone-link.mjs plugin/bin/qh-root plugin/scripts/publish-verdict.mjs core/hooks/orientation.go` | 7 lines in 3 files: `RESOLVER`, `qh-root`, `orientation.go`'s `pluginRoot`; the env-file writers are both `offerPublishHook`s (T4) |
| An emitter of the §390 move | `mrw read --count --grep 'moved the check binding' plugin/` | 1 line, `record.py:4161`, advised only by `adr-lint:2956-2983` (T5) |
| A Stop route to the agent | `mrw read --count --grep 'stopReachesAgent\|additionalContext' plugin/scripts/lifecycle.mjs core/hooks/lifecycle.go` | 15 lines in 2 files; the rules A, W, N, R1, R2, R4, R5 (`completion-rules.mjs:720-790`, `artifact-pass.mjs:461`, `lifecycle.mjs:193`, `turnend.go:381-509`) (T6) |

### What governs these paths

`node plugin/scripts/adr-context.mjs` over the governed paths, 2026-10-21: `shell-words.mjs` ADR-067, ADR-090, ADR-117, ADR-119;
`check-command.mjs` ADR-005, ADR-081, ADR-119; `publish-command.mjs` ADR-061, ADR-066, ADR-067, ADR-104, ADR-119; the Go core
ADR-110, ADR-113, ADR-119; `spec-verify` and `work-next.mjs` ADR-040, ADR-097, ADR-099; `standalone-link.mjs` ADR-001, ADR-004,
ADR-019, ADR-030, ADR-060, ADR-119; `completion-rules.mjs` and `turnend.go` ADR-094, ADR-096, ADR-108, ADR-111; `record.py` and
`adr-lint` ADR-088, ADR-117, ADR-119. Reconciled: ADR-067 (the classifier reads as the shell splits it) is what T1 and T2 apply,
at the level of syntax rather than words. ADR-096's continuation for R1 and R2 on an inferred check, and ADR-097's deferral, are
the decisions this record changes (Invalidates).

## Existing Primitives Audit

- `shellWords()` stays the one lexer; T1 adds boundary fields to its records (additive: every existing field keeps its value)
  rather than a second tokeniser.
- `tests/qh-core-parity.test.mjs` already answers every literal of a classifier test through both implementations; T1 extends
  `nodeRow` and `core/hooks/parity_test.go` with the new fields and the tree's shape.
- `checkCommandOrigin` already returns the origin; T6 carries it rather than re-deriving it.
- Both `offerPublishHook`s already write a session's exports to the env file; T4 adds one line with its own idempotence.
- `lock_findings` already computes the (from, to) digests; T5 groups them in `check_test_lock`.

## Decision

1. **T1:** the lexer marks, additively, where a group, subshell or function definition opens and closes and whether the text
   closed every construct it opened. A recursive-descent parser over those records (`plugin/scripts/shell-grammar.mjs`,
   `core/hooks/shellgrammar.go`) builds lists, pipelines (with `!`), simple commands, brace groups, subshells and POSIX
   function definitions; input it cannot close is `null`, which reads as could-not-look. `listStatus` evaluates exit status
   over the tree: a group is its last list's status, a negated group its inverse, a POSIX definition 0, `&` 0, and a
   pass-through sink the last stage's. **Dialect:** a check runs under `/bin/sh`, so a status is constant only if it is
   constant in POSIX sh; bash-only syntax (the `function` keyword) is could-not-look, never constant. **Shadowing:** once a
   POSIX definition names a command, a later call of that name has its body's status (`false() { :; }; false` is 0, so it
   is refused); a body whose status is not fixed makes the call unknown.
2. **T2:** a group piped to a shell or to xargs is read through the bytes its supported printers write to stdout, in order:
   `echo` with literal arguments (the arguments joined by a space, then a newline, with no option and no backslash), and
   `printf` with a literal format whose only conversions are `%s` and whose escapes are `\n` and `\t`. A printer whose stdout
   is redirected away writes nothing to the pipe, and one that joins another descriptor to stdout (`2>&1`) writes there as
   usual; the lexer keeps each redirection's descriptor, operator and target, in order. A group holding anything else (another command, `&&`, `||`, `&`, a substitution,
   an unsupported printer) stays could-not-look. A nested group keeps its own boundary.
3. **T3:** `spec-verify` accepts `@retired`: such a fact or scenario is neither required to exist nor run, and a retired row
   that still binds a present test is advised. `work-next` leaves retired ids out of what a spec owes: a spec whose
   recognised ids are all retired owes nothing, while a spec with no recognised id keeps today's route as uncovered. The ADR-040 spec's F-1 rows that bind deleted tests are retired. ADR-097's deferred removal of
   `post-edit-check.sh` is decided against: the hook's findings reach the agent since ADR-102, and ADR-119 T4 improved them.
4. **T4:** both SessionStart paths export `QH_PLUGIN_ROOT` through their own writer (`offerPluginRoot`, Node and Go), called
   before `offerPublishHook` and independent of it: written whether or not git's hook probe passed and whether or not an older
   export block is present; the `RESOLVER` and `qh-root` prefer it, then `CLAUDE_PLUGIN_ROOT`, each only when it holds
   `bin/`, then the installed or newest copy.
5. **T5:** the §390 move is advised once per (from, to) check pair with the tasks it covers.
6. **T6:** R1 and R2 continue a turn only when the check is declared; on an inferred check they reach the user once, as a
   `systemMessage`, recorded as delivered to the user so the dedupe and the delivery agree. Every other rule and origin is
   unchanged.
7. **T7:** adr-next finds a foreign record by the rule adr-lint uses (`ADR-NNN-slug.md` or `NNN-slug.md`, with adr-lint's date
   guard), shared from `plugin/lib/record.py` rather than copied. A sign-off's LAST verdict word decides: affirmative after
   negative passes, negative after affirmative stops. A negator before an affirmative, a questioned or taken-back verdict and a
   cross stay stops wherever they sit, and every form ADR-119 T3 neutralised stays neutralised. Decided by the owner on
   2026-10-21.
8. **T8:** a task whose own Status is terminal (withdrawn, superseded, abandoned, cancelled) reads stopped, whatever its
   evidence. A human sign-off whose note names `S<n>` covers that step only; a note naming no step covers every step, as
   before (the owner, 2026-10-21). The README template says a cell may carry the task file's terminal word.
9. **T9:** a pass stands for a later tree while the only paths that changed are the project's declared `prose`, for every
   reader: the publish verdict, the turn end, git's hook and the Go core, not only `qh-check`'s own skip; an advisory on a
   tree whose unchecked diff is prose-only names the `prose` setting once.
10. **T10:** `adr-verify --background` runs a task's fence detached, bounded by `fenceTimeout`, and writes its row when it
    ends, so a long Acceptance is run once by the tool rather than by hand and again by the tool.
11. **T11:** a declared check whose program cannot be found here continues no turn; its finding reaches the user once.
12. **T12:** a commit (not a push) into another repository named by a relative path is advised as foreign, as an absolute
    one is today, in one form only: `git -C <rel> commit`, whose operand git itself resolves, so the probe (git, asked with
    the operand as written from the payload `cwd`) and the commit agree. The operand is a leading run of `../` followed by
    plain names. `cd <rel> && git commit` stays unproven: `cd` follows the shell's logical `PWD` and git the physical path,
    so through a symlinked cwd they can name different repositories (the scoped verification of 0a54cb25).
13. **T13:** branch-state reads the payload's `cwd`; a repository with no GitHub remote is said once per session, not on
    each head change; the mention arm reads `git stash push` as no push (BACKLOG §383's stated fix).
14. **T14:** `adr-verify --mutant` reports a fence that names an existing directory outside the copy as inconclusive ("this
    fence never sees the mutated copy"), never survived; a clean fence that fails for a missing module or dependency in the
    worktree is could-not-run (exit 4), with the hint it already prints.
15. **T15:** a commit that moves another task's locked test body names that task and the relock at the turn end; the spec
    gate skips a path git marks `linguist-generated` or the project lists in `"ignore"`; the task template's Risks asks what
    a test double does not model; the adr-retire skill states the `Archived: [..](..)` receipt grammar.
16. **T16:** a failed, timed-out or unproven `qh-check` run keeps the tail of its output (the last 400 lines, at most
    256 KB) in `<state dir>/outputs/<run id>.log`, named by the ledger row's new `output` field, so a flake can be diagnosed
    after the fact; a passing run keeps none; the files are pruned to the newest 50; the state directory is never tracked, so
    nothing leaves the machine (CLAUDE.md §6). From memory-runtime's report of 2026-10-21: three tests failed under load in
    its check and only the summary lines survived.

What would make this fail: a twin listed as "must still refuse", "must still be a publish" or "must still continue" that does
not after its task. Each is a row in that task's tests, so the fence goes red.

## Alternatives Considered

- **Read any negated, skipped or piped group of several commands as could-not-look:** rejected by the owner on 2026-10-21. It
  is smaller, but it is another patch, and it advises on forms a grammar can decide.
- **A parser that re-tokenises the command text:** rejected. Two tokenisers drift; the lexer already owns quoting, heredocs and
  substitutions, and its records gain the boundaries the parser needs.
- **Read bash as the check's shell:** rejected. `qh-check` launches `/bin/sh`, which is dash on Debian and Ubuntu, where the
  `function` keyword is a syntax error.
- **Rescope ADR-112 and ADR-110 to measurements this repository can make:** rejected by the owner on 2026-10-21; the bench
  peer is asked at the start, and their tasks are this plan's last wave.
- **Remove the Stop continuation altogether, or for every origin but declared:** rejected. On a declared check it is ADR-096's
  act; the bench measured only the inferred case, and A, W, N, R4 and R5 are other records' decisions with their own evidence.
- **A pointer file keyed by `CLAUDE_CODE_SESSION_ID` for T4:** rejected. It is a new state file; the env file already
  carries this plugin's exports to the session's Bash.

## Component / Boundary Impact

Two modules are added: `plugin/scripts/shell-grammar.mjs` and its Go twin `core/hooks/shellgrammar.go`, both pure functions
over the lexer's records, consumed by the check and publish classifiers. `docs/architecture.md`'s module map gains both rows
in T1's commit. Nothing moves.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `shellWords()` records | additive: open and close marks for groups, subshells and definitions, and whether the text closed them | T1 | `shell-grammar.mjs`, the Go core; existing readers ignore the new fields |
| `parseShell(records)` / `ParseShell` | new: a tree, or `null` | T1 | `listStatus`, `stdinScripts`, `xargsInvocations` |
| `constantSuccessCheck` | same signature; answers from the tree | T1 | `fastCheckCommand`, `checkCommandOrigin` and their Go twins |
| Spec tag grammar | adds `@retired` | T3 | `spec-verify`, `work-next.mjs`, the spec template, the spec-write skill |
| The SessionStart env file | adds `export QH_PLUGIN_ROOT=<root>`, from Node and Go | T4 | the forwarders' `RESOLVER`, `qh-root` |
| adr-lint advice | one §390 line per check pair | T5 | readers of adr-lint |
| Stop output | R1 and R2 on an inferred check are a `systemMessage`, no `additionalContext` | T6 | the host |
| A sign-off's outcome | the last verdict word decides | T7 | adr-next, adr-lint's done reading |
| Foreign record lookup | `NNN-slug.md` records found, through a shared helper | T7 | adr-next `foreign_state` |
| Task state for a terminal Status | `stopped`, before `done` | T8 | adr-next `classify`, `--json` |
| Unsigned human steps | per step when the sign-off names one | T8 | adr-next, adr-lint advice |
| A pass's reach | stands across a prose-only change for every reader | T9 | publish verdict, turn end, git hook, Go core |
| `adr-verify --background` | new flag: a detached, bounded fence run that records its row | T10 | adr-verify, adr-execute skill |
| `.quality-harness.json` `ignore` | new key: globs the spec gate skips | T15 | facts-gate-dispatch.sh |
| `checks.jsonl` / `fast-checks.jsonl` row | new `output` field naming a kept output tail | T16 | the reader of a failed run |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `parseShell(records)` (T1) and the lexer's boundary fields (T1) | T1 | T2 | No — new, and additive |
| `checkCommandOrigin`'s origin carried into completion-rules | T6 | none | No |

## Implementation

See `tasks/README.md`: T1, then T2; T3 to T16 are independent. The same plan executes, under their own records:
ADR-112 T1; ADR-116 T1–T3 and the §386 measurement; ADR-110 T2 S1–S2; and, on the bench peer's rows, ADR-110 T2 S3, ADR-112
T2–T3 and ADR-110 T3. The bench peer answered on 2026-10-21: ADR-112's pilot is its ADR-163, Accepted and not yet built, and
runs only after its current stage closes and its owner approves; a Go-hooks arm needs a record there and that owner's
acceptance, and its containers are linux/amd64, so it needs that asset from ADR-116 T1.

## Consequences

- **Positive:** seven constant checks are refused and one false refusal goes on dash; three publish misreadings close on
  one grammar; a spec fact can be retired; a forwarder runs the copy the session runs; one check change is said once; an
  adopter whose tests cannot run is not charged a continuation.
- **Negative:** seven readers change (the check and publish classifiers, spec-verify, work-next, adr-lint, adr-next, the Stop
  rules), so the release waits for an outside run, one peer at a time (CLAUDE.md §18). Mutation catalogues on the lexer and the
  check classifier are repointed.
- **Neutral:** the env file gains one export.

## Out of Scope

- ADR-116 T1–T3, ADR-110 T2–T3 and ADR-112 T1–T3 as tasks of this record (permanent: boundary: each is its own Accepted record's task, executed in this same plan, never deferred)
- BACKLOG §380, §382, §384, §387, the rest of §383 and ADR-091 T3 (permanent: boundary: the owner's 2026-10-21 request named the seven items ADR-119 left out; these were not among them, and the plan says so)
- From the field reports, not chosen by the owner on 2026-10-21: a secret-aware read guard, declared reality probes (live state against the repository), CI results in the commit gate, running the check automatically after every edit, a scoped default check per language, and trimming the skill listing (permanent: boundary: the owner chose the option that folds the gates-know-their-inputs work into this record and named these separately; each needs its own decision)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The parser reads a form a POSIX shell runs differently | Med | High: a fail-open or a false refusal | every row is measured under bash, sh and dash first (CLAUDE.md §16); unparseable and bash-only are could-not-look, never constant |
| Summed group output hides or invents a publish | Med | High | only the printers Decision 2 names contribute, byte for byte; the stderr, conditional and newline rows are tests in Node and Go |
| Repointed mutants lose a kill the old site had | Med | Med | `mutate.mjs --case` over every touched file, every entry RED (CLAUDE.md §18) |
| An inferred check that could run loses its nudge | Med | Low | the user still hears it, with how to declare the check |
| The env export reaches Bash only from the next prompt | High | Low | the forwarder falls through to today's order until then; named in T4 |

## Rollback

Each task is its own commit and reverts alone. No persistent state changes, except the one env-file export (T4), which the
next session start rewrites.

## Follow-ups

- [x] A cold Codex review of this draft (`codex-review` skill, `host-review.mjs --host codex --effort high`) before acceptance: REQUEST CHANGES with ten findings on 2026-10-21, all folded in; a scoped verification resolved seven and found three (a redirection fail-open gap in T2, a shadowing contradiction in T1, a regression in T3), all fixed; a second scoped verification APPROVE, 2026-10-21
- [ ] After T1–T6: an outside run by an eligible peer, one at a time, filed with `attest-import`, then a bump and `release.mjs`
