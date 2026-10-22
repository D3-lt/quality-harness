# ADR-122: Each hook item is said once per context

**Status:** Accepted
**Date:** 2026-10-21
**Accepted:** 2026-10-22 by the owner ("accept, reduce the noise where it does not matter. dedupe based on the context.")
**Owner:** Zy
**Spec:** None — no spec stage; the owner's direction of 2026-10-21 over an outside session's measurement of its own transcript and a survey of this repository's emitters
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-065-branch-state-serves-its-snapshot.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-094-a-standing-fact-is-said-once-and-prose-reuses-the-pass.md, docs/adr-archive/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-120-nothing-left-out.md, docs/adr/ADR-121-a-watcher-that-steers-on-evidence.md, docs/BACKLOG.md
**Governs:** `plugin/scripts/session-notes.mjs`, `core/hooks/notes.go`, `plugin/scripts/on-session-start.mjs`, `plugin/scripts/session-orientation.mjs`, `core/hooks/orientation.go`, `plugin/scripts/lifecycle.mjs`, `core/hooks/lifecycle.go`, `plugin/scripts/check-ledger.mjs`, `core/hooks/ledger.go`, `plugin/scripts/publish-verdict.mjs`, `core/hooks/publish.go`, `plugin/scripts/branch-state.mjs`, `plugin/scripts/artifact-pass.mjs`, `core/hooks/artifact.go`, `plugin/scripts/run-shell-hook.mjs`
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per mechanism; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-096 — its dedupe ("a finding delivered to the agent for this tree is not delivered again") holds within one context generation; after a compaction or a clear the finding is sayable again (Decision 3). ADR-060 — T5's "once per rule and evidence" holds within one context generation, for the same reason. ADR-096's locked tests in `tests/turn-end-delivery.test.mjs` (49 lines from `python3 scripts/test-locks.py tests/turn-end-delivery.test.mjs`, 2026-10-21) stay byte-identical: none of them compacts. ADR-094 Decision 2 — its three-day per-repository gate on a standing paragraph yields to per-context (Decision 8, the owner's answer of 2026-10-22): a fresh context hears it once, and a context that holds it does not hear it again.
**Served-path change:** a hook item the agent's context already holds is not said again in that context (or is one line, for a standing state), every item is sayable again after a compaction or a clear, the mention advisory is said once per context in a shorter form, and an item reaches each recipient on one channel.

## Context

**The owner's direction, 2026-10-21:** "yes we need this. context is a scarse resource". Context is a scarce resource; a line
the model already holds costs its tokens on every event that repeats it, and a line it lost at a compaction and never hears
again is a finding that did not reach it.

**What an outside session measured, 2026-10-21, from its own transcript** (a Go repository's long session, 2026-10-13 to
2026-10-21, 744 prompts and 5,164 tool calls; the figures are its counts, cited by shape, CLAUDE.md §6): about 130k characters
of quality-harness hook text. The largest: the PreToolUse "only mentions commit or push" advisory, 89 firings, 26.3k
characters as `additionalContext` plus 18.1k as `systemMessage`; the UserPromptSubmit branch-state brief, 197 firings, 34.7k
characters; the SessionStart "Verification: this project's own check is…" paragraph, 22 firings of 510 characters; about 20k
characters of artifact-validation notices, including facts-gate timeouts that say they are a budget. Worth keeping: the 38
refusals (6.7k characters) and the Stop note on unchecked commits. A memory store's session measured on its own transcript
that 79% (282 of 355) of the memory lines its prompt hook injected were already in context.

**Seen while drafting this record, 2026-10-21:** the mention advisory fired on an `mrw read --grep` whose pattern held the
words commit and push, and one PreToolUse call carried 12.8 KB of facts-gate timeout notices, each saying it is a budget.

**What the emitters do today** (read at b76ac9e0):

1. The only store that resets at compaction is the generation-scoped said-marker: `firstMentionThisSession` keys a marker on
   `session#generation#key` (`plugin/scripts/session-notes.mjs:207-252`; `core/hooks/notes.go:168-174,207-216`), and SessionStart
   bumps the generation on `compact` and `clear` (`plugin/scripts/on-session-start.mjs:51`; `core/hooks/orientation.go:666-667`).
2. Advisories and turn-end findings dedupe on `action.emitted` rows in the session event log (`emittedFor`,
   `plugin/scripts/check-ledger.mjs:599-601`; the publish arm reads them directly, `plugin/scripts/publish-verdict.mjs:448`).
   Those rows carry no generation, so after a compaction a finding the model lost is never said again: an under-delivery.
3. Every queued PreToolUse advisory is sent in full as `additionalContext` AND as a `systemMessage` headline
   (`plugin/scripts/lifecycle.mjs:109-114`; `core/hooks/lifecycle.go:276-278`). CLAUDE.md §3 says a `systemMessage` reaches the
   user only; the outside measurement counted it in the transcript. Which is true for the model's context is unmeasured.
4. The mention advisory ("only mentions commit or push", `publish-verdict.mjs:388`; `core/hooks/publish.go:195,236,297`) fires on
   text that only names the words and is deduped per tree (`<treeKey>:mention`, `publish-verdict.mjs:447`), so every new tree
   repeats it.
5. The brief's `said` store is per repository, not per session or context (`stampBriefSaid`, `plugin/scripts/branch-state.mjs:806-811`;
   `emitCachedBranchState`, `:908-940`), so a second session in the same repository can be told nothing about an unchanged CI
   state it never heard. SessionStart runs the full report every time (`plugin/hooks/hooks.json:19-21`, `--cached 120`; the
   brief is `:35-38`).
