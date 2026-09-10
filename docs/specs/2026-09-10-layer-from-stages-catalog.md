# Spec: Name Core and Corpus from the STAGES catalog

> **Date:** 2026-09-10 · **Status:** Grilling
> **Owner:** zy · **Becomes:** ADR (unassigned)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** docs/specs/2026-09-10-statusline-layer-unproven-as-advise.md (leftover: layer; Goal is UNPROVEN-write Advise, shipped as ADR-042), docs/specs/2026-09-09-a-staged-product-not-a-funnel.md, docs/adr/ADR-038-a-staged-product-not-a-funnel.md, docs/adr/ADR-039-records-use-the-same-listing.md, docs/adr/ADR-040-sessionstart-ready-uses-the-listing.md, docs/adr/ADR-041-a-probe-prefix-is-not-the-mutation.md, docs/adr/ADR-042-unproven-write-is-advise.md, plugin/scripts/work-next.mjs (`STAGES`, `nextStage`, `--json`), plugin/scripts/statusline.mjs (`render`), plugin/hooks/hooks.json, plugin/README.md (status line)

## Problem

ADR-038's product layers are Core, Session, and Corpus. `work-next --json` already dumps `look` and `next` (`id` / `entry` / `when`) plus the `STAGES` catalog, and does not name which product layer a consumer is in. Session is Claude Code hooks, not a `work-next` stage. A path classifier (bin vs hooks vs docs) would fail open the same way §16 forbids. The plugin cannot set Claude's `statusLine`. ADR-042 shipped UNPROVEN-write Advise and explicitly left `layer` out.

## Goal

`work-next --json` names the product layer as `core` or `corpus` from a closed table over `STAGES` ids. Session stays hooks. QH does not set Claude's bar.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | see whether the router is in Core or Corpus without guessing from a path or from `next.id` as Session |
| `work-next --json` consumer | system | read a `layer` that is exactly `core` or `corpus`, or absent when the look is UNPROVEN |
| `statusline.mjs` | system | keep the session check/CI segment; this fact does not add a layer token |
| Session hooks | system | remain always-on Advise (ADR-038 F-21); not a `STAGES` id |

## Use Cases

### UC-1: A `--json` consumer reads Core or Corpus from the STAGES table

- **Trigger:** `node plugin/scripts/work-next.mjs --json` (working-tree path) · **Preconditions:** the CLI can run; git listing is whatever `observe()` returns
- **Main flow:**
  1. Observe the tree. Dump `--json` as today (`look`, `next`, `stages`, …).
  2. Set top-level `layer` from a closed table over `STAGES` ids: `core` → `core`; every other catalog id → `corpus`.
  3. When `next` is non-null, `layer` is that table applied to `next.id`. When `next` is null and `look` is ok, `layer` is `corpus` (leftover observed a QH corpus, not Core).
- **Failure paths:**
  - a. at step 1, `look` is UNPROVEN → `layer` is absent; could-not-look is not a layer and not Core.
  - b. at step 2, a consumer treats `next.id` as Session, or classifies a path as Core/Session/Corpus → forbidden; Session is not a `STAGES` id and never `next.id`.
  - c. at preconditions, the user has not wired `statusLine` → QH still does not set Claude's bar; this fact does not add a layer token to `render()`.
- **Postconditions:** `layer` is `core` or `corpus` when the look is ok. `layer` is never `session`. Empty tree still names Core, not spec-write (ADR-038). No host `statusLine` install.

## Scenarios

### UC1-S1 [happy] an empty tree --json names layer core from next.id core [@draft] → `— to bind`

```gherkin
Given a git repo with no classified QH records, specs, or task files
When work-next --json runs on that tree
Then look is ok
And next.id is core
And layer is core
And next.id is not session and not spec-write
```

### UC1-S2 [failure] a non-core STAGES id is corpus, never session [@draft] → `— to bind`

```gherkin
Given the STAGES catalog ids adr-verify, adr-execute, adr-retire, arch-write, adr-write, adr-write-no-tasks, spec-write
When work-next --json has next.id equal to any of those ids, or next is null with look ok
Then layer is corpus
And layer is not session
And session is not a STAGES id and is never next.id
```

### UC1-S3 [failure] UNPROVEN look does not name a layer [@draft] → `— to bind`

```gherkin
Given observe cannot list the tree (look UNPROVEN)
When work-next --json runs
Then next is null
And the object has no layer key
And this is not Core and not an empty corpus
```

### UC1-S4 [failure] the wired statusline segment does not grow a layer token [@draft] → `— to bind`

