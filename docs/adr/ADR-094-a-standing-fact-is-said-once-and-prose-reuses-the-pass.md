# ADR-094: A standing fact is said once, and a prose-only change reuses the last pass

**Status:** Accepted
**Date:** 2026-10-09
**Owner:** Zy
**Spec:** None — no spec stage; the owner asked on 2026-10-09 to settle the adopter survey (docs/BACKLOG.md §370) with the smallest changes that make the job done, and decided three points the same day: a failed CI prints in full once and then one short line, a documentation-only commit uses opt-in `prose` globs, and everything ships in one release
**Cross-references:** docs/adr/ADR-065-branch-state-serves-its-snapshot.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-093-a-literal-variable-directory-is-left-to-git.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds campaign mutations per `Rests-on` name; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-081 — its rule that a pass is reused only on an identical tree: a project that declares `prose` in `.quality-harness.json` also reuses a pass on a tree that differs from it only under those paths, with the pass rows and the publish verdict unchanged for every project that declares none. Nothing else in ADR-065, ADR-061 or ADR-081 changes.
**Served-path change:** the per-prompt branch-state brief (UserPromptSubmit), the SessionStart context, and `qh-check`'s same-tree reuse; no refusal is added, removed or moved.

## Context

- **The survey (2026-10-09, fifteen live sessions: ten on macOS and five on Windows, twelve repository shapes; BACKLOG §370).** Nobody reported skipping a gate or routing a commit around the hook. What they stopped reading was advisory text, and the one real time cost was the declared check run for a commit that changes only prose. Figures are the sessions' own counts, not measured here.
- **The per-prompt brief (14 of 15 sessions ignore it).** A completed failed run keeps its warning and its failing job names on every prompt (CLAUDE.md §15), and a snapshot withheld past its cap is stamped with `withheldStamp` (`plugin/scripts/branch-state.mjs:661`) so the next prompt says nothing; the stamp replaces `said`, so a snapshot that refreshes to the text already shown is printed again (`emitCachedBranchState`, `:781`). On a repository whose forge `gh` does not serve, the unknown line is repeated for the same reason.
- **SessionStart (10 of 15).** `sessionOrientation` (`plugin/scripts/lifecycle.mjs:4180`) rebuilds the same paragraphs on every start, resume and compaction: the `Verification:` paragraph (`:4193`, `:4198`), the archive-marker advice (`:4225`), the shadow-install notice (`:4239`) and the ADR tasks in flight (`:4253`). `previousSessionNotice` (`:3759`) names the previous session's unverified state even when the ledger already holds a pass for the tree it describes. Its "N shell mutation(s)" (`:3764`) is `unobservableWrites(log).length`, which counts a write outside the repository, to an ignored file or through a symlink; it is not a shell mutation.
- **A documentation-only commit pays the whole check (at most four sessions; the plan said five).** The reported cost is 100 seconds to 25 minutes per commit. One of the five sessions cannot declare prose at all, because two of its unit tests read documentation; its fix is `fastCheck` (ADR-081), which is why the declaration is opt-in. A tree hash covers every tracked path, so a changed paragraph in a document is a new tree and `passedAlready` (`plugin/scripts/qh-check.mjs:81`) finds no row.
- **Writes outside the repository (three Windows sessions).** `recordFileWritten` (`lifecycle.mjs:5163`) appends the entry whatever the path; `unseenWriteSince` (`:796`) already skips an absolute path outside the root, but `unobservableWrites` (`:6315`) has no such skip. The reported cost of 0.4 to 0.9 seconds per write is not reproduced; T4 reproduces first.
- **An independent critique of the plan (Fable, 2026-10-09) was read against source, and its verified points are in the Decision:** the one-line red form must be judged on the uncapped job set and never stored as `said`; "no pass for the current tree" must not require a dirty tree, because a session under `"publish": "warn"` or on an unarmed Git for Windows ends unverified with a clean tree; the tree with prose removed belongs in `qh-check`, not in `observe()`, which runs on every hook; and the pathspecs need `:(top)` and refusals.
- **The class: every hook output that restates a fact the session or the ledger already holds.** Enumerated 2026-10-09 with `mrw read --grep 'lines\.push\(' plugin/scripts/lifecycle.mjs`, restricted to `sessionOrientation` (lines 4180-4257): eight pushes, of which two are could-not-look and stay, and six are standing paragraphs; and `mrw read --grep 'sections\.push\(' plugin/scripts/lifecycle.mjs` over the SessionStart handler (lines 7148-7210): six pushes, of which the arming note and the previous-session notice are in this decision. The per-prompt brief is the third member. The members left out are named under Out of Scope.
- **CLAUDE.md §3 and §16 govern.** Nothing here refuses anything. A pass reused on a tree that was never checked is a false claim, so T3 states every "this is code again" twin beside each exemption, and an unrecognised input runs the check.

