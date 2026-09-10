# Spec: Separate claim verification from the decision corpus

> **Date:** 2026-09-09 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-038
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec docs/specs/2026-09-09-a-staged-product-not-a-funnel.md` exits 0.
> **Cross-references:** README.md, plugin/README.md, docs/ONBOARDING.md, docs/INSTALL.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-008-the-plugin-is-not-the-repository.md, docs/adr/ADR-012-the-gates-reach-a-client-with-no-shell.md, docs/adr/ADR-027-the-harness-ships-an-operating-surface.md, plugin/hooks/hooks.json, plugin/scripts/work-next.mjs, plugin/scripts/facts-gate-dispatch.sh, plugin/scripts/lifecycle.mjs, plugin/bin/qh-mcp

## Problem

The product that helps is **claim verification**: a tool runs the check and writes what happened. The thing that makes adopters bounce, and that this repository keeps breaking, is treating that core as inseparable from a QH-shaped ADR corpus, Claude Code hooks, and a router whose last resort is spec-write.

README says the plugin brings no opinions about folder layout. The always-on facts gate and the record walker disagree. ONBOARDING says do not adopt the whole lifecycle on day one. `work-next` still prints `Next: /spec-write` on an empty tree, and when nothing is waiting it still tells a healthy corpus to begin at spec-write or adr-write.

## Goal

An adopter can verify a claim without entering the decision lifecycle. The decision lifecycle is entered only when there is a decision to make, or a recognised QH corpus with work on it. Could-not-look is never "write a spec".

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | check that "done" happened, in their own repo, without becoming a QH corpus |
| Claude Code session | system | advise about unverified work without assuming a QH corpus exists |
| Desktop / MCP-only client | system | read findings; never be offered a tool that executes corpus text |
| this repository's maintainers | human role | keep using the full corpus lifecycle on a tree that actually has one |

## Use Cases

UC-1 through UC-5 are grilled (F-13–F-33). Open Questions is empty. Binding tests live in `tests/staged-product.test.mjs`.

### UC-1: Adopter with no QH corpus asks what next

- **Trigger:** `work-next` is run, or `/quality-harness:work` is invoked, in a repository with no classified records, no specs, and no QH task files · **Preconditions:** git repo; plugin installed or gates invoked by path
- **Main flow:**
  1. Observe the tree.
  2. Report that no QH corpus is in use.
  3. Name Core next: how to put a check behind the work the user asked for (`adr-verify` on a task file, or execution of the current change), not spec-write.
- **Failure paths:**
  - a. at step 1, the record walker finds nothing but the task walker finds task files → say discovery failure (already printed); do not also route to spec-write.
  - b. at step 1, observe could not look (unreadable tree, missing git) → UNPROVEN / could-not-look, never "no corpus, write a spec".
- **Postconditions:** the Next line is a Core action or an honest empty; it is never an unnamespaced `/spec-write` on an empty tree.

### UC-2: A gate meets a markdown file that is not a QH record

- **Trigger:** PostToolUse / lifecycle PreToolUse on Bash `git commit` / direct `adr-lint FILE` on a markdown file · **Preconditions:** the file exists and is tracked or being written
- **Main flow:**
  1. Classify the file: QH record, QH task, or not-recognised.
  2. If not-recognised: Core always names it. PostToolUse names it at most once per file per session via `firstMentionThisSession` (not a second store) and does not run record checks (exit 0). The commit boundary (lifecycle on `git commit`) names it again.
  3. If it is a record or task, run the matching gate.
- **Failure paths:**
  - a. at step 1, the classifier cannot decide (unreadable, encoding, ambiguous heading) → UNPROVEN, never "not a record" and never a false BLOCK that a tracked file is missing.
  - b. at step 3, the file is a MADR/Nygard/house ADR that is not QH-shaped → not-recognised, not "NOT A DECISION RECORD" as if the file were empty of decisions.
- **Postconditions:** silence is not a verdict that the file is clean; not-recognised is a named state.

### UC-3: Adopter verifies a claim from a shell without Claude Code

- **Trigger:** they want the product's actual promise, on Cursor, Codex, OpenCode, or a bare terminal · **Preconditions:** Node or Python can run the working-tree or installed `plugin/` gates
- **Main flow:**
  1. Find the gates without `CLAUDE_PLUGIN_ROOT`.
  2. Run `adr-verify` on a task file that names a fence.
  3. Read a tool-written Verification Log line.
- **Failure paths:**
  - a. at step 1, the first documented command requires `CLAUDE_PLUGIN_ROOT` and it is unset → the shipped README names a command that works from `qh-root`, a working-tree path, or an installed forwarder; it does not expand to `/scripts/…`.
  - b. at step 2, they pass a directory to `adr-lint` because INSTALL showed that · the gate still refuses a directory, but the docs that ship (or the doctor) name a file.
- **Postconditions:** Core is reachable on any host that can spawn the interpreter. New host plugins are not required for this UC.

### UC-4: A recognised QH corpus is routed to a decision skill

- **Trigger:** `work-next` on a tree that has classified records or specs · **Preconditions:** observe() returned at least one classified record, spec, or QH task
- **Main flow:**
  1. Prefer evidence stages (unbacked `done`, ready Accepted tasks).
  2. Then retirement, then a Ready-for-ADR spec with no covering record.
  3. Print namespaced skill names (`/quality-harness:adr-execute`), and `adr-verify <path>` for the CLI gate.
- **Failure paths:**
  - a. at step 1, accepted records exist and the only unfinished work sits under Proposed/Draft → name those tasks as not executable; do not say the corpus is finished; do not send the user to spec-write.
  - b. at step 2, accepted records exist with zero task files → do not reuse the "spec is Ready-for-ADR" blurb; say the records have no tasks.
- **Postconditions:** a decision skill is named only when a decision artefact is waiting. This repository, which has a corpus, still reaches adr-execute / adr-verify.
### UC-5: Completion gate meets a write that is not a native Edit/Write

- **Trigger:** Stop / TaskCompleted / PreToolUse `git commit` after a `tool_use` whose name is not in `MUTATION_TOOLS` and is not Bash · **Preconditions:** transcript contains that tool_use with a result
- **Main flow:**
  1. Classify authorship: native mutation, Bash mutation, or UNPROVEN.
  2. If UNPROVEN, say so. Do not treat empty `mutationPaths` / `lastMutation: -1` as "no edits".
- **Failure paths:**
  - a. at step 1, the tool name is unknown and no path extractor exists → UNPROVEN, never fail-open as verified.
- **Postconditions:** BACKLOG §176's `mcp__mrw__mrw_write` fixture is UNPROVEN, not invisible. Advise remains the contract.

## Scenarios

### UC1-S1 [happy] An empty tree is told to verify work, not to write a spec [@implemented] → `tests/staged-product.test.mjs::an empty tree is not routed to spec-write`

```gherkin
Given a git repository with no classified QH records, no specs, and no task files
When work-next runs
Then the Next line is not /spec-write and not /quality-harness:spec-write
And the output says no QH corpus is in use
And it names Core (verify or execute the current work) or an honest empty
```

### UC1-S2 [failure] Task files with no classified records are a discovery failure, not a spec-write [@implemented] → `tests/staged-product.test.mjs::task files with no records are a discovery failure, not spec-write`

```gherkin
Given a tree whose task walker finds task files and whose record walker finds none
When work-next runs
Then it reports a discovery failure
And it does not print Next: /spec-write
```

### UC1-S3 [failure] Could-not-look is not an empty corpus [@implemented] → `tests/staged-product.test.mjs::could-not-look is UNPROVEN, not an empty corpus`

```gherkin
Given observe cannot classify the tree (no git, unreadable directory)
When work-next runs
Then the output uses could-not-look or UNPROVEN vocabulary
And it does not treat the tree as "no spec corpus, write a spec"
```

### UC2-S1 [happy] A QH-shaped record still reaches adr-lint [@spec] → `tests/staged-product.test.mjs::a QH-shaped record still reaches adr-lint`

```gherkin
Given a markdown file that is a classified QH record
When the facts gate runs on that file
Then adr-lint runs against it
```

### UC2-S2 [failure] A MADR file is not-recognised, not a failed record [@spec] → `tests/staged-product.test.mjs::a MADR file is not-recognised, not a failed record`

```gherkin
Given a MADR or Nygard ADR that is not QH-shaped
When the facts gate or adr-lint meets that file
Then the result is not-recognised (named)
And it does not claim the file is not a decision record
And it does not claim a tracked path is missing because a heading looked like a path
```

### UC2-S3 [failure] An unreadable or ambiguous heading is UNPROVEN [@spec] → `tests/staged-product.test.mjs::an unreadable file is UNPROVEN, not a clean skip`

```gherkin
Given a file whose heading the classifier does not recognise as record, task, or other
When the facts gate classifies it
Then the result is UNPROVEN
And it is not reported as "definitely not a record"
And it is not reported as a clean skip
```
### UC2-S4 [failure] PostToolUse names not-recognised at most once per file per session [@spec] → `tests/staged-product.test.mjs::PostToolUse names not-recognised once per file per session via firstMentionThisSession`

```gherkin
Given a markdown file classified not-recognised
When PostToolUse meets that file twice in one session
Then not-recognised is named on the first look
And the second look does not repeat the line
And a later git-commit PreToolUse names it again
And a direct adr-lint of the file always names it
And the once-per-session key uses firstMentionThisSession, not a second session store
```
### UC2-S5 [happy] post-edit-check still runs when the facts gate does not classify a record [@spec] → `tests/staged-product.test.mjs::post-edit-check still runs on unclassified files`

```gherkin
Given PostToolUse on a file that is not a QH record or task
When post-edit-check.sh runs
Then it is not skipped merely because the facts gate did not classify a QH record
```

### UC3-S1 [happy] Doctor and verify run without CLAUDE_PLUGIN_ROOT [@spec] → `tests/staged-product.test.mjs::first shipped README command does not require CLAUDE_PLUGIN_ROOT`

```gherkin
Given CLAUDE_PLUGIN_ROOT is unset
And the plugin is reachable as a working-tree plugin/ or via qh-root
When the first shipped check command is run
Then it does not resolve to /scripts/qh-doctor.mjs
And adr-verify can be invoked on a task file by a working-tree or forwarder path
```

### UC3-S2 [failure] The first shipped command must not die on an unset plugin root [@spec] → `tests/staged-product.test.mjs::first shipped README command does not require CLAUDE_PLUGIN_ROOT`

```gherkin
Given a marketplace install and a normal shell with CLAUDE_PLUGIN_ROOT unset
When a user runs the first command on plugin/README.md as written today
Then that command as shipped after this spec does not MODULE_NOT_FOUND
```
### UC3-S3 [failure] Docs name a file; adr-lint still refuses a directory [@spec] → `tests/staged-product.test.mjs::adr-lint still refuses a directory and docs name a file`

```gherkin
Given INSTALL or the doctor prints an adr-lint example
When a reader follows that example
Then the path in the example is a file, not a directory
And adr-lint on a directory still exits non-zero with expected a record FILE
```

### UC4-S1 [happy] A corpus with an unbacked done is sent to adr-verify [@implemented] → `tests/lifecycle.test.mjs::the lifecycle router reads corpus state, and says so when it cannot`

```gherkin
Given observe finds usesVerificationLog and at least one unbacked done
When work-next runs
Then Next names adr-verify and the task path
```

### UC4-S2 [failure] Accepted records with no tasks do not reuse the spec-ready blurb [@implemented] → `tests/staged-product.test.mjs::the two adr-write arms print different because-lines`

```gherkin
Given classified Accepted records and zero task files
When work-next chooses a next stage
Then it does not print that a spec is Ready-for-ADR
And if it names adr-write, the because-line matches the actual condition
```
### UC4-S3 [happy] Catalog dump and JSON skill entries are namespaced [@implemented] → `tests/staged-product.test.mjs::work-next skill names are namespaced and CLI gates are not`

```gherkin
Given work-next prints the stage catalog or --json stages
When a stage entry names a skill
Then that entry uses the /quality-harness: prefix
And adr-verify stays an unprefixed command name
```
### UC4-S4 [happy] A Ready-for-ADR spec with no covering record goes to adr-write [@implemented] → `tests/staged-product.test.mjs::a Ready-for-ADR spec with no covering record goes to adr-write`

```gherkin
Given observe finds a spec with Status Ready-for-ADR whose facts no classified record Covers
And no evidence or retirement stage is waiting
When work-next chooses a next stage
Then Next is /quality-harness:adr-write
And the because-line says a spec is Ready-for-ADR and no record Covers its facts
```

### UC4-S5 [failure] Unreadable spec Status is UNPROVEN, not "not Ready-for-ADR" [@implemented] → `tests/staged-product.test.mjs::unreadable spec Status is UNPROVEN, not not-Ready-for-ADR`

```gherkin
Given a spec file observe cannot read
When work-next classifies specs
Then that spec is UNPROVEN
And it does not count as "no Ready-for-ADR spec"
```
### UC4-S8 [failure] A specs directory only on disk is not a spec corpus [@implemented] → `tests/staged-product.test.mjs::disk-only specs and tasks are not the corpus; git failure is UNPROVEN`

```gherkin
Given docs/specs exists on disk with markdown files git does not list
When observe counts specs
Then those files are not counted as the spec corpus
And a git listing failure is UNPROVEN, not zero specs
```
### UC4-S9 [failure] Disk-only task files are not the task inventory [@implemented] → `tests/staged-product.test.mjs::disk-only specs and tasks are not the corpus; git failure is UNPROVEN`

```gherkin
Given markdown under docs/**/tasks/ on disk that git does not list
When observe inventories tasks
Then those files are not counted as the task corpus
And a git listing failure is UNPROVEN, not zero tasks
And archive directories stay excluded
```
### UC4-S6 [failure] Proposed/Draft tasks are named, not treated as finished or as spec-write [@implemented] → `tests/staged-product.test.mjs::Proposed and Draft unfinished tasks are named, not finished or spec-write`

```gherkin
Given unfinished tasks whose owning record is Proposed, Draft, or an unrecognised status
When work-next runs
Then those tasks are named as not executable
And the output does not say the corpus is finished
And Next is not /spec-write and not /quality-harness:spec-write
```
### UC4-S7 [happy] The two adr-write arms print different because-lines [@implemented] → `tests/staged-product.test.mjs::the two adr-write arms print different because-lines`

```gherkin
Given nextStage would return adr-write
When the arm is Ready-for-ADR uncovered spec versus accepted records with no tasks
Then the printed when text matches that arm
And both Next lines may still be /quality-harness:adr-write
```
### UC5-S1 [failure] An MCP write is UNPROVEN, not "no mutation" [@spec] → `tests/staged-product.test.mjs::an MCP write is UNPROVEN authorship, not no mutation`

```gherkin
Given a transcript whose only write is a tool_use not in MUTATION_TOOLS and not Bash
When analyzeTranscript runs
Then authorship is UNPROVEN
And it does not treat empty mutationPaths and lastMutation -1 as no edits
```
### UC5-S2 [happy] A native Edit/Write is still a mutation [@spec] → `tests/staged-product.test.mjs::a native Edit or Write is still a mutation`

```gherkin
Given a transcript whose write is Edit, Write, MultiEdit, or NotebookEdit
When analyzeTranscript runs
Then that write is a mutation (not UNPROVEN)
And lastMutation is not -1
```

## Facts

Scouted from the repository this session. Behavioural rows are bound in `tests/staged-product.test.mjs`.

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | The shipped plugin is already three directories: `plugin/bin` (gates), `plugin/hooks` plus `plugin/scripts` (session), `plugin/skills` (lifecycle). Marketplace source is `./plugin`. | `tests/staged-product.test.mjs::marketplace source is the plugin directory` | @spec | |
| F-2 | README asserts layout neutrality (`no folder layout, no test command`) while `is_adr` in the facts gate requires `## Existing Primitives Audit` plus Decision, Alternatives Considered, and Consequences. The fence command is layout-neutral; the lifecycle is not. | `tests/staged-product.test.mjs::is_adr still requires the four QH sections` | @spec | |
| F-3 | `nextStage` returns spec-write when `!records && !specs`. An empty adopter tree is therefore routed into the decision corpus. | `tests/staged-product.test.mjs::an empty tree is not routed to spec-write` | @implemented | |
| F-4 | When `nextStage` returns null, the human output still says anything you start now begins at `/spec-write` or `/adr-write`. A healthy corpus is told to start a spec. | `tests/staged-product.test.mjs::null-stage leftover is not spec-write` | @implemented | |
| F-5 | `work-next` stage entries for skills are unnamespaced (`/spec-write`, `/adr-write`, `/adr-execute`). Installed skills are `/quality-harness:…`. | `tests/staged-product.test.mjs::work-next skill names are namespaced and CLI gates are not` | @implemented | |
| F-6 | `nextStage` maps `accepted && !tasks` to adr-write, whose `when` text is `a spec is Ready-for-ADR and no record Covers its facts`. The condition and the blurb are different questions. | `tests/staged-product.test.mjs::the two adr-write arms print different because-lines` | @implemented | |
| F-7 | Task files with zero classified records are already called a discovery failure in the CLI, because two walkers disagree. The spec-write default still sits under that case when specs are also zero. | `tests/staged-product.test.mjs::task files with no records are a discovery failure, not spec-write` | @implemented | |
| F-8 | ADR-012 Accepted permanently excludes `adr-verify` and `spec-verify` from `qh-mcp` because both execute text the corpus supplies. This spec does not reverse that. Desktop gets reading gates; the write path stays a shell. | `tests/staged-product.test.mjs::qh-mcp still excludes verify gates` | @spec | |
| F-9 | `analyzeTranscript` treats authorship as `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, plus Bash that looks like mutation. An MCP write is not in `MUTATION_TOOLS`, so the evidence gate can fail-open. | `tests/staged-product.test.mjs::an MCP write is UNPROVEN authorship, not no mutation` | @spec | |
| F-10 | ONBOARDING tells the reader not to adopt the whole lifecycle on day one. `hooks.json` has no stage switch: SessionStart, UserPromptSubmit, PreToolUse, and two PostToolUse scripts run regardless of whether a QH corpus exists. | `tests/staged-product.test.mjs::hooks stay always-on with no stage switch` | @spec | |
| F-11 | `plugin/README.md`'s first command is `node "${CLAUDE_PLUGIN_ROOT}/scripts/qh-doctor.mjs"`. `qh-doctor.mjs` itself locates the plugin from `import.meta.url`. The breakage is the README, not the doctor. | `tests/staged-product.test.mjs::first shipped README command does not require CLAUDE_PLUGIN_ROOT` | @spec | |
| F-12 | `adr-lint` on a directory prints `expected a record FILE, got a directory` and exits 1. INSTALL documents `python3 plugin/bin/adr-lint docs/adr`. | `tests/staged-product.test.mjs::adr-lint still refuses a directory and docs name a file` | @spec | |
| F-13 | After this spec is accepted, an empty tree (zero classified records, zero specs, zero task files) must not receive `Next: /spec-write` or `Next: /quality-harness:spec-write`. | `tests/staged-product.test.mjs::an empty tree is not routed to spec-write` | @implemented | |
| F-14 | After this spec is accepted, every `work-next` Next line that names a skill uses the `/quality-harness:` prefix; CLI gates stay unprefixed command names. | `tests/staged-product.test.mjs::work-next skill names are namespaced and CLI gates are not` | @implemented | |
| F-15 | After this spec is accepted, a file that is not a QH record or task is reported as not-recognised or UNPROVEN, never as a clean skip and never as "not a decision record" when the file contains some other ADR shape. | `tests/staged-product.test.mjs::a MADR file is not-recognised, not a failed record` | @spec | |
| F-16 | After this spec is accepted, the first command on the shipped plugin README locates the doctor without requiring `CLAUDE_PLUGIN_ROOT` to be set. | `tests/staged-product.test.mjs::first shipped README command does not require CLAUDE_PLUGIN_ROOT` | @spec | |
| F-17 | This spec adds no in-process plugin registry. A later host is a Session adapter that spawns existing Core CLIs (and, if needed, translates a JSON hook payload). A later ADR house style is a Corpus recognition profile, decided in its own ADR. Core's contract is argv + stdin JSON + exit code + stdout. | `tests/staged-product.test.mjs::no in-process plugin registry was added` | @spec | |
| F-18 | When `nextStage` returns null, `work-next` must not say that new work begins at `/spec-write` or `/adr-write`. It says nothing in the QH corpus is waiting. Spec-write remains a skill you can invoke; it is not the default leftover. | `tests/staged-product.test.mjs::null-stage leftover is not spec-write` | @implemented | |
| F-19 | After this spec is accepted, a `work-next` because-line (`STAGES.when` printed for the chosen stage) must match the predicate that fired. When `nextStage` returns adr-write because `accepted && !tasks`, the because-line says the records have no tasks. The Ready-for-ADR blurb is printed only when observe() saw a Ready-for-ADR spec with no covering record. | `tests/staged-product.test.mjs::the two adr-write arms print different because-lines` | @implemented | |
| F-20 | After this spec is accepted: Core (`adr-lint FILE`) always names not-recognised or UNPROVEN when that is the classification. Session PostToolUse names it at most once per file per session and does not run record checks. The commit boundary (lifecycle PreToolUse on Bash `git commit`, same dispatcher) names it again. There is no Claude Commit hook today. | `tests/staged-product.test.mjs::PostToolUse names not-recognised once per file per session via firstMentionThisSession` | @spec | |
| F-21 | After this spec is accepted, `hooks.json` stays always-on: no opt-in switch and no new events. Corpus gates still do not run on unclassified files (F-15, F-20). Session Advise (unverified work, branch-state) still runs on trees with no QH corpus. | `tests/staged-product.test.mjs::hooks stay always-on with no stage switch` | @spec | |
| F-22 | This spec does not add `plugin/CORE.md`. Marketplace Core is taught in `plugin/README.md` (F-16). `docs/INSTALL.md` and ONBOARDING stay GitHub-only. | `tests/staged-product.test.mjs::plugin ships no CORE.md` | @spec | |
| F-23 | After this spec is accepted, `adr-lint` still refuses a directory. INSTALL and the doctor (if they print an example) name a file. This spec does not add a directory/corpus walker on `adr-lint`; a later record may, when a measured need exists. | `tests/staged-product.test.mjs::adr-lint still refuses a directory and docs name a file` | @spec | |
| F-24 | After this spec is accepted, `analyzeTranscript` treats a `tool_use` that is not in `MUTATION_TOOLS` and is not classified Bash as UNPROVEN authorship, never as `lastMutation: -1` / empty `mutationPaths` meaning no edits. This spec does not invent a path extractor for every MCP name. A later record may treat a named tool as a mutation once a fixture exists for that name. BACKLOG §176 already reproduces `mcp__mrw__mrw_write`. | `tests/staged-product.test.mjs::an MCP write is UNPROVEN authorship, not no mutation` | @spec | |
| F-25 | After this spec is accepted, every skill name `work-next` prints — Next line, null-stage catalog dump, and `--json` `stages[].entry` — uses the `/quality-harness:` prefix. CLI gates stay unprefixed. | `tests/staged-product.test.mjs::work-next skill names are namespaced and CLI gates are not` | @implemented | |
| F-26 | This spec does not change which files classify as QH records or tasks. Positive-match arms already in `facts-gate-dispatch.sh` stay (`ADR-*.md`, four QH sections, `# ADR-[0-9]` title, task title / `tasks/`). F-15 and F-20 change what a miss is called, not the matcher. A later record may extend the grammar with a foreign-corpus fixture. | `tests/staged-product.test.mjs::is_adr still requires the four QH sections` | @spec | |
| F-27 | After this spec is accepted, `nextStage` returns adr-write when observe() finds at least one spec with Status Ready-for-ADR whose `@spec`/`@implemented` IDs are not covered by any classified record (the covering relation `adr-lint` already enforces). That arm is after evidence and retirement, and before `accepted && !tasks`. The Ready-for-ADR because-line is used only for this arm (F-19). If observe cannot read a spec's Status, that spec is UNPROVEN, not "not Ready-for-ADR". | `tests/staged-product.test.mjs::a Ready-for-ADR spec with no covering record goes to adr-write` | @implemented | |
| F-28 | After this spec is accepted, unfinished tasks under a Proposed, Draft, or unrecognised-status record stay named as not executable. That output is not "the corpus is finished" and is not a spec-write Next line (F-13, F-18). | `tests/staged-product.test.mjs::Proposed and Draft unfinished tasks are named, not finished or spec-write` | @implemented | |
| F-29 | After this spec is accepted, the two adr-write predicates (F-19 `accepted && !tasks`, F-27 Ready-for-ADR uncovered spec) do not share one `STAGES.when` string. Allowed: two stage entries that share the same skill Next line, or one id whose `when` is chosen from the arm that fired. | `tests/staged-product.test.mjs::the two adr-write arms print different because-lines` | @implemented | |
| F-30 | After this spec is accepted, `observe()` must not decide that specs exist, or which spec files exist, via `existsSync` / `readdirSync` on `docs/specs`. Spec paths are resolved with `git ls-files` plus `--others --exclude-standard` (the same listing `adrCorpus` already uses). If git cannot list, that look is UNPROVEN, not "zero specs". | `tests/staged-product.test.mjs::disk-only specs and tasks are not the corpus; git failure is UNPROVEN` | @implemented | |
| F-31 | After this spec is accepted, `taskFiles()` must not inventory tasks via `existsSync` / `readdirSync`. Task paths come from the same git listing as F-30 (`trackedPaths`). Archive directories stay excluded. If git cannot list, that look is UNPROVEN, not "zero tasks". | `tests/staged-product.test.mjs::disk-only specs and tasks are not the corpus; git failure is UNPROVEN` | @implemented | |
| F-32 | After this spec is accepted, PostToolUse names not-recognised at most once per file per session using the existing `firstMentionThisSession` ledger in `lifecycle.mjs`, not a second session store. | `tests/staged-product.test.mjs::PostToolUse names not-recognised once per file per session via firstMentionThisSession` | @spec | |
| F-33 | After this spec is accepted, `post-edit-check.sh` still runs on Edit/Write of unclassified files. It is a syntax/type advisory, not a corpus gate. F-21 skips `adr-lint` / `spec-verify` / `arch-lint` on a miss; this spec does not make the syntax check corpus-aware. | `tests/staged-product.test.mjs::post-edit-check still runs on unclassified files` | @spec | |

