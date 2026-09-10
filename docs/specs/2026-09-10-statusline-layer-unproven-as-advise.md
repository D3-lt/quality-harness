# Spec: Treat UNPROVEN write authorship as Advise

> **Date:** 2026-09-10 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-042 (`docs/adr/ADR-042-unproven-write-is-advise.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** docs/specs/2026-09-09-a-staged-product-not-a-funnel.md (ADR-038 F-24), docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md (leftover), docs/specs/2026-09-10-records-use-the-same-listing.md (leftover), docs/adr/ADR-038-a-staged-product-not-a-funnel.md, docs/adr/ADR-041-a-probe-prefix-is-not-the-mutation.md, plugin/scripts/statusline.mjs, plugin/scripts/lifecycle.mjs (`analyzeTranscript`, `sessionStateNote`), plugin/scripts/work-next.mjs, plugin/README.md (status line)

## Problem

ADR-038 F-24 sets `analyzeTranscript.authorship` to UNPROVEN for unknown non-Bash `tool_use`, so an MCP write is not "no mutation". Stop, `sessionStateNote`, and `statusline.mjs` never read `authorship`; they key `lastMutation` / `mutationPathsSince`. Executed 2026-09-10: a Read-only or `mcp__mrw__mrw_write` transcript is `kind: 'nothing'` on the statusline and `sessionStateNote` says "nothing edited since the last publish." Dumping today's UNPROVEN into those Advise surfaces would also fire on Read/Grep. `work-next --json` has `look` and `next` (`id` / `entry` / `when`), no `layer`. The plugin cannot set Claude's `statusLine`.

## Goal

The wired statusline segment, Stop, and `sessionStateNote` Advise on UNPROVEN *write* authorship. Read/Grep (and the other executed non-write names) do not become that Advise. QH does not wire Claude's bar by itself.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | trust the wired `QH` segment and Stop: an unknown write is Advise; a Read/Grep turn is not unverified |
| `analyzeTranscript` | system | UNPROVEN for Advise is a write-shaped unknown, not every non-Bash tool_use |
| Stop / `sessionStateNote` | system | Advise (not silent "nothing edited") when write authorship is UNPROVEN |
| `statusline.mjs` | system | the user-wired segment renders that Advise; it does not install the host `statusLine` |
| `work-next` | system | `--json` stays `look` / `next`; this fact does not add `layer` |

## Use Cases

### UC-1: Advise surfaces name UNPROVEN writes, not every UNPROVEN tool_use

- **Trigger:** Stop runs, PreCompact writes `sessionStateNote`, or the user-wired statusline command renders · **Preconditions:** the hook or statusline command can read the transcript; for the statusline, the user has already added `node "$(qh-root)/scripts/statusline.mjs" <<< "$input"` to their own `statusLine` command
- **Main flow:**
  1. Classify authorship. Native Edit/Write/MultiEdit/NotebookEdit stay mutations. Isolated probe Bash stays `none` (ADR-041).
  2. An executed unknown non-Bash *write* (no path extractor; F-24 member `mcp__mrw__mrw_write`) is UNPROVEN write authorship.
  3. Stop, `sessionStateNote`, and the wired statusline segment Advise on that UNPROVEN write (not "nothing edited").
- **Failure paths:**
  - a. at step 2, the tool_use is Read, Grep, Glob, WebSearch, WebFetch, Task, TodoWrite, Skill, Agent, or `mcp__mrw__mrw_read` → not UNPROVEN for Advise; the three surfaces do not treat the turn as unverified.
  - b. at preconditions, the user has not wired a `statusLine` command → QH does not set Claude's bar; hooks.json has no `statusLine`; the after is the segment if wired, not an installed bar.
- **Postconditions:** UNPROVEN write is Advise. Read-class UNPROVEN is not Advise. F-24 still holds. No `layer` field. No host statusLine install.

## Scenarios

### UC1-S1 [happy] an unknown non-Bash write is Advise, not nothing edited (F-1 Accepted) [@implemented] → `tests/lifecycle.test.mjs::an unknown non-Bash write is Advise, not nothing edited` cmd:`node --test --test-name-pattern 'an unknown non-Bash write is Advise, not nothing edited' tests/lifecycle.test.mjs`

```gherkin
Given a transcript whose only non-Bash tool_use is mcp__mrw__mrw_write, executed
When Stop runs, sessionStateNote is written, or the wired statusline command renders
Then authorship remains UNPROVEN (F-24: not "no mutation")
And those surfaces Advise rather than "nothing edited since the last publish" / statusline kind nothing
```

### UC1-S2 [failure] Read or Grep is not Advise every turn (F-1 Accepted) [@implemented] → `tests/lifecycle.test.mjs::Read or Grep is not Advise every turn` cmd:`node --test --test-name-pattern 'Read or Grep is not Advise every turn' tests/lifecycle.test.mjs`

```gherkin
Given a transcript whose only tool_uses are Read and/or Grep, executed
When Stop runs, sessionStateNote is written, or the wired statusline command renders
Then those surfaces do not Advise unverified work on the strength of that authorship
And this holds for Glob, WebSearch, WebFetch, Task, TodoWrite, Skill, Agent, and mcp__mrw__mrw_read as well
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Current: `analyzeTranscript` sets `authorship` UNPROVEN for an executed tool_use that is not Bash and not in MUTATION_TOOLS (Edit, Write, MultiEdit, NotebookEdit) while authorship is still none. Executed 2026-09-10: Read, Grep, Glob, WebSearch, WebFetch, Task, TodoWrite, Skill, Agent, mcp__mrw__mrw_write, mcp__mrw__mrw_read are each UNPROVEN, lastMutation -1, hasMutations true, unverifiedSince(lastPublish) false. Edit/Write/MultiEdit/NotebookEdit are native. Isolated `echo hi` Bash is none. Stop (`unverifiedSince`), `sessionStateNote`, and `statusline.mjs` `reading()` do not read authorship; they key lastMutation / mutationPathsSince. Read+Grep: sessionStateNote status neutral, "nothing edited since the last publish." Statusline reading() of Read-only and of mcp__mrw__mrw_write: kind nothing. `node plugin/scripts/work-next.mjs --json` on this corpus: look ok, next.id adr-execute (not spec-write), next has id/entry/when, no layer; stages entries the same. statusline.mjs has no layer. Plugin hooks.json has no statusLine; README tells the user to wire `node "$(qh-root)/scripts/statusline.mjs" <<< "$input"`. After: Stop, sessionStateNote, and the statusline segment the user already wired treat UNPROVEN write authorship as Advise, not silent nothing-edited. The classifier those three surfaces use for that Advise does not treat Read, Grep, Glob, WebSearch, WebFetch, Task, TodoWrite, Skill, Agent, or mcp__mrw__mrw_read as UNPROVEN. ADR-038 F-24 stands: mcp__mrw__mrw_write remains UNPROVEN, never "no mutation". After does not add a layer field to work-next --json or to the statusline segment. After does not claim QH sets Claude's statusLine. This spec does not reverse ADR-038–041, does not peel cat/pwd/git status/unknown neither, does not add a hook opt-in, and does not add an event ledger. Why it can fail: wiring today's authorship UNPROVEN into unverifiedSince or statusline kind would Advise every turn after a Read/Grep (hasMutations is already true; only lastMutation keeps the surfaces quiet). A green F-24 MCP test leaves Stop/statusline/sessionStateNote silent because they ignore authorship. Claiming the plugin wired Claude's bar. Shipping layer in the same fact so a green UNPROVEN-Advise test is treated as the leftover closed. | `tests/lifecycle.test.mjs::an unknown non-Bash write is Advise, not nothing edited` | @implemented | `node --test --test-name-pattern 'an unknown non-Bash write is Advise, not nothing edited' tests/lifecycle.test.mjs` |

## Domain

**UNPROVEN write** = executed non-Bash tool_use with no path extractor that can mutate the tree (F-24 member: `mcp__mrw__mrw_write`); not "every name outside MUTATION_TOOLS". **Advise** = `errors.advise` / Stop `systemMessage` / statusline unverified-style segment — never a block (`errors.append` / hook opt-in). **Wired statusline** = the user's `statusLine` command calling `statusline.mjs`; QH cannot set that host field. **layer** = Core / Session / Corpus (ADR-038); not a `work-next --json` key today. Ubiquitous language already decided: could-not-look ≠ empty (ADR-005); not-recognised ≠ not-a-record; UNPROVEN ≠ no mutation (F-24).

Class F-1 governs: executed non-Bash names not in MUTATION_TOOLS. Enumerated 2026-09-10 by calling `analyzeTranscript` in `plugin/scripts/lifecycle.mjs` on live names (and `reading` / `sessionStateNote` / `work-next --json`):

```
UNPROVEN  Read, Grep, Glob, WebSearch, WebFetch, Task, TodoWrite, Skill, Agent, mcp__mrw__mrw_write, mcp__mrw__mrw_read
native    Edit, Write, MultiEdit, NotebookEdit
none      Bash `echo hi`
unread    Stop unverifiedSince, sessionStateNote, statusline reading() ignore authorship
no layer  work-next --json keys look, next.{id,entry,when}, stages — not layer
```

Members in for Advise-after: unknown writes (`mcp__mrw__mrw_write`). Members out of Advise-after: the UNPROVEN read/orchestration names above. Members left to a later grill: a `layer` field on `--json` or the segment.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `plugin/scripts/lifecycle.mjs` `analyzeTranscript` authorship used for Advise | UNPROVEN for Advise is write-shaped, not Read/Grep | Stop, `sessionStateNote`, statusline `reading()` |
| `plugin/scripts/lifecycle.mjs` Stop / `sessionStateNote` | Advise on UNPROVEN write, not silent nothing-edited | Stop, SubagentStop, TaskCompleted, PreCompact |
| `plugin/scripts/statusline.mjs` `reading` / `render` | render UNPROVEN write as Advise on the user-wired segment | the user's `statusLine` command |
| `plugin/scripts/work-next.mjs --json` | none in this fact (no `layer`) | `/quality-harness:work`, humans |

## Non-Goals

- Peel `cat` / `pwd` / `git status` / unknown `neither` from this session (separate spec, CLAUDE.md §16 classifier; ADR-041 left those unpeeled).
- An event ledger.
- Reverse ADR-038–041 (F-24 UNPROVEN for unknown non-Bash writes stays; probe-only Bash stays not authorship; listing rules stand).
- A hook opt-in switch (`hooks.json` stays always-on; F-21).
- Add `layer` (core / session / corpus) to `work-next --json` or to the statusline segment — undecided; see Open Questions.
- Invent a path extractor for every MCP write name (F-24; named tools later, with a fixture).
- Cursor / OpenCode host adapter; `plugin/CORE.md`; a 15th skill; MCP verify.
- Claim the plugin can set Claude Code's `statusLine`.
- Unify with SessionStart listing (ADR-040) or `observe` / `adrCorpus` (ADR-039).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Wiring authorship UNPROVEN as-is into statusline / Stop fires every Read/Grep turn | High | High | F-1 names the executed read-class members as out of Advise |
| A green F-24 MCP test leaves Stop/statusline silent | High | High | Bind on Stop / sessionStateNote / statusline reading(), not only analyzeTranscript.authorship |
| After claims QH installed Claude's bar | High | High | After is the user-wired segment; hooks.json has no statusLine |
| A green UNPROVEN-Advise test is treated as closing `layer` | Med | Med | F-1 after excludes layer; Open Question owns it |
| Narrowing UNPROVEN for Advise quietly reverses F-24 for mcp__mrw__mrw_write | High | High | F-24 member stays UNPROVEN write; no path extractor in this spec |

## Open Questions

<!-- Empty. layer leftover is a Non-Goal of this spec (later grill), not F-1. -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-10-statusline-layer-unproven-as-advise.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Current / after / why it can fail: UNPROVEN-as-Advise on Stop, sessionStateNote, and the user-wired statusline, with the classifier constraint that Read/Grep (and the executed non-write names) must not Advise every turn; F-24 MCP write stays UNPROVEN; plugin cannot set the host statusLine; no layer field in this fact? | F-1 | Accepted. Stop, sessionStateNote, and the user-wired statusline Advise on UNPROVEN write authorship. Read/Grep/Glob/WebSearch/WebFetch/Task/TodoWrite/Skill/Agent/mcp__mrw__mrw_read must not. F-24: mcp__mrw__mrw_write remains UNPROVEN, not "no mutation." No layer in F-1. QH does not set Claude's statusLine. Does not reverse ADR-038–041. |
