# ADR-043: Name Core and Corpus from the STAGES catalog

**Status:** Accepted
**Date:** 2026-09-10
**Owner:** zy
**Spec:** `docs/specs/2026-09-10-layer-from-stages-catalog.md`
**Cross-references:** ADR-038, ADR-039, ADR-040, ADR-041, ADR-042, `docs/specs/2026-09-10-layer-from-stages-catalog.md`, `plugin/scripts/work-next.mjs`

**Governs:** `plugin/scripts/work-next.mjs`, `plugin/scripts/statusline.mjs`, `plugin/hooks/hooks.json`, `tests/staged-product.test.mjs`

Class: `--json` product layer from `STAGES` ids, not a path, not Session. Enumerated 2026-09-10 with `git ls-files -- plugin/scripts/work-next.mjs tests/staged-product.test.mjs plugin/scripts/statusline.mjs plugin/hooks/hooks.json`:

```
plugin/hooks/hooks.json
plugin/scripts/statusline.mjs
plugin/scripts/work-next.mjs
tests/staged-product.test.mjs
```

Members in: `STAGES`, `nextStage`, `observe().look`, the `--json` dump. Members left out: human leftover `STAGES` dump (not `--json`); `plugin/bin/qh-mcp` (no work-next); statusline `render()` layer token (third leftover); `hooks.json` `statusLine` (QH does not set the bar).


**Enforced-by:** `tests/staged-product.test.mjs::layer from STAGES: empty tree --json is core`, `tests/staged-product.test.mjs::layer from STAGES: catalog ids are corpus never session`, `tests/staged-product.test.mjs::layer from STAGES: UNPROVEN look has no layer key`, `tests/staged-product.test.mjs::layer from STAGES: leftover next null is corpus`, `tests/statusline.test.mjs::the wired statusline segment does not grow a layer token`
**Invalidates:** none — checked (does not reverse ADR-038–042; ADR-042 left `--json` `layer` as leftover of that record's F-1, not a forever prohibition)
**Served-path change:** `work-next --json` names `layer` as `core` or `corpus`, or omits the key when look is UNPROVEN.


## Context

Inherited from `docs/specs/2026-09-10-layer-from-stages-catalog.md` §Problem / §Goal. Executed 2026-09-10: `STAGES` ids adr-verify, adr-execute, adr-retire, arch-write, adr-write, adr-write-no-tasks, core, spec-write. No session. `nextStage` returns adr-verify, adr-execute, adr-retire, adr-write, adr-write-no-tasks, core, or null. `--json` has no `layer`. ADR-042 shipped UNPROVEN-write Advise and left this field out.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows is this `--json` layer wiring. ADR-030's deferred host `statusLine` is the field this spec refuses to claim; not pulled in.

## Existing Primitives Audit

- `STAGES` / `nextStage` / `observe().look` — **reuse.** Closed catalog; empty tree still Core; UNPROVEN look still not spec-write.
- `work-next --json` dump — **reshape.** Add top-level `layer`.
- `statusline.mjs` `render()` — **leave.** No layer token.
- `hooks.json` — **leave.** No `statusLine`.

## Decision

**`work-next --json` names the product layer from a closed table over `STAGES` ids. The value is `core` or `corpus`, never `session`. Could-not-look is not a layer.**

1. Table: `core` → `core`; every other catalog id → `corpus`.
2. `next` non-null → table(`next.id`). `next` null and `look` ok → `corpus`. `look` UNPROVEN → no `layer` key.
3. Session stays hooks, not a `STAGES` id and never `next.id`. Empty tree still names Core, not spec-write (ADR-038).
4. This record does not add a layer token to `render()`, does not set Claude's `statusLine`, and does not reverse ADR-038–042.

## Alternatives Considered

- **Path classifier (bin vs hooks vs docs).** Rejected: CLAUDE.md §16; fails open.
- **`layer: session` when hooks are the story.** Rejected: Session is not a `STAGES` id; `next.id` is never session.
- **Emit `layer` on UNPROVEN look as core.** Rejected: could-not-look is not Core (ADR-005).
- **Put Core/Corpus on the statusline.** Rejected: that clock is session check/CI; leftover, not this Goal.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|----------|------------------------|----------------|
| `work-next.mjs --json` | Corpus router | names Core or Corpus |
| `statusline.mjs` `render()` | user-wired segment | none; invariant that it does not grow a layer token |
| `hooks.json` | Session | none; still no `statusLine` |


## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

None.

## Implementation

See `docs/adr/ADR-043-layer-from-stages-catalog/tasks/README.md`.

## Consequences

- **Positive:** a `--json` consumer can read Core vs Corpus without treating `next.id` as Session or classifying a path.
- **Negative:** catalog-only ids (`spec-write`, `arch-write`) that `nextStage` never returns still have a table answer, which a CLI dump will not currently exhibit as `next.id`.
- **Neutral:** UNPROVEN look still prints could-not-look; `--json` simply omits `layer`.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- QH setting Claude Code's `statusLine` (permanent: fact: the plugin cannot set that host field; citation: file `plugin/README.md:29`)
- A layer token on the user-wired statusline segment (permanent: boundary: leftover grill; session check/CI stays ADR-042)
- Adding `session` as a `STAGES` id, or claiming `next.id` is Session (permanent: boundary: Session is hooks)
- A path classifier as the layer (permanent: boundary: CLAUDE.md §16)
- Peel `cat` / `pwd` / `git status` / unknown `neither` (permanent: boundary: CLAUDE.md §16; ADR-041 left those unpeeled)
- Event ledger / ADR-035 `claims.jsonl` (permanent: boundary: ADR-020 abandoned; watch with `work-next --json`)
- Hook opt-in (permanent: boundary: ADR-038 F-21 always-on)
- Reverse ADR-038–042 (permanent: boundary: empty tree still Core; listing, probe prefix, UNPROVEN-write Advise stand)
- UNPROVEN-write Advise (permanent: boundary: already ADR-042)
- Cursor / OpenCode host adapter; MCP verify; inventing `arch-write` / `spec-write` as live `nextStage` returns (permanent: boundary: Non-Goal)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `next.id` is documented or rendered as Session | High | High | F-1: Session is not a STAGES id; layer is never session |
| Layer is inferred from a path | High | High | Closed table over STAGES ids only |
| UNPROVEN look emits core or corpus | High | High | layer absent when look is UNPROVEN |
| A green `--json` test is treated as wiring Claude's bar | High | High | hooks.json has no statusLine; render() has no layer token |

## Rollback

Revert the `layer` field on `--json`. No persistent state.

## Follow-ups

- [ ]