## Existing Primitives Audit

- **`ciRed`, `render`, `stampBriefSaid`, `previous.said`** (`branch-state.mjs`): reused; `withheldStamp` is removed. A `redKey` is stored beside `said` by the same writer, which already keeps `said` across a refresh.
- **`firstMentionThisSession`, `sessionMentionPath`, `saidMarkerDirectory`, `sweepStaleMarkers`** (`lifecycle.mjs:3817-3944`): reused. The new `saidHere` is a sibling that keys on a repository and a text hash instead of a session, in the same directory and under the same sweep. A new `said.json` is not created (CLAUDE.md §5: prior art exists).
- **`passedAlready`, `unseenWriteSince`, `observe`** (`qh-check.mjs`, `lifecycle.mjs`): reused. `passedAlready` moves into `lifecycle.mjs` unchanged (qh-check imports lifecycle, so the other direction would be a cycle) and is re-exported from `qh-check.mjs`, so every importer keeps its path. `observe()` takes an optional third argument that only `qh-check` passes.
- **`skips.jsonl` and the pass row of `checks.jsonl`** (ADR-081): a prose reuse writes one row to each, so the publish verdict and the savings count both see it.
- **`relativeWithinRoot`, `outsideRoot`** (`lifecycle.mjs:807`): reused for T4.

## Decision

**1. The per-prompt brief says a standing fact once (T1).** Past the show cap the brief prints nothing and stores nothing: `withheldStamp` is deleted, so `said` keeps the last text actually shown and an unchanged refreshed brief stays suppressed. The one exception is a refresh that could not be started, which prints one line with no age in it, compared with `said` like any other text, so it is said once. A completed failed run is keyed by `redKey` = the sha, the conclusion word and the sorted full set of failed job names, stored beside `said`. When the key differs from the stored one the brief prints in full, with at most three job names and "+N more", and the conclusion word (`failure`, `cancelled`, `timed_out`) so that a cancelled run is not "0 jobs". When the key is the same it prints `CI <sha7>: <conclusion>, N job(s), unchanged`, and that line is never stored as `said`. The cap applies to what is displayed, never to what is compared.

**2. SessionStart says a standing paragraph once per repository per three days, and the previous-session notice only when nothing proves the tree (T2).** `saidHere(root, text)` is true when no marker keyed on the repository and the text's hash is younger than three days, and then refreshes the marker. On `startup` and `resume` the `Verification:` paragraphs, the stale-archive advice, the shadow-install notice, the ADR tasks in flight and the arming note go through it; a changed text has a new hash and is said. On `compact` and `clear` every paragraph is said as today, because the context lost them. The could-not-look lines are never gated (ADR-005). `previousSessionNotice` returns nothing when `passedAlready` finds a pass for the tree as it is now, whether or not the tree is dirty; a tree with no pass, a tree that could not be observed and a project with no declared check keep the notice. Its wording says "write(s) git cannot see", the true name of the count.