6. `firstMentionHere` is per repository for three days (`session-notes.mjs:220-240`, ADR-094 Decision 2).
7. No hook reads `transcript_path`: the only mention in `plugin/` is a comment (`plugin/scripts/statusline.mjs:21-23`), and
   `session-notes.mjs:128` records that PreCompact stopped reading transcripts.

**Prior art reconciled.** ADR-094 already said a standing fact once and every paragraph again on compaction, "because the
context lost them"; this record applies that rule to every emitter and makes the event-log dedupe obey it too. BACKLOG §372
lead (3), per-call PreToolUse advice, was closed declined on 2026-10-15 because "the section never named which advice
repeated" (`docs/backlog-archive/BACKLOG-301-400.md:2864`); the outside measurement names it (the mention advisory), so this
record takes that lead with its member named. ADR-095 (archived) is about work, not text, and is untouched. ADR-096's rule on
who a turn-end finding reaches stays; ADR-120 T6's `audience` field (`lifecycle.mjs:118-119`) is what Decision 4 reuses.
ADR-061 and ADR-066: the mention is warned about, never refused, and no refusal changes. ADR-121 decides whether a rule may
speak at all; this record decides only whether an item the context holds is said again, so the two compose. CLAUDE.md §3,
§15, §17 and §19 govern: nothing here refuses, an unchanged brief is suppressed, and the cost is judged in the adopter's
session.

**The pattern** is a sibling product's accepted-pending design for a memory store's prompt hook (its own record; this corpus's
ADR-073 is an unrelated record): the transcript is the source of truth, read incrementally after the last record whose parsed
`type` is `system` and `subtype` is `compact_boundary` (parsed, never a grep: its own tool text matched the word), scanning only
the tool's own hook outputs for markers, within a budget (8 MiB and 1 s per firing), failing open to a per-session file kept
under a try-lock that never waits; SessionStart with source `compact` or `clear` resets that file; resume keeps everything,
because the reloaded transcript still holds it. Its second Codex round (2026-10-21, read against the installed Claude Code
2.1.306 binary) settled what it had left open: at a boundary, the records named by `compactMetadata.preservedSegment`
(`headUuid`..`tailUuid`) and by `preservedMessages.uuids` / `allUuids` are kept and relinked after the summary, so they are in
context. One question both share stays open: the host may clear old tool results from the context while the transcript keeps
them. The transcript format is internal (only `transcript_path` is documented), so every parse fails open.

