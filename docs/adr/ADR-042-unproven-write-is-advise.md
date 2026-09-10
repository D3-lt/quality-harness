# ADR-042: UNPROVEN write authorship is Advise

**Status:** Accepted
**Date:** 2026-09-10
**Owner:** zy
**Spec:** `docs/specs/2026-09-10-statusline-layer-unproven-as-advise.md`
**Cross-references:** ADR-005, ADR-038 F-20 / F-24, ADR-041, `plugin/scripts/lifecycle.mjs` (`analyzeTranscript`, `sessionStateNote`, PreToolUse), `plugin/scripts/statusline.mjs` (`reading`)

**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/statusline.mjs`

Class: Advise surfaces that ignore `authorship` UNPROVEN and key `lastMutation` / `mutationPathsSince`. Enumerated 2026-09-10 with `rg -n "authorship = 'UNPROVEN'|function sessionStateNote|unverifiedSince:|export function reading|unverifiedSince\\(state.lastPublish\\)" plugin/scripts/lifecycle.mjs plugin/scripts/statusline.mjs` and `git ls-files -- plugin/scripts/lifecycle.mjs plugin/scripts/statusline.mjs tests/lifecycle.test.mjs tests/statusline.test.mjs tests/staged-product.test.mjs plugin/hooks/hooks.json`:

```
plugin/scripts/statusline.mjs:42:export function reading(...)
plugin/scripts/lifecycle.mjs:1889:      authorship = 'UNPROVEN'
plugin/scripts/lifecycle.mjs:1915:    unverifiedSince: position => lastMutation > position
plugin/scripts/lifecycle.mjs:3318:export function sessionStateNote(...)
plugin/scripts/lifecycle.mjs:3325:  const pending = state.unverifiedSince(state.lastPublish) || unprovenWrite
plugin/scripts/lifecycle.mjs:4054:    if ((state.unverifiedSince(state.lastPublish) || state.authorship === 'UNPROVEN') && projectCheckCommand(input.cwd)) {
plugin/scripts/lifecycle.mjs:4084:  const unverified = state.unverifiedSince(state.lastPublish) || state.authorship === 'UNPROVEN'
```

```
plugin/hooks/hooks.json
plugin/scripts/lifecycle.mjs
plugin/scripts/statusline.mjs
tests/lifecycle.test.mjs
tests/staged-product.test.mjs
tests/statusline.test.mjs
```

Members in: the UNPROVEN assignment; Stop / SubagentStop / TaskCompleted `unverified` at 4084; `sessionStateNote`; `statusline.mjs` `reading()`; PreToolUse commit advice at 4054 (F-2). Members left out: `work-next --json` `layer`; `hooks.json` `statusLine`; a path extractor for every MCP write; `tests/staged-product.test.mjs` F-24 (stays: `mcp__mrw__mrw_write` remains UNPROVEN, `lastMutation` -1).


**Enforced-by:** `tests/lifecycle.test.mjs::an unknown non-Bash write is Advise, not nothing edited`, `tests/lifecycle.test.mjs::Read or Grep is not Advise every turn`, `tests/lifecycle.test.mjs::PreToolUse commit advice Advises on UNPROVEN writes`, `tests/lifecycle.test.mjs::PreToolUse commit advice does not Advise on Read or Grep`
**Invalidates:** none — checked (does not reverse ADR-038 F-24; does not reverse ADR-039–041)
**Served-path change:** Stop, PreCompact `sessionStateNote`, the user-wired statusline segment, and PreToolUse on Bash `git commit` Advise on an unknown write; a Read/Grep turn does not.


## Context

Inherited from `docs/specs/2026-09-10-statusline-layer-unproven-as-advise.md` §Problem / §Goal. Executed 2026-09-10 against working-tree `analyzeTranscript`: Read, Grep, Glob, WebSearch, WebFetch, Task, TodoWrite, Skill, Agent, `mcp__mrw__mrw_write`, `mcp__mrw__mrw_read`, and `mcp__other__write` are each `authorship` UNPROVEN, `lastMutation` -1, `unverifiedSince` false. Edit/Write/MultiEdit/NotebookEdit are native. Isolated `echo hi` Bash is none. Stop / `sessionStateNote` / `reading()` ignore authorship, so an MCP write is silent `kind: nothing` / "nothing edited since the last publish."

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this Advise wiring. ADR-030's deferred host `statusLine` is the field this spec refuses to claim; not pulled in.

## Existing Primitives Audit

- `analyzeTranscript` `authorship` UNPROVEN — **reshape.** Skip the executed known non-write names; unknown non-Bash non-`MUTATION_TOOLS` stays UNPROVEN.
- `MUTATION_TOOLS` / native Edit/Write/MultiEdit/NotebookEdit — **reuse.**
- Stop / SubagentStop / TaskCompleted `unverified` — **reshape.** Also true when `authorship === 'UNPROVEN'`.
- `sessionStateNote` / `statusline.mjs` `reading()` — **reshape.** Advise on that UNPROVEN; do not key only `mutationPathsSince`.
- PreToolUse commit advice — **reshape.** Advise on that UNPROVEN; do not key only `unverifiedSince(lastPublish)`.

- `work-next.mjs --json` — **leave.** No `layer`.
- `hooks.json` — **leave.** No `statusLine`.

## Decision

**UNPROVEN for Advise is a write-shaped unknown, not every non-Bash tool_use. The wired surfaces (Stop / SubagentStop / TaskCompleted, `sessionStateNote`, `reading()`, PreToolUse commit advice) Advise on that UNPROVEN. Known non-write names do not. F-24 stands.**


1. Executed names that must not Advise (measured 2026-09-10, currently UNPROVEN): Read, Grep, Glob, WebSearch, WebFetch, Task, TodoWrite, Skill, Agent, `mcp__mrw__mrw_read`. They keep `authorship` `none` when that is all that ran.
2. Any other executed non-Bash name outside `MUTATION_TOOLS` stays UNPROVEN, including `mcp__mrw__mrw_write` and `mcp__other__write`. Fail-closed: "not recognised as a read" is not "known not a write" (CLAUDE.md §16). No path extractor; `lastMutation` stays -1.
3. Stop / SubagentStop / TaskCompleted, `sessionStateNote`, `reading()`, and PreToolUse on Bash `git commit` Advise when `authorship === 'UNPROVEN'`, not "nothing edited" / `kind: nothing` / a silent commit.

4. This record does not add `layer`, does not set Claude's `statusLine`, and does not reverse ADR-038–041.

## Alternatives Considered

- **Wire today's UNPROVEN into the three surfaces unchanged.** Rejected: Read/Grep would Advise every turn (`hasMutations` is already true).
- **Allowlist only `mcp__mrw__mrw_write` as UNPROVEN.** Rejected: `mcp__other__write` would become "no mutation" (F-24 reverse; CLAUDE.md §16).
- **Set `lastMutation` without recording a path.** Rejected: F-24 asserts `lastMutation` -1 and empty `mutationPaths`.
- **Invent a path extractor for every MCP write.** Rejected: Non-Goal of the spec.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|----------|------------------------|----------------|
| `lifecycle.mjs` `analyzeTranscript` | Session authorship | UNPROVEN is write-shaped |
| Stop / SubagentStop / TaskCompleted | Session evidence | Advise on UNPROVEN write |
| `sessionStateNote` | PreCompact / compact SessionStart | not silent nothing-edited |
| `statusline.mjs` `reading` | user-wired segment | not `kind: nothing` |
| PreToolUse commit advice | Session evidence | Advise on UNPROVEN write at `git commit` |


## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: PreToolUse on Bash `git commit` Advises on UNPROVEN write authorship (F-2).


## Inter-task Contracts

None.

## Implementation

See `docs/adr/ADR-042-unproven-write-is-advise/tasks/README.md`.

## Consequences

- **Positive:** an MCP write is Advise on Stop / compact note / the wired segment / PreToolUse `git commit`, not silent nothing-edited. A Read/Grep turn stays quiet.
- **Negative:** an unknown tool name that is actually read-only and not in the denylist Advises (fail-closed).

- **Neutral:** F-24's `lastMutation` -1 / empty paths stay. Probe-only Bash stays `none` (ADR-041).

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.


- Peel `cat` / `pwd` / `git status` / unknown `neither` (permanent: boundary: CLAUDE.md §16; ADR-041 left those unpeeled)
- Event ledger / ADR-035 `claims.jsonl` (permanent: boundary: Non-Goal)
- Reverse ADR-038–041 (permanent: boundary: F-24 MCP write stays UNPROVEN; listing and probe-peel stand)
- Hook opt-in (permanent: boundary: F-21 always-on)
- Add `layer` to `work-next --json` or the statusline segment (permanent: boundary: leftover grill, not F-1)
- A path extractor for every MCP write name (permanent: boundary: F-24)
- Cursor / OpenCode host adapter; `plugin/CORE.md`; a 15th skill; MCP verify (permanent: boundary: Non-Goal)
- Claim the plugin can set Claude Code's `statusLine` (permanent: fact: the plugin cannot set that host field; citation: file `plugin/README.md:29`)
- Unify with SessionStart listing (ADR-040) or `observe` / `adrCorpus` (ADR-039) (permanent: boundary: Non-Goal)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Wiring authorship UNPROVEN as-is Advises every Read/Grep turn | High | High | Denylist the executed read-class names; tests cover the class |
| Allowlisting only `mcp__mrw__mrw_write` reverses F-24 for other MCP writes | High | High | Fail-closed UNPROVEN; fixture includes `mcp__other__write` |
| After claims QH installed Claude's bar | High | High | `hooks.json` has no `statusLine`; the happy test asserts that |

## Rollback

Revert the UNPROVEN skip and the three-surface authorship reads. No persistent state.

## Follow-ups

- [ ]