**3. A prose-only change reuses the last pass in a project that declared it (T3).** `.quality-harness.json` gains `"prose": [<pathspecs>]`, default none. A declaration is valid only when it is an array of at most twenty strings, none empty, none starting with `-` or `:`, none of `.`, `*` or `**`, and every spec matches at least one tracked path, matches no `.quality-harness.json`, and matches no gitlink (mode 160000); an invalid declaration is said and ignored, never partly read. `qh-check` asks `observe(root, budget, { without })` for a second tree, `codeTree`: the temporary index after `git rm --cached -r --ignore-unmatch -- :(top)<spec>…`. A full run records `codeTree` and the `prose` list in its `after`. `passedAlready` accepts a row when the command and the `prose` list are equal and `codeTree` is equal, in addition to the existing tree equality; a row without a `codeTree` is never reused this way. The unseen-write veto runs from the original pass's start time. A reuse appends a pass row for the new tree (`origin: 'reused'`, `reusedFrom: <id>`, `before.at` and `after.at` copied from the original) and a `skips.jsonl` row, and says so in one line. After a full run that exited 0 and took at least a minute, where every path changed since the previous full pass of the same command is a text document (`.md`, `.mdx`, `.txt`, `.rst`), `qh-check` prints one hint naming `prose` and `fastCheck`, says a declaration needs the project owner's approval and that a check which reads those files makes reuse wrong, and is said once per repository (T2's marker). This repository declares none.

**4. A write outside the repository is not an unseen write (T4).** `unobservableWrites` skips an absolute `file.written` path outside the root, as `unseenWriteSince` already does, so the notice and the completion advice stop counting a scratchpad. T4 first reproduces the recording and the per-write cost; where the cost does not reproduce on this machine it says so and the Windows figure stays UNPROVEN until the outside run.

**This fails if** a red run that changed is printed as one line, an unchanged one is printed in full, a withheld snapshot prints on two consecutive prompts, a standing paragraph is said twice in three days on `startup` or is missing on `compact`, the notice is shown when the ledger holds a pass for the tree, a `prose` declaration reuses a pass after any path outside it changed, was deleted, was renamed into or out of it, or after an unobservable write, or an outside-root write is still counted. Valid for git 2.56.0 on macOS; Git for Windows is checked by the outside run (CLAUDE.md §18).

## Alternatives Considered

- **(a) Leave it.** Rejected: fourteen of fifteen sessions ignore the brief, and an ignored always-on line is how a real red run goes unnoticed (CLAUDE.md §17).
- **(b) Change the text and keep printing it.** Rejected: the cost is the repetition, not the wording.
- **(c) Default-on prose skipping by file extension.** Rejected by a session's own evidence: two of its unit tests read documentation, so a default would pass a tree that was never checked. Opt-in, declared by the project owner.
- **(d) Compute `codeTree` in `observe()` for everyone.** Rejected: `observe()` runs on every hook at eight sites inside a five-second budget, and two more git spawns per hook is an always-on cost for a project that never opted in (CLAUDE.md §19).
- **(e) A new `said.json` store.** Rejected: the marker directory, its sweep and its exclusive-create already exist.
- **(f) Skip the brief on injected prompts.** Dropped: the script reads no stdin, and no survey session reported it. Deferred to BACKLOG §372.
- **(g) Reuse a pass by comparing only the changed files' names.** Rejected: a name test is a classifier over an open input (CLAUDE.md §16); a tree hash with the declared paths removed is an equality, not a guess.

## Component / Boundary Impact

None — internal to three scripts. The session log's events, the checks ledger's existing fields and the publish verdict's reading of a pass are unchanged; the ledger gains the fields `codeTree`, `prose`, `origin: 'reused'` and `reusedFrom`.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| UserPromptSubmit stdout | a failed run prints in full when its key changes and as one line otherwise; nothing past the cap | T1 | the model |
| `branch-state` snapshot file | `redKey` beside `said`; `withheldStamp` removed | T1 | `branch-state.mjs` |
| SessionStart `additionalContext` | standing paragraphs once per repository per three days on startup and resume; the previous-session notice only without a pass | T2 | the model |
| `quality-harness-said/` markers | keys on (repository, text hash) with a three-day age | T2 | `saidHere` |
| `.quality-harness.json` | `prose` (optional array of pathspecs) | T3 | `qh-check` |
| `checks.jsonl` rows | `after.codeTree`, `prose`; a reuse row with `origin: 'reused'` and `reusedFrom` | T3 | `passedAlready`, `importPassVerdicts` |
| `skips.jsonl` rows | a prose reuse row | T3 | the savings count |
| `unobservableWrites` | skips an outside-root absolute path | T4 | the notice, the completion advice |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `unobservableWrites(log, root)` counts only writes the repository could have been changed by | T4 | T2 (the notice's count) | No — an added argument; a caller that omits it keeps today's count |
| `passedAlready` and `saidHere` in `lifecycle.mjs` | T2 | T3 | No — `passedAlready` is re-exported from `qh-check.mjs` |

## Implementation

See `docs/adr/ADR-094-a-standing-fact-is-said-once-and-prose-reuses-the-pass/tasks/README.md`.

## Consequences

- **Positive:** a session reads a red CI in full when it changes and as one line otherwise; an unknown once; a start in a repository it already knows carries only what changed; a documentation-only commit in a project that declared it costs a tree comparison.
- **Negative:** a fresh session started within three days in the same repository does not hear the `Verification:` paragraph again, so a session that needs the check command reads it from the project's own instructions or from the first publish advice. A reused pass row is read by an older reader as a plain pass (ADR-081's rejected alternative of a separate row kind applies); the row says `origin: 'reused'`. A project that declares `prose` over files its check reads gets a wrong reuse: that is its own assertion, named in the hint and in the docs.
- **Negative:** relocking. T1 changes assertions beside locked ADR-065 tests; the locked tests stay byte-identical and T1 adds tests beside them. Where a lock cannot hold, the relock goes through this record, as ADR-091 did.
- **Neutral:** CLAUDE.md §15 describes the brief ("a completed failed run keeps its ⚠ and its failing job names on every prompt"; "a snapshot withheld past its cap is said once"). Both sentences change with T1; the amendment is the owner's (Follow-up 1).

## Out of Scope

- Skipping the brief on injected prompts (deferred: docs/BACKLOG.md §372)
- Treating tasks of an implemented record as not in flight, and checking whether a Proposed record's tasks are listed as ready (deferred: docs/BACKLOG.md §372)
- PreToolUse lifecycle advice repeated per call (one session counted 183 repeats, about 750 bytes and one second each) (deferred: docs/BACKLOG.md §372)
- The survey's remaining items, for example infrastructure missing reported as red, a stray untracked file gated but never shown, stale `check.passed` rows re-emitted at session start, an empty `subagent.ended` agent type, the "unattributable" flag on every shared-machine run, the Git for Windows below 2.54 unarmed state never told to the agent, PreCompact at 5.5 seconds (deferred: docs/BACKLOG.md §370)
- A default for `prose`, or a classification of "documentation" by extension (permanent: boundary: a classifier over an open input; a default passes a tree that was never checked)
- The host's own injected text: rule reprints, recalled-memory blocks, the host's shell guards (permanent: boundary: this plugin does not emit them)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A reused pass for a tree whose code changed | Low | High | `codeTree` equality over the declared-away tree, command and `prose` list equal, a spec that matches `.quality-harness.json` or a gitlink refused, `:(top)` anchoring, the unseen-write veto from the original start time; one twin per way in (T3) |
| A pathspec that matches nothing makes reuse silently never fire | Medium | Low | a spec that matches no tracked path is refused and said |
| A snapshot key judged on the capped text hides a change | Low | Medium | the key is the sorted full job set; the cap applies to display only |
| A second `Verification:` never reaches a session that needs it | Medium | Low | compaction and clear say everything; a changed text is said; the hint and the publish advice name `qh-check` |
| `said` stamping the short line rebuilds the bounce (full, short, full) | Low | Medium | the short line is never stored; a test pins three prompts |

## Rollback

Revert each task's commit. The ledger keeps rows with extra fields, which every reader ignores; the marker directory keeps keys no reader asks for.

## Follow-ups

- [ ] Owner decision: amend CLAUDE.md §15's two sentences on the brief once T1 is Accepted and shipped.
- [ ] Owner decision: whether this repository declares `prose` for its own docs. It does not: its selftest reads them.
- [ ] Outside run (CLAUDE.md §18) at the release-candidate sha: the survey sessions count their hook lines before and after, and a Windows Git Bash run of T3.