**Measured 2026-10-22 on this machine, from one recorded session's transcript** (this repository's own long session, Claude
Code 2.1.304 to 2.1.307, 19 compactions; counts only, nothing committed, CLAUDE.md §6), after the cold review below:

- Hook output appears as `attachment` records of type `hook_success` (`stdout`, `content`, `command`, `hookEvent`,
  `durationMs`), `hook_additional_context` (`content`, `hookEvent`, `toolUseID`), `hook_system_message` and
  `hook_non_blocking_error`, and as `system`/`stop_hook_summary` (`hookAdditionalContext`). Only `hook_success` and
  `hook_non_blocking_error` name the hook's `command`; the others are tied to it by `toolUseID` and `hookEvent`.
- The transcript also records what was SENT: `api-request` records (`base`, `keep`, `tail` of message-blob hashes,
  `querySource`) and `api-request-blob` records (`hash`, `message`). A request's message list is its base's first `keep`
  messages followed by its `tail`, so the last request's whole context can be rebuilt from blobs.
- **A PreToolUse or Stop `systemMessage` does not reach the model.** Of 395 `hook_system_message` texts not also present in
  the same call's `additionalContext`, none appears in any later request; of 433 `hook_additional_context` texts, 400 do (the
  control). CLAUDE.md §3's "a `systemMessage` reaches the user only" holds on 2.1.307.
- **A hook output in the transcript is not proof that the model received it.** Of the 33 `additionalContext` texts no later
  request carries, 19 had a compaction before the next request (consistent with the boundary reset); 14 had none, and 13 of
  those appear in no later request at all. So the transcript's hook records cannot be the evidence that an item is held.
- `api-request` records are present in recent sessions on this machine (2.1.302 onwards in the sessions counted); a session
  that predates them, or a host that stops writing them, has no request evidence.

### The class, enumerated