## Domain

Three layers, independently adoptable: **Core** (provider: Recognize, Verify — file-scoped CLIs) · **Session** (the first host adapter: Advise via Claude Code hooks; corpus-agnostic) · **Corpus** (Route plus spec/ADR skills; entered only when a decision artefact or recognised QH corpus is waiting). A later host (OpenCode, Cursor, …) is another Session adapter over the same Core, never a second lifecycle (BACKLOG §195). Core's contract is argv + stdin JSON + exit code + stdout. Ubiquitous language: **not-recognised** ≠ **not a record**; **could-not-look** ≠ **empty corpus**; **Core** ≠ **Corpus**; **adapter** ≠ **plugin registry**.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `plugin/scripts/work-next.mjs` Next line, null-stage prose, observe() spec Status/covering | modify | `/quality-harness:work`, ONBOARDING hour one, humans running the script |
| `plugin/scripts/facts-gate-dispatch.sh` classification | modify | PostToolUse, commit boundary |
| `plugin/README.md` first command | modify | marketplace cache (this is the file that ships) |
| `docs/INSTALL.md` / ONBOARDING | modify | GitHub readers; not in the marketplace cache unless copied into plugin/ |
| `plugin/scripts/lifecycle.mjs` `analyzeTranscript` | modify — unknown non-Bash tool_use is UNPROVEN (F-24) | Stop / completion / commit evidence gate |
| `plugin/hooks/hooks.json` | none (always-on; F-21). Corpus-agnostic skip lives in the dispatcher, not a stage switch | every Claude Code session with the plugin enabled |
| `plugin/bin/qh-mcp` | none for verify/spec-verify | ADR-012; Desktop |
| `plugin/scripts/post-edit-check.sh` | none (still runs on Edit/Write; F-33) | PostToolUse |

