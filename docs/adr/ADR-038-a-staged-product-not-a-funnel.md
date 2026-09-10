# ADR-038: A staged product, not a funnel

**Status:** Accepted
**Date:** 2026-09-09
**Owner:** zy
**Spec:** `docs/specs/2026-09-09-a-staged-product-not-a-funnel.md`
**Cross-references:** ADR-005, ADR-008, ADR-012, ADR-027, `docs/ONBOARDING.md`, `docs/INSTALL.md`
**Governs:** `plugin/scripts/work-next.mjs`, `plugin/scripts/facts-gate-dispatch.sh`, `plugin/scripts/lifecycle.mjs`, `plugin/scripts/run-shell-hook.mjs`, `plugin/README.md`, `plugin/hooks/hooks.json`, `plugin/bin/adr-lint`, `plugin/scripts/post-edit-check.sh`, `plugin/bin/qh-mcp`, `docs/INSTALL.md`

Enumerated 2026-09-09 with `git ls-files -- plugin/scripts/work-next.mjs plugin/scripts/facts-gate-dispatch.sh plugin/scripts/lifecycle.mjs plugin/scripts/run-shell-hook.mjs plugin/README.md plugin/hooks/hooks.json plugin/bin/adr-lint plugin/scripts/post-edit-check.sh plugin/bin/qh-mcp docs/INSTALL.md`:

```
docs/INSTALL.md
plugin/README.md
plugin/bin/adr-lint
plugin/bin/qh-mcp
plugin/hooks/hooks.json
plugin/scripts/facts-gate-dispatch.sh
plugin/scripts/lifecycle.mjs
plugin/scripts/post-edit-check.sh
plugin/scripts/run-shell-hook.mjs
plugin/scripts/work-next.mjs
```

**Enforced-by:** `tests/staged-product.test.mjs::an empty tree is not routed to spec-write`
**Invalidates:** none — checked
**Served-path change:** An adopter with no QH corpus is told to verify or execute the current work; a markdown file that is not a QH record is named not-recognised rather than skipped or called "not a decision record".

## Context

The product that helps is claim verification. The thing that makes adopters bounce is treating that core as inseparable from a QH-shaped ADR corpus. `work-next` printed `Next: /spec-write` on an empty tree, and when nothing was waiting it still told a healthy corpus that new work begins at `/spec-write` or `/adr-write`. The facts gate exited 0 in silence on a miss. The shipped README's first command interpolated `CLAUDE_PLUGIN_ROOT`.

Inherited from `docs/specs/2026-09-09-a-staged-product-not-a-funnel.md` §Problem / §Goal. Three layers stay independently adoptable: Core (file-scoped CLIs), Session (Claude Code hooks), Corpus (route plus spec/ADR skills).

## Existing Primitives Audit

- `plugin/scripts/work-next.mjs` `observe` / `nextStage` / `STAGES` — **reshape.** Keep evidence and retirement preference; stop defaulting empty and leftover to spec-write; namespace skill entries; split the two adr-write because-lines; list specs and tasks via `trackedPaths`.
- `plugin/scripts/lifecycle.mjs` `trackedPaths`, `firstMentionThisSession`, `analyzeTranscript` — **reuse.** Specs and tasks use the existing git listing. PostToolUse debounce uses the existing ledger. Unknown non-Bash `tool_use` becomes UNPROVEN authorship.
- `plugin/scripts/facts-gate-dispatch.sh` `is_adr` and the positive-match arms — **reuse.** F-26: the matcher stays. A miss is named, not skipped.
- `plugin/bin/adr-lint` directory refusal and the no-Status skip — **reshape** the miss vocabulary to not-recognised. Still refuses a directory.
- `plugin/hooks/hooks.json` — **reuse.** Always-on; no switch (F-21).
- `plugin/bin/qh-mcp` — **reuse.** ADR-012 still excludes `adr-verify` and `spec-verify`.
- `plugin/scripts/post-edit-check.sh` — **reuse.** Still runs on unclassified Edit/Write (F-33).

## Decision

**Core is reachable without a corpus. Corpus routing is entered only when a classified record, spec, or QH task is waiting. A miss is a named state.**