Each set below came from a command run on 2026-10-21 at b76ac9e0 (mrw's regular expressions are RE2).

| Class | Command | Output |
|-------|---------|--------|
| A said-marker caller | `mrw read --count --grep 'firstMentionThisSession\(\|firstMentionHere\(\|alreadyMentionedThisSession\(' plugin/scripts/ core/hooks/` (as drafted: the escaped `\|` matches nothing under RE2; corrected 2026-10-22 to an unescaped alternation, 19 lines in 8 files) | `session-notes.mjs`, `on-session-start.mjs`, `session-orientation.mjs`, `lifecycle.mjs`, `qh-check.mjs`, `notes.go`, `orientation.go`, `publish.go` (T2, T3) |
| A reader or writer of `action.emitted` | `mrw read --count --grep 'action\.emitted' plugin/scripts/ core/hooks/` | 24 lines in 11 files: `check-ledger.mjs`, `publish-verdict.mjs`, `lifecycle.mjs`, `artifact-pass.mjs`, `ledger.go`, `lifecycle.go`, `artifact.go`, `mcp.go`, `prose.go`, `publish.go`, `sessionend.go` (T3) |
| A queued hook action | the same correction, `'queueAction\(|h\.queue\('`: 22 lines in 10 files | `publish-verdict.mjs`, `artifact-pass.mjs`, `completion-rules.mjs`, `lifecycle.mjs`, `hook-queue.mjs`, `turnend.go`, `sessionend.go`, `artifact.go`, `lifecycle.go`, `publish.go` (T3) |
| A suppression reader (added 2026-10-22, the cold review) | `mrw read --count --grep 'emittedFor\(|namedByPublish\(|namedByReview\(|reachedChannel\(|stampBriefSaid|:mention' plugin/scripts/ core/hooks/`: 41 lines in 9 files | `check-ledger.mjs`, `completion-rules.mjs` (R1, R2 at :786, :807; R4's location key at :821), `publish-verdict.mjs`, `branch-state.mjs`, `artifact-pass.mjs` (its said-set at :410), `ledger.go`, `turnend.go`, `publish.go`, `artifact.go`; plus `sessionend.go:192` (R3) and `prose.go:219` (the prose hint), named by the review (T3) |
| A direct output path (added 2026-10-22, the cold review) | `mrw read --count --grep 'additionalContext|systemMessage|hookSpecificOutput' plugin/scripts/ core/hooks/`: 52 lines in 10 files | `lifecycle.mjs`, `on-pre-tool-use.mjs` (ledger warnings, :36), `on-session-start.mjs`, `on-subagent-start.mjs` (Out of Scope), `run-shell-hook.mjs` (PostToolUse gate output, :390), `facts-gate-dispatch.sh`, `corpus-probe.mjs` (not a hook: excluded), `lifecycle.go`, `orientation.go`, `publish.go` (:437) (T3) |
| The mention text | `mrw read --grep 'only mentions commit or push' plugin/scripts/publish-verdict.mjs core/hooks/publish.go` | `publish-verdict.mjs:388`, `publish.go:195,236,297` (T3) |
| A budget notice | `mrw read --grep 'is a budget, not a finding' plugin/scripts/ core/hooks/` | `artifact-pass.mjs:130,168`, `run-shell-hook.mjs:429,642`, `artifact.go:140,191` (T3) |
| A branch-state hook | `mrw read --grep 'cached' plugin/hooks/hooks.json` | SessionStart `:20-21`, UserPromptSubmit `:37-38` (T3) |
| A transcript reader | `mrw read --count --grep 'transcript_path' plugin/` | 1 line, a comment (`statusline.mjs:21`) (T2 adds the first) |
| A test asserting the mention phrase | `mrw read --stat --grep 'only mentions commit or push' tests/` | 6 files; locks from `python3 scripts/test-locks.py <file>`: `tests/hook-goldens.test.mjs` 51, `tests/publish-command.test.mjs` 297, `tests/lifecycle.test.mjs` 191, `tests/late-baseline.test.mjs` 0, and the two golden JSON files they read (T3) |
| A test asserting ADR-094's three-day gate (added 2026-10-22, the cold review) | `python3 scripts/test-locks.py tests/standing-facts.test.mjs` | 4 locks, ADR-094 T2 (`:40`, `:63-64`, `:85`, `:88` require a later fresh session to hear no `Verification:` paragraph); T3 relocks them under Decision 8 |

## Existing Primitives Audit

- **The per-session, per-generation marker already exists** (`firstMentionThisSession`, `session-notes.mjs:242-252`,
  `notes.go:207-216`, reset by the generation bump on `compact` and `clear`). After the cold review it is NOT evidence that an
  item was received: it is written before the output is flushed (`lifecycle.mjs:64`), so a killed hook or a lost output leaves
  it behind. It stays what it is today, the existing dedupe where there is no request evidence (Decision 2), and is never a
  new reason to suppress.
- **`emittedFor` and `reachedChannel`** (`check-ledger.mjs:592-601`) stay the event-log dedupe where there is no request
  evidence; T3 adds a generation to the rows. A row with no generation is read as generation 0, so it suppresses nothing after
  the first compaction or clear (the cold review: counting it for every generation would defeat the reset).
- **branch-state's `redKey` and its one-line red form** (`branch-state.mjs:921-926`) are the shape Decision 2's "standing state
  shortened to one line" generalises.
- **The `audience` field** (ADR-120 T6, `lifecycle.mjs:118-119`) is the per-recipient switch Decision 4 reuses.
- **The refusal invariant** "a denial has to happen on every attempt" (`publish-verdict.mjs:443-446`) is kept as is.

## Decision

1. **Every hook item carries a stable item name and a content digest, written into its text as `<qh:<item>@<hash8>>`** (the
   first 8 hex of the SHA-256 of the item's stable text). Volatile text (an age, `(read 12s ago)`, a run id, a duration) is
   outside the digested text, so an unchanged item has an unchanged digest (CLAUDE.md §19). A changed text is a new digest and
   is always said in full. *This fails if* two firings whose only difference is an age carry different digests, or a changed
   finding keeps its old digest.
2. **"Said in this context" means the item's marker is in the last request the receiving context sent** (the measurement of
   2026-10-22 above): the last `api-request` in the receiving context's transcript whose `querySource` T1 names as that
   context's main loop, rebuilt through `base`, `keep` and `tail` into message blobs, with the marker inside a text block
   that is hook output and not inside a `tool_result`. A request is what the model received, so a compaction, a clear, a
   rewind, a fork and a host-cleared output are all already reflected in it, and a stale marker on an abandoned branch is not
   in it. The rules:
   - **Only positive evidence suppresses.** No `api-request` record, a request chain that cannot be rebuilt, a blob that is
     missing, a parse failure, or a scan past its budget (8 MiB read and 1 s per firing) is NO evidence, and the item falls
     to today's behaviour: the dedupe that already applies to it (the event log, the said-marker, the brief's store), with
     Decision 3's reset. Nothing the plugin does not suppress today is suppressed without request evidence. *This fails if*
     an item is suppressed by a marker that is in no rebuilt request.
   - **Within one turn**, items said after the last request are not yet in any request. Such an item is held as pending under
     the last request's id in the per-session, per-generation marker directory; while the last request's id is unchanged a
     repeat is skipped; as soon as a newer request exists, the request alone decides, so an item the newer request does not
     carry is said again. *This fails if* a pending item survives a newer request that does not carry it.
   - **The receiving context is the one the hook fires in.** A hook input with an `agent_id` is a subagent's context: its
     evidence is that subagent's own transcript, located from the input, and when it cannot be located there is no evidence.
     A parent's request never suppresses a subagent's item, nor a subagent's the parent's or a sibling's. *This fails if* an
     item said in one context is suppressed in another.
   - The scan is incremental: blob hashes are content addresses, so a cached blob's markers never change; the cache keeps the
     transcript offset, its identity (inode and first record `uuid`), the request index and the blob markers, never advances
     past an incomplete last line, and is written under an exclusive create that never waits. *This fails if* a firing
     re-reads blobs it cached, skips a record written in two parts, or blocks on another firing's write.
   - A repeat is skipped, or shortened to one line where the item is a standing state (CI red, unchanged).
3. **Compaction and clear make every item sayable again.** Under request evidence this is automatic: a compacted context's
   next request does not carry the old markers. Without it, `action.emitted` rows carry the generation they were said in and
   every event-log dedupe counts only the current generation's; a row with no generation is generation 0. Resume makes
   nothing sayable again: the reloaded context still holds it, and its next request shows that. *This fails if* a finding
   said before a compaction is not said after it, or is said again after a resume whose request carries it.
4. **One channel per recipient, as measured on 2.1.307**: the model reads `additionalContext` (and UserPromptSubmit and
   SessionStart stdout); the user reads `systemMessage`. So the model receives each item once per firing today, and the user's
   headline stays; Decision 2 applies to both channels, so a skipped item sends neither its text nor its headline, and the
   user's noise falls with the model's. Stop's `audience` (ADR-120 T6) is unchanged. If a later host is measured to deliver a
   `systemMessage` to the model, the headline is dropped wherever the same text goes as `additionalContext`. *This fails if*
   a skipped item still sends a headline, or an item said in full loses its headline.
5. **The mention advisory is said once per context, not per tree, and its text is shortened**, keeping every substring a
   locked test asserts (T3 reads those assertions first). A command the classifier proves is a commit or a push keeps today's
   behaviour and key. Refusals are never deduplicated: each attempt is answered (`publish-verdict.mjs:443-446`). *This fails
   if* a second tree in the same context repeats the mention, a proven commit's advice is suppressed by an earlier mention, or
   a refusal is skipped because it was said.
6. **A skip is never a verdict.** A skipped repeat must not stand in for a new fact: a changed state is a new digest and is
   said. Could-not-look lines (ADR-005) keep their own rule, said when they change. *This fails if* an UNRUN, UNPROVEN or COULD
   NOT LOOK line that changed is skipped.
7. **Node and the Go core both, behind one helper each** (`plugin/scripts/said-per-context.mjs`, `core/hooks/saidcontext.go`),
   with parity rows. A measurement task re-runs the outside session's transcript method before and after (CLAUDE.md §19).
8. **The standing SessionStart paragraphs are said once per context, not once per repository per three days** (the owner,
   2026-10-22: "dedupe based on the context"). `firstMentionHere`'s three-day gate (ADR-094 Decision 2,
   `session-notes.mjs:220-240`) is no longer what decides; `saidInContext` is, so a new session's context hears the
   `Verification:` paragraph once, and a context that holds it does not hear it again. *This fails if* a fresh context within
   three days of another session is not told the project's check, or a context that already holds it is told again.

