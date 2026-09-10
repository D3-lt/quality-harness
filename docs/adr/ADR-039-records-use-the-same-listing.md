# ADR-039: Records use the same listing

**Status:** Accepted
**Date:** 2026-09-10
**Owner:** zy
**Spec:** `docs/specs/2026-09-10-records-use-the-same-listing.md`
**Cross-references:** ADR-005, ADR-008, ADR-011, ADR-038, `docs/specs/2026-09-09-a-staged-product-not-a-funnel.md`
**Governs:** `plugin/scripts/work-next.mjs`, `plugin/scripts/lifecycle.mjs`, `plugin/scripts/adr-state.mjs`, `plugin/scripts/adr-context.mjs`

Class: every product caller that inventories decision records through `adrCorpus`. Enumerated 2026-09-10 with `rg -n 'adrCorpus\(|readRecordFiles\(' plugin --glob '!**/node_modules/**'` and `git ls-files -- plugin/scripts/work-next.mjs plugin/scripts/lifecycle.mjs plugin/scripts/adr-state.mjs plugin/scripts/adr-context.mjs`:

```
plugin/scripts/lifecycle.mjs:2990:function readRecordFiles(root, reader) {
plugin/scripts/lifecycle.mjs:3067:export function adrCorpus(root, { tracked = trackedPaths(root) } = {}) {
plugin/scripts/lifecycle.mjs:3224:export function decisionsGoverning(paths, root, corpus = adrCorpus(root)) {
plugin/scripts/adr-state.mjs:32:  const corpus = adrCorpus(root, { tracked: listing })
plugin/scripts/work-next.mjs:156:  const corpus = adrCorpus(directory, { tracked: listing })
plugin/scripts/adr-context.mjs:69:  const corpus = adrCorpus(root, { tracked: listing })
```

```
plugin/scripts/adr-context.mjs
plugin/scripts/adr-state.mjs
plugin/scripts/lifecycle.mjs
plugin/scripts/work-next.mjs
```

Members in: `observe()` (F-1), `adrCorpus` file inventory (F-2), leftover callers `adr-state.mjs`, `adr-context.mjs`, and `decisionsGoverning`'s default (F-3). Members left out: `plugin/bin/adr-lint` (Python Governs reader — a shared in-process module is a Non-Goal); unused `readRecordFiles` (untangle `lifecycle.mjs` is a Non-Goal). `plugin/` has no other `adrCorpus(` call.

**Enforced-by:** `tests/staged-product.test.mjs::a failed listing is not a disk corpus of records`, `tests/staged-product.test.mjs::disk-only record files are not the corpus`, `tests/staged-product.test.mjs::leftover adrCorpus callers use the listing, not the disk`
**Invalidates:** none — checked (extends ADR-038 F-30/F-31 to records; does not reverse F-13–F-33)
**Served-path change:** `work-next`, `adr-state`, and `adr-context` report UNPROVEN when git cannot list, and they do not treat a disk-only `docs/adr` file as a record.

## Context

Inherited from `docs/specs/2026-09-10-records-use-the-same-listing.md` §Problem / §Goal. ADR-038 already takes specs and tasks from `trackedPaths`. Record inventory still walked the disk, so a failed listing could still look like a corpus (ADR-005) and a gitignored record file could still govern (ADR-008).

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this leftover disk walk. Not pulled in.

## Existing Primitives Audit

- `plugin/scripts/lifecycle.mjs` `trackedPaths` — **reuse.** Same listing ADR-038 F-30/F-31 already uses for specs and tasks.
- `plugin/scripts/lifecycle.mjs` `adrCorpus` — **reshape.** Inventory record files from that listing; `tracked == null` is could-not-look (no disk walk, no Governs resolution).
- `plugin/scripts/work-next.mjs` `observe` — **reshape.** Pass `{ tracked: listing }` into `adrCorpus`.
- `plugin/scripts/adr-state.mjs` / `adr-context.mjs` — **reshape.** Same listing rule; UNPROVEN is not "No decision records found".
- `plugin/scripts/lifecycle.mjs` `decisionsGoverning` default — **reuse** the same `adrCorpus` default (not a second walker).
- `plugin/bin/adr-lint` — **leave.** No shared in-process module.

## Decision

**Record inventory answers from the same git listing as specs and tasks. A missing listing is UNPROVEN, not an empty corpus and not a disk walk.**

1. `observe()` already holds `listing = trackedPaths(directory)`. It passes `{ tracked: listing }` into `adrCorpus` and does not take a second listing in that call.
2. When `listing == null`, `adrCorpus` attaches `look: 'UNPROVEN'` and returns without `existsSync` / `readdirSync`. That is not zero records.
3. When git lists, record files come from that listing. A `docs/adr` file on disk and absent from the listing is not in the corpus.
4. `adr-state`, `adr-context`, and `decisionsGoverning` with the default corpus use that same rule. They do not share an in-process module with `adr-lint`.

## Alternatives Considered

- **Leave leftover callers on disk until a later ADR.** Rejected: F-3. A green observe test would leave `adr-state` reporting a disk corpus when git could not list.
- **A shared in-process module with `adr-lint`.** Rejected: F-3 Non-Goal. Python and JS Governs readers stay separate.
- **Keep `tracked: null` as "read disk, skip Governs".** Rejected: that is the ADR-005 hole this record closes. null means could not look.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `work-next.mjs` `observe` | Corpus router | pass the listing into `adrCorpus` |
| `lifecycle.mjs` `adrCorpus` | Session/corpus reader | listing inventory; null is UNPROVEN |
| `adr-state.mjs` / `adr-context.mjs` | Core CLIs | leftover callers of the same rule |
| `decisionsGoverning` default | same reader | not a second walker |

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `adrCorpus(..., { tracked })` listing inventory | T1 | T2 leftover callers | No — same function |

## Implementation

See `docs/adr/ADR-039-records-use-the-same-listing/tasks/README.md`.

## Consequences

- **Positive:** Could-not-list is UNPROVEN for records, the way it already is for specs and tasks. Disk-only records do not govern.
- **Negative:** Fixtures that called `adrCorpus` with no git, or that injected a Governs-only fake listing, see an empty or UNPROVEN corpus until they list the record paths.
- **Neutral:** Unused `readRecordFiles` stays in `lifecycle.mjs`.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Untangle `lifecycle.mjs`, including deleting unused `readRecordFiles` (permanent: boundary: a Non-Goal of this spec)
- Unify Python and JS Governs readers, or a shared in-process module with `adr-lint` (permanent: boundary: F-3)
- Unify `work-next` vs `adr-next` vs SessionStart ready (permanent: boundary: sibling spec / Non-Goal)
- An event ledger, statusline `layer`, host adapter, 15th skill, `CORE.md`, MCP verify, or hook opt-in (permanent: boundary: Non-Goals of this spec)
- Reverse ADR-038 F-13–F-33 (permanent: boundary: this record extends F-30/F-31 to records)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A UNPROVEN fixture with no records on disk stays green while the disk walk remains | High | High | F-1 binds on a tree git cannot list that still has `docs/adr` on disk |
| Passing `{ tracked: listing }` alone leaves a disk walk | High | High | null listing returns before inventory |
| Leftover `adrCorpus(root)` callers stay a disk corpus | High | High | F-3 binds `adr-state`, `adr-context`, and the default corpus |

## Rollback

Revert `work-next.mjs` `observe`, `lifecycle.mjs` `adrCorpus` inventory, `adr-state.mjs`, and `adr-context.mjs`. No persistent state.

## Follow-ups

- [ ]