## Non-Goals

- Building a Cursor / Codex / OpenCode adapter, slash-command port, or host-specific hook rewrite *in this spec*. The seam is named (F-17); the adapter is a later ADR. Core CLI remains the portability story (UC-3).
- Exposing `adr-verify` or `spec-verify` over MCP, in any form. ADR-012; permanent while those gates execute corpus text.
- A fifteenth skill. Routing and recognition, not more markdown.
- An in-process plugin registry, format-plugin loader, or host-agnostic kernel inside Core. F-17.
- Rewriting `adr-lint` or `lifecycle.mjs` in another language as part of this spec.
- Making hooks block (seize the session). Advise remains the contract.
- An opt-in or off switch for hooks. F-21.
- Forcing every adopting repo to grow a `docs/adr` tree.
- Changing this repository's own corpus layout or ADR numbering.
- A `plugin/CORE.md`. F-22. Teach Core in the shipped README.
- Growing `adr-lint` into a directory or corpus walker. F-23. A later record may add that when a measured need exists; this spec only stops the docs lying.
- Inventing a path extractor for every MCP write tool. F-24. Named tools may be added later with a fixture.
- Widening or shrinking the heading grammar that classifies QH records. F-26.
- Making `post-edit-check.sh` corpus-aware. F-33.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Changing the empty-tree default breaks a user who wanted spec-write as the front door | Med | Med | `/quality-harness:work` still classifies; spec-write remains a named skill; only the default Next line changes |
| not-recognised under-blocks a QH record with an odd heading | High | High | F-26: do not widen the matcher; UNPROVEN only when the classifier cannot look; a later record may extend grammar with a fixture |
| Making hooks corpus-agnostic misses unverified QH edits | Med | High | Core still runs when a file IS classified as record/task; session layer still sees Edit/Write |
| Shipping docs in plugin/ duplicates GitHub docs | Low | Med | F-22: no CORE.md; make plugin/README self-sufficient (F-16); do not maintain three install pages |
| Touching analyzeTranscript for MCP writes without a host test | Med | High | name UNPROVEN until a fixture exists; do not claim MCP writes are visible without a transcript shape |