```gherkin
Given statusline.mjs render() and plugin/hooks/hooks.json
When the user-wired segment renders, or hooks.json is read
Then render() still emits only the session check/CI kinds
And hooks.json has no statusLine
And this fact does not claim QH set Claude's bar
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Proposed. Current: STAGES ids executed 2026-09-10 from plugin/scripts/work-next.mjs: adr-verify, adr-execute, adr-retire, arch-write, adr-write, adr-write-no-tasks, core, spec-write. No session id. No corpus id. nextStage returns adr-verify, adr-execute, adr-retire, adr-write, adr-write-no-tasks, core, or null; never spec-write, never arch-write, never session. node plugin/scripts/work-next.mjs --json on this corpus: look ok, next.id adr-execute, next keys id/entry/when, no layer; stages catalog the eight ids above, no session. statusline.mjs render() emits QH checked / unverified / nothing edited / too-large plus optional CI; no layer token. plugin/hooks/hooks.json has no statusLine. plugin/README.md: the plugin cannot set statusLine. After: work-next --json adds a top-level layer whose value is exactly core or corpus, from a closed table over STAGES ids (core → core; every other catalog id → corpus). When next is non-null, layer is that table applied to next.id. When next is null and look is ok, layer is corpus. When look is UNPROVEN, layer is absent. layer is never session. Session is hooks, not a work-next stage. This fact does not add a layer token to statusline.mjs render(). Plugin does not set Claude's statusLine. Does not reverse ADR-038–042. No peel-cat, no event ledger, no hook opt-in. Why it can fail: treating next.id as Session; a path classifier; emitting layer on UNPROVEN look; putting Core/Corpus on the statusline (session-check clock); claiming QH installed the bar; routing an empty tree to spec-write. | `— to bind` | @draft | |

## Domain

**layer** = product layer `core` or `corpus` on `work-next --json`, from a closed table over `STAGES` ids — not a path, not Session. **Session** = Claude Code hooks (`hooks.json`), independently adoptable (ADR-038); never `next.id`. **Core** = `next.id === core` (no QH corpus in use). **Corpus** = every other `STAGES` id, and leftover `next` null with `look` ok. Ubiquitous language already decided: could-not-look ≠ empty (ADR-005); not-recognised ≠ not-a-record; UNPROVEN ≠ no mutation (F-24 / ADR-042).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `plugin/scripts/work-next.mjs --json` | add top-level `layer` (`core` / `corpus`, or absent on UNPROVEN look) | `/quality-harness:work`, humans, scripts |
| `plugin/scripts/statusline.mjs` `render()` | none in this fact | the user's `statusLine` command |
| `plugin/hooks/hooks.json` | none (no `statusLine`; F-21 stands) | every Claude Code session with the plugin enabled |

## Non-Goals

- QH setting Claude Code's `statusLine` (the plugin cannot set the bar; README already says so).
- A layer token on the user-wired statusline segment (Session check/CI stays ADR-042; mixing that clock into this Goal would be a second fact).
- Adding `session` as a `STAGES` id, or claiming `next.id` is Session.
- A path classifier (plugin/bin vs hooks vs docs) as the layer.
- Peel `cat` / `pwd` / `git status` / unknown `neither` (CLAUDE.md §16; ADR-041 left those unpeeled).
- An event ledger (ADR-020 abandoned; watch with `work-next --json`).
- A hook opt-in switch (`hooks.json` stays always-on; ADR-038 F-21).
- Reverse ADR-038–042 (empty tree still Core not spec-write; listing rules; probe prefix; UNPROVEN-write Advise).
- UNPROVEN-write Advise (already ADR-042).
- Cursor / OpenCode host adapter; MCP verify; inventing `arch-write` / `spec-write` as live `nextStage` returns.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| `next.id` is documented or rendered as Session | High | High | F-1: Session is not a STAGES id; layer is never session |
| Layer is inferred from a path | High | High | Closed table over STAGES ids only |
| UNPROVEN look emits core or corpus | High | High | layer absent when look is UNPROVEN |
| A green `--json` test is treated as wiring Claude's bar | High | High | Non-goal: QH does not set statusLine; hooks.json has no statusLine |
| Statusline grows Core/Corpus and lies about the session-check clock | Med | High | This fact does not change render(); leftover statusline token is a later grill |
| Catalog-only spec-write / arch-write are treated as Session because nextStage never returns them | Med | Med | Table covers every STAGES id, including those nextStage never returns |

## Open Questions

<!-- Empty until the user rejects or amends F-1. F-1 is the in-progress grill. -->

## Verify

```bash
python3 plugin/bin/spec-verify --draft docs/specs/2026-09-10-layer-from-stages-catalog.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Current / after / why it can fail: `work-next --json` names Core/Session/Corpus as `layer` from a closed table over STAGES ids (not a path); Session is hooks not `next.id`; plugin cannot set the host statusLine; no peel-cat, no ledger, no hook opt-in; do not reverse ADR-038–042? | F-1 | proposed (recommended: accept — `--json` only, `core` or `corpus`, never `session`; statusline token out of this fact) — awaiting accept/amend/reject |