**Valid for** the Claude Code transcript format as read on 2026-10-22 (2.1.307: hook-output records, `api-request` and
`api-request-blob`). The format is internal; a host that changes it leaves this plugin with no request evidence, which is
today's behaviour plus the compaction reset of Decision 3.

## Alternatives Considered

- **Keep per-tree and per-repository keys, and only shorten the texts:** rejected. The cost is the repetition (ADR-094's
  alternative (b) said the same), and it leaves the post-compaction under-delivery.
- **The per-session, per-generation marker alone, no transcript scan:** rejected as the primary source. It cannot see a resume
  that kept the context, nor a preserved segment, and it is the store the outside session's numbers were produced under; it
  stays as the fallback.
- **Grep the transcript for markers:** rejected. The sibling's own tool text matched the boundary word; a parse over record
  shapes is the only reading that tells a hook output from a tool result (CLAUDE.md §16).
- **The transcript's hook-output records as the evidence (the draft's Decision 2):** rejected after the 2026-10-22
  measurement: 13 of 433 `additionalContext` texts were recorded and never sent, so a record is not delivery; and lineage,
  preserved segments and subagents each needed their own reconstruction, which the request already is.
- **Drop the PreToolUse headline outright:** rejected: the measurement shows it reaches the user only, so dropping it would
  take the one line that says the agent was advised; Decision 4 drops it only where the item is skipped.