1. **Empty tree and leftover.** `nextStage` does not return spec-write for zero records, zero specs, and zero tasks. That case names Core (`verify or execute the current work`) and says no QH corpus is in use. When `nextStage` returns null, the CLI says nothing in the QH corpus is waiting — not that new work begins at spec-write or adr-write. If git cannot list, the look is UNPROVEN, never an empty corpus.
2. **Two adr-write arms.** A Ready-for-ADR spec whose bound IDs no classified record Covers routes to `/quality-harness:adr-write` after evidence and retirement, and before `accepted && !tasks`. That arm prints the Ready-for-ADR because-line. `accepted && !tasks` prints that the records have no tasks. An unreadable spec Status is UNPROVEN, not "not Ready-for-ADR".
3. **Names.** Every skill name `work-next` prints uses `/quality-harness:`. CLI gates stay unprefixed (`adr-verify <task file>`).
4. **Miss vocabulary.** A file that is not a QH record or task is not-recognised or UNPROVEN. Core (`adr-lint FILE`) always names it. PostToolUse names it at most once per file per session via `firstMentionThisSession`. The commit boundary names it again. `is_adr` and the other positive-match arms do not change.
5. **Docs and hooks.** The first shipped README command locates the doctor without `CLAUDE_PLUGIN_ROOT`. INSTALL names a file for `adr-lint`. `hooks.json` stays always-on. No `plugin/CORE.md`. No in-process plugin registry. Unknown non-Bash `tool_use` is UNPROVEN authorship.

## Alternatives Considered

- **Opt-in hooks / a stage switch.** Rejected: F-21. Session Advise still helps trees with no corpus; corpus gates already skip a miss.
- **An in-process plugin registry for later hosts.** Rejected: F-17. A later host is a Session adapter that spawns Core CLIs.
- **Growing `adr-lint` into a directory walker.** Rejected: F-23. Still refuses a directory; docs name a file.
- **A path extractor for every MCP write tool.** Rejected: F-24. Name UNPROVEN until a fixture exists for that name.
- **Keeping spec-write as the empty-tree default.** Rejected: that is the funnel this record exists to stop.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `work-next.mjs` | Corpus router | empty/leftover/namespace/observe listing/two adr-write arms |
| `facts-gate-dispatch.sh` | Session classifier | miss vocabulary; no matcher change |
| `lifecycle.mjs` | Session evidence | UNPROVEN authorship; exported `firstMentionThisSession` |
| `run-shell-hook.mjs` | Session adapter | passes `QUALITY_HARNESS_SESSION_ID` |
| `adr-lint` | Core | not-recognised wording; still refuses a directory |
| `plugin/README.md` / `docs/INSTALL.md` | docs | first command; file-named example |
| `hooks.json` / `qh-mcp` / `post-edit-check.sh` | none | confirmed unchanged |

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `observe().look` / `trackedPaths` listing | T1 | T2 names the same miss vocabulary when git cannot classify | No — additive field |

## Implementation

See `docs/adr/ADR-038-a-staged-product-not-a-funnel/tasks/README.md`.

## Consequences

- **Positive:** An adopter can verify a claim without entering the decision lifecycle. A miss is named. Skill names match the installed plugin.
- **Negative:** Existing tests that treated an empty tree as spec-write, or that called `observe()` on a directory with no git, had to change.
- **Neutral:** spec-write remains a named skill. Hooks stay always-on.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Building a Cursor / Codex / OpenCode adapter in this record (permanent: boundary: F-17 names the seam; the adapter is a later ADR)
- Exposing `adr-verify` or `spec-verify` over MCP (permanent: fact: ADR-012 Accepted excludes gates that execute corpus text; citation: file `docs/adr/ADR-012-the-gates-reach-a-client-with-no-shell.md:1`)
- An in-process plugin registry (permanent: boundary: F-17)
- A `plugin/CORE.md` (permanent: boundary: F-22)
- Growing `adr-lint` into a directory walker (permanent: boundary: F-23)
- Inventing a path extractor for every MCP write tool (permanent: boundary: F-24)
- Widening or shrinking the heading grammar that classifies QH records (permanent: boundary: F-26)
- Making `post-edit-check.sh` corpus-aware (permanent: boundary: F-33)
- An opt-in or off switch for hooks (permanent: boundary: F-21)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Changing the empty-tree default breaks a user who wanted spec-write as the front door | Med | Med | spec-write remains a named skill; only the default Next line changes |
| not-recognised under-blocks a QH record with an odd heading | High | High | F-26: do not widen the matcher; UNPROVEN only when the classifier cannot look |

## Rollback

Revert `work-next.mjs`, `facts-gate-dispatch.sh`, `lifecycle.mjs`, `run-shell-hook.mjs`, `adr-lint` miss wording, and the two doc lines. No persistent state.

## Follow-ups

- [ ]