## Open Questions

## Verify

```bash
python3 plugin/bin/spec-verify --draft docs/specs/2026-09-09-a-staged-product-not-a-funnel.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Scout: what surfaces actually ship? | F-1 | minted from marketplace.json, hooks.json, skills/ |
| 2 | Scout: is layout neutrality true of the lifecycle? | F-2 | README vs facts-gate `is_adr` |
| 3 | Scout: what does work-next do with an empty tree? | F-3 | `nextStage` spec-write when `!records && !specs` |
| 4 | Scout: what does work-next say when nothing is waiting? | F-4 | null-stage prose still names spec-write / adr-write |
| 5 | Scout: are Next lines namespaced? | F-5 | STAGES entries are `/spec-write` etc. |
| 6 | Scout: does adr-write's when-text match its predicate? | F-6 | accepted && !tasks vs Ready-for-ADR blurb |
| 7 | Scout: tasks with no records? | F-7 | discovery-failure message exists; spec-write default can still apply |
| 8 | Scout: may adr-verify go on MCP? | F-8 | no — ADR-012 Accepted, executes corpus text |
| 9 | Scout: does the evidence gate see MCP writes? | F-9 | MUTATION_TOOLS is Edit/Write/MultiEdit/NotebookEdit |
| 10 | Scout: can hooks be ignored on day one? | F-10 | ONBOARDING says ignore the lifecycle; hooks.json has no off switch |
| 11 | Scout: why does qh-doctor die in a normal shell? | F-11 | README interpolates CLAUDE_PLUGIN_ROOT; doctor uses import.meta.url |
| 12 | Scout: can you lint a corpus directory? | F-12 | INSTALL vs adr-lint directory refusal |
| 13 | Later hosts: more granular / pluggable inside Core? | F-17 | accept — adapter over gates, no in-process registry |
| 14 | Empty tree: Next line must not be spec-write? | F-13 | accept — Route stays in Corpus; empty tree sees Core or honest empty |
| 15 | Null-stage: must not default leftover to spec-write? | F-18 | accept — healthy corpus with nothing waiting is not a spec-write |
| 16 | Next lines that name a skill: namespace them? | F-14 | accept — `/quality-harness:` for skills; CLI gates unprefixed |
| 17 | because-line must match the predicate that fired? | F-19 | accept — accepted && !tasks must not reuse the Ready-for-ADR blurb |
| 18 | not-recognised / UNPROVEN vs silent skip / "not a decision record"? | F-15 | accept — named state; foreign ADR shape is not "NOT A DECISION RECORD"; frequency still open |
| 19 | When to name not-recognised: every edit, once per session, commit only? | F-20 | accept — Core always; PostToolUse once per file per session; git-commit PreToolUse names it again |
| 20 | Always-on hooks vs opt-in? | F-21 | accept — always-on; skip corpus gates on unclassified files; no switch |
| 21 | First shipped README command: no CLAUDE_PLUGIN_ROOT? | F-16 | accept — doctor already uses import.meta.url; README must not require the session variable |
| 22 | Ship a short CORE.md inside plugin/? | F-22 | accept proposed fact — no CORE.md; README is the shipped Core page |
| 23 | adr-lint on a directory: refuse and fix the docs, or grow a walker? | F-23 | accept — still refuses a directory; docs name a file; walker deferred until proven needed |
| 24 | MCP writes: UNPROVEN or wait for a fixture? | F-24 | accept — unknown non-Bash tool_use is UNPROVEN; named mutation extractors later, with a fixture |
| 25 | Catalog dump and JSON: namespace skill names too? | F-25 | accept — same prefix as F-14 everywhere work-next prints a skill |
| 26 | Change which files classify as QH records? | F-26 | accept — matcher stays; F-15/F-20 change the miss vocabulary only |
| 27 | Route to adr-write when a spec is Ready-for-ADR with no covering record? | F-27 | accept — real observe() arm; blurb only then; UNPROVEN if Status unreadable |
| 28 | Proposed/Draft unfinished tasks: name them, or treat as finished / spec-write? | F-28 | accept — keep notYetDecided naming; not finished; not spec-write |
| 29 | Two adr-write predicates: shared STAGES.when, or per-arm? | F-29 | accept — when is taken from the arm that fired; Next may still be adr-write |
| 30 | observe() specs: git listing or existsSync? | F-30 | accept — git ls-files (+ others); UNPROVEN if git cannot list; not existsSync |
| 31 | taskFiles(): git listing or disk walk? | F-31 | accept — same listing as F-30; archives still excluded; UNPROVEN if git cannot list |
| 32 | Once-per-file-per-session: existing ledger or a new store? | F-32 | accept — firstMentionThisSession; no second session store |
| 33 | post-edit-check on unclassified files: keep or skip with F-21? | F-33 | accept — keep; syntax advisory, not a corpus gate |