## Component / Boundary Impact

Two modules are added: `plugin/scripts/said-per-context.mjs` and its Go twin `core/hooks/saidcontext.go`, owned by the hooks;
every emitter calls them, and they own the marker, the scan and the fallback. `docs/architecture.md`'s module map gains both
rows in T2's commit. `session-notes.mjs` and `notes.go` keep the marker directory and its sweep.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Hook output text | ends each item with `<qh:<item>@<hash8>>` | T2 | the model; the scan |
| `saidInContext(input, item, text)` / `SaidInContext` | new: said, pending, unsaid or no-evidence, from the receiving context's last request | T2 | every emitter and every suppression reader (T3) |
| Scan cache | new file per transcript in the marker directory: offset, identity, request index, blob markers; pending items per request id | T2 | the scan |
| `action.emitted` rows | new `generation` field; every event-log dedupe compares it; none is generation 0 | T3 | the event-log dedupe, Node and Go |
| The mention advisory | once per context; shorter text | T3 | the model |
| PreToolUse and Stop `systemMessage` | not sent for a skipped item | T4 | the user |
| `scripts/hook-footprint.mjs` | new repository tool: counts this plugin's hook text in a transcript by item and channel | T1 | T5 |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| The hook-output record shapes and the channel measurement | T1 | T2, T4 | No — a list and a finding |
| `scripts/hook-footprint.mjs` | T1 | T5 | No — new |
| `saidInContext` and the marker | T2 | T3, T4 | No — new |
| Generation-aware dedupe and every emitter and suppression reader routed | T3 | T5 | No — a row with no generation is generation 0 |
| One channel per recipient | T4 | T5 | No |

## Implementation

See `tasks/README.md`: T1, then T2, then T3 and T4, then T5.

## Consequences

- **Positive:** the outside session's largest repeats (the mention advisory, the brief, the budget notices) are said once per
  context; a finding lost at compaction is said again; a new session hears the CI state it never heard.
- **Negative:** every hook item grows by a marker of about 30 characters; the first scan in a long resumed session pays its
  budget; the transcript format is internal, so a host change silently moves the plugin to no request evidence (T2 says so
  once per context when it does).
- **Negative:** within one turn, before the next request, an item is pending, not proven; it is said again if the next
  request does not carry it.
- **Negative:** relocking. T3 changes the mention text next to locked assertions; the locked tests stay byte-identical by
  keeping every asserted substring, and any that cannot is relocked under this record with its reason.
- **Neutral:** the brief becomes per context, so a second session in the same repository hears an unchanged CI state once.

## Out of Scope

- Deduplicating refusals (permanent: boundary: a refusal answers an attempt, and every attempt is answered, ADR-061)
- The SubagentStart contract (permanent: boundary: a subagent starts with a fresh context each time, so its contract is always unsaid there)
- Text the host injects: rule reprints, recalled-memory blocks, the host's own guards (permanent: boundary: this plugin does not emit them, as ADR-094 already scoped)
- Whether a rule may speak at all, and which nudges work (permanent: boundary: ADR-121 owns that; this record only stops a repeat)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The scan counts a marker the model no longer holds | Low | Med: an under-delivery | the evidence is the last request, which is what the model received; host-side context editing after the request (`context_management`) is a residual, T1 measures whether it touches hook text |
| The transcript format changes | Med | Low | no request evidence means today's behaviour; T2 says so once per context |
| The scan costs more than it saves | Low | Med | blob markers cached by content address; 8 MiB and 1 s ceilings; T1 records the hooks' `durationMs` before, T5 after |
| A shortened mention text breaks a locked assertion | Med | Low | T3 reads every locked assertion's substring first and keeps it |
| A skip hides a changed fact | Low | High | the digest covers the stable text; Decision 6 twins in T2 and T3 |

## Rollback

Each task is its own commit and reverts alone. The scan cache and markers live in the marker directory under its sweep and
are read by nothing once reverted; `action.emitted` rows keep a `generation` field every older reader ignores.

## Follow-ups

- [x] Owner decision: whether ADR-094 Decision 2's three-day per-repository gate yields to per-context — yes (2026-10-22, Decision 8).
- [x] A cold Codex review of this record (`host-review.mjs --host codex --effort xhigh`, 2026-10-22): REQUEST CHANGES, eight blocking and two non-blocking findings, each closed in this amendment: (1, 7) the transcript's hook records are not delivery, so the evidence is the last request and no evidence never suppresses; (2) a row with no generation is generation 0; (3) the receiving context, subagents included; (4) lineage, which the request already reflects; (5) every suppression reader routed, T3; (6) ADR-094's locked tests relocked, T3; (8) the channel mapping as measured, Decision 4; (9) the class table corrected and extended; (10) T1 records `durationMs`, T2 and T3 name their proof rows and keep gate output.
- [ ] After T5: an outside run by an eligible peer (CLAUDE.md §18), then a bump and `release.mjs`.
