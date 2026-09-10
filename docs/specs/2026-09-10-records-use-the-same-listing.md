# Spec: Records use the same listing

> **Date:** 2026-09-10 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-039 (`docs/adr/ADR-039-records-use-the-same-listing.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec docs/specs/2026-09-10-records-use-the-same-listing.md` exits 0.
> **Cross-references:** docs/specs/2026-09-09-a-staged-product-not-a-funnel.md (ADR-038 F-13–F-33, especially F-30/F-31), docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-008-the-plugin-is-not-the-repository.md, plugin/scripts/work-next.mjs, plugin/scripts/lifecycle.mjs

## Problem

ADR-038 F-30/F-31 already take specs and tasks from `trackedPaths`. `observe()` still calls `adrCorpus(directory)` without `{ tracked: listing }`, so a failed `git ls-files` can still inventory records from disk. Could-not-look is then a looked-at corpus (ADR-005).

## Goal

`observe()` uses one listing for records as well as specs and tasks. When git cannot list, that look is UNPROVEN and records are not discovered by `existsSync` / `readdirSync`.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | trust `work-next` when git cannot list: UNPROVEN, not a disk-inventoried corpus |
| `observe()` | system | derive corpus state from one `trackedPaths` listing |
| `adrCorpus` | system | resolve records (and Governs) from the listing the caller already made |

## Use Cases

### UC-1: Observer inventories records from the same listing

- **Trigger:** `observe(directory)` runs, including `work-next` / `--json` · **Preconditions:** `listing = trackedPaths(directory)` has already been taken
- **Main flow:**
  1. Pass `{ tracked: listing }` into `adrCorpus`.
  2. If `listing == null`, set `look === 'UNPROVEN'` and do not walk the disk for records.
  3. Specs and tasks stay on that same listing (ADR-038 F-30/F-31).
- **Failure paths:**
  - a. at step 2, git cannot list but `docs/adr` exists on this machine → still UNPROVEN; `records` / `accepted` are not filled from `existsSync` / `readdirSync`.
- **Postconditions:** one listing, one look. A missing listing is not an empty corpus. When git lists, record files come from that listing (F-2). Leftover product callers use the same rule (F-3).

### UC-2: Leftover product callers use the same listing

- **Trigger:** `adr-state`, `adr-context`, or `decisionsGoverning` with the default corpus · **Preconditions:** none
- **Main flow:**
  1. Take `listing = trackedPaths(root)` and pass `{ tracked: listing }` into `adrCorpus`.
  2. Inventory records from that listing, not `existsSync` / `readdirSync`.
- **Failure paths:**
  - a. git cannot list → UNPROVEN, not a disk corpus and not "no records found".
  - b. a `docs/adr` file exists on disk but is absent from the listing → it is not in the corpus.
- **Postconditions:** leftover callers share observe's listing rule. No shared in-process module with `adr-lint`.

## Scenarios

### UC1-S1 [happy] observe passes the listing into adrCorpus (F-1 Accepted) [@spec] → `tests/staged-product.test.mjs::observe passes the listing into adrCorpus`

```gherkin
Given observe() has taken listing = trackedPaths(directory)
When it builds the record corpus
Then it calls adrCorpus with { tracked: listing }
And it does not ask git for a second listing in that call
```

### UC1-S2 [failure] a failed listing is not a disk corpus of records (F-1 Accepted) [@spec] → `tests/staged-product.test.mjs::a failed listing is not a disk corpus of records`

```gherkin
Given git cannot list the tree
And decision records exist on disk under docs/adr
When observe() runs
Then look is UNPROVEN
And records are not discovered via existsSync or readdirSync
And this is not treated as an empty corpus
```

### UC1-S3 [happy] listed record files are the corpus (F-2 Accepted) [@spec] → `tests/staged-product.test.mjs::disk-only record files are not the corpus`

```gherkin
Given a git repository that can list
And a listed record file under docs/adr
When observe() runs
Then that record is in the corpus
```

### UC1-S4 [failure] a disk-only record file is not the corpus (F-2 Accepted) [@spec] → `tests/staged-product.test.mjs::disk-only record files are not the corpus`

```gherkin
Given a git repository that can list
And a docs/adr record file exists on disk but is absent from trackedPaths
When observe() runs
Then that file is not in the corpus
```

### UC2-S1 [happy] leftover callers inventory listed records (F-3 Accepted) [@spec] → `tests/staged-product.test.mjs::leftover adrCorpus callers use the listing, not the disk`

```gherkin
Given a git repository whose listing includes a record file
When adr-state, adr-context, or decisionsGoverning (default corpus) run
Then they inventory that listed record
```

### UC2-S2 [failure] leftover callers do not treat git-fail as a disk corpus (F-3 Accepted) [@spec] → `tests/staged-product.test.mjs::leftover adrCorpus callers use the listing, not the disk`

```gherkin
Given git cannot list the tree
And decision records exist on disk under docs/adr
When adr-state, adr-context, or decisionsGoverning (default corpus) run
Then the look is UNPROVEN
And records are not discovered from disk
And this is not reported as an empty corpus
```

## Facts

Scouted on `spec/staged-product-not-a-funnel` at `435d49c`. Command (CLAUDE.md §5):

```text
rg -n -C1 'const listing = trackedPaths|const corpus = adrCorpus|function readRecordFiles|if \(existsSync\(docs\)\) walk\(docs|tracked = trackedPaths' plugin/scripts/work-next.mjs plugin/scripts/lifecycle.mjs plugin/scripts/adr-state.mjs plugin/scripts/adr-context.mjs
```

Output (this branch):

```text
plugin/scripts/work-next.mjs:154:  const listing = trackedPaths(directory)
plugin/scripts/work-next.mjs:155:  const look = listing == null ? 'UNPROVEN' : 'ok'
plugin/scripts/work-next.mjs:156:  const corpus = adrCorpus(directory)
plugin/scripts/lifecycle.mjs:2543:  if (existsSync(docs)) walk(docs, 0, false)
plugin/scripts/lifecycle.mjs:2980:function readRecordFiles(root, reader)
plugin/scripts/lifecycle.mjs:2999:  if (existsSync(docs)) walk(docs, 0)
plugin/scripts/lifecycle.mjs:3041:export function adrCorpus(root, { tracked = trackedPaths(root) } = {}) {
plugin/scripts/adr-state.mjs:31:  const corpus = adrCorpus(root)
plugin/scripts/adr-context.mjs:68:  const corpus = adrCorpus(root)
```

F-2 (same branch). Command:

```text
rg -n 'function taskFiles\(|function specFiles|const files = readRecordFiles|function readRecordFiles|\.\.\.\(tracked' plugin/scripts/work-next.mjs plugin/scripts/lifecycle.mjs
```

Output:

```text
plugin/scripts/work-next.mjs:95:function taskFiles(directory, listing) {
plugin/scripts/work-next.mjs:109:function specFiles(directory, listing) {
plugin/scripts/lifecycle.mjs:2980:function readRecordFiles(root, reader) {
plugin/scripts/lifecycle.mjs:3048:  const files = readRecordFiles(root, reader)
plugin/scripts/lifecycle.mjs:3163:        ...(tracked
```
`tracked` on `adrCorpus` is the Governs-unresolved seam; `readRecordFiles` still always disk-walks, including when git listed. Specs and tasks already filter `listing` (`specFiles` / `taskFiles`). `tests/staged-product.test.mjs::could-not-look is UNPROVEN, not an empty corpus` uses a no-git temp directory with no records on disk, so that leftover walk is invisible there.

F-3 (same branch). Command (CLAUDE.md §5 — every product call of `adrCorpus(` / `readRecordFiles(`):

```text
rg -n 'adrCorpus\(|readRecordFiles\(' plugin --glob '!**/node_modules/**' --glob '!**/__pycache__/**'
```

Output:

```text
plugin/scripts/adr-state.mjs:31:  const corpus = adrCorpus(root)
plugin/scripts/work-next.mjs:156:  const corpus = adrCorpus(directory)
plugin/scripts/adr-context.mjs:68:  const corpus = adrCorpus(root)
plugin/scripts/lifecycle.mjs:2980:function readRecordFiles(root, reader) {
plugin/scripts/lifecycle.mjs:3041:export function adrCorpus(root, { tracked = trackedPaths(root) } = {}) {
plugin/scripts/lifecycle.mjs:3048:  const files = readRecordFiles(root, reader)
plugin/scripts/lifecycle.mjs:3201:export function decisionsGoverning(paths, root, corpus = adrCorpus(root)) {
```

Members in for F-3: `adr-state.mjs:31` `adrCorpus(root)`; `adr-context.mjs:68` `adrCorpus(root)`; `decisionsGoverning` default `corpus = adrCorpus(root)` (same function default, not a second walker). `readRecordFiles` is only called from `adrCorpus` — not a separate inventory. `work-next.mjs:156` is F-1, not this fact. No other product call under `plugin/`.

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Current: `observe()` already holds `listing = trackedPaths(directory)` and sets `look` from it (ADR-038 F-30/F-31). It then calls `adrCorpus(directory)` with no `{ tracked: listing }`. `adrCorpus` defaults `tracked = trackedPaths(root)` and always `readRecordFiles` (`existsSync(docs)` then `readdirSync`). When git cannot list, `look === 'UNPROVEN'` but `records` / `accepted` (and `--json`) can still come from that disk walk. After: `observe()` passes `{ tracked: listing }` into `adrCorpus` and does not disk-walk records when git could not list. A missing listing is not an empty corpus. Passing the option object is not enough if `readRecordFiles` still walks. This spec does not reverse ADR-038 F-13–F-33. | `tests/staged-product.test.mjs::a failed listing is not a disk corpus of records` | @spec | |
| F-2 | Accepted. Current: when git lists, `adrCorpus` still takes record files from `readRecordFiles` (`const files = readRecordFiles(root, reader)`). That walker does `existsSync(docs)` then `walk` via `reader.entries`, and if none, walks `root`. The `tracked` option is only the Governs-unresolved seam; it does not choose which record files exist. Specs and tasks already come from the listing (`specFiles` / `taskFiles`; ADR-038 F-30/F-31). After: when git lists successfully, record files also come from that listing. Disk-only `docs/adr` files are not the corpus. This spec does not reverse F-1 or ADR-038 F-13–F-33. | `tests/staged-product.test.mjs::disk-only record files are not the corpus` | @spec | |
| F-3 | Accepted. Current: product callers of `adrCorpus(` without `{ tracked: listing }` are `adr-state.mjs` (`adrCorpus(root)`), `adr-context.mjs` (`adrCorpus(root)`), and `decisionsGoverning`'s default `corpus = adrCorpus(root)` — the same function default, not a second walker. `readRecordFiles` is only called from `adrCorpus`, so it is not a separate inventory. `observe()` is F-1, not this fact. After: leftover product callers (`adr-state.mjs`, `adr-context.mjs`, `decisionsGoverning` default) use the same listing rule as `observe` (pass tracked listing; git fail = UNPROVEN, not a disk walk; disk-only files are not the corpus). After does not force a shared in-process module with `adr-lint`. Why it can fail: a green `observe` / F-1 / F-2 test leaves these callers reporting a disk corpus, or no records, when git could not list. This spec does not reverse F-1, F-2, or ADR-038 F-13–F-33. | `tests/staged-product.test.mjs::leftover adrCorpus callers use the listing, not the disk` | @spec | |

## Domain

**Listing** = `trackedPaths` (`git ls-files` plus `--others --exclude-standard`), or `null` when git cannot answer. **Look** = `ok` or `UNPROVEN` from that listing. **Record inventory** must share that listing; it is not a second filesystem walk. Ubiquitous language already decided: could-not-look ≠ empty corpus (ADR-005); disk existence ≠ tracked (ADR-008).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `plugin/scripts/work-next.mjs` `observe()` | pass `{ tracked: listing }` into `adrCorpus`; no disk record inventory when `listing == null` | `/quality-harness:work`, `work-next --json`, tests importing `observe` |
| `plugin/scripts/lifecycle.mjs` `adrCorpus` / `readRecordFiles` | only as required so a null listing is not a disk corpus of records; when git lists, record files come from that listing (F-2 Accepted) | `observe()` (F-1); leftover callers (F-3 Accepted) |
| `plugin/scripts/adr-state.mjs` | same listing rule as `observe` (F-3 Accepted) | `adr-state` CLI |
| `plugin/scripts/adr-context.mjs` | same listing rule as `observe` (F-3 Accepted) | `adr-context` CLI |
| `plugin/scripts/lifecycle.mjs` `decisionsGoverning` default | same listing rule as `observe` when the caller omits corpus (F-3 Accepted); same function default, not a second walker | product callers that omit the corpus argument |

## Non-Goals

- Untangle `lifecycle.mjs`.
- Unify Python and JS Governs readers.
- A shared in-process module with `adr-lint`.
- Unify `work-next` vs `adr-next` vs SessionStart ready (`readyTaskLines` / `taskDirectories`).
- An event ledger.
- Statusline `layer` / UNPROVEN-as-Advise (a different later spec).
- Cursor / OpenCode host adapter.
- A 15th skill, `CORE.md`, MCP verify, or hook opt-in.
- Reverse ADR-038 F-13–F-33.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A UNPROVEN fixture with no records on disk stays green while the disk walk remains | High | High | Bind F-1 on a tree git cannot list that still has `docs/adr` on disk |
| Passing `{ tracked: listing }` alone leaves `readRecordFiles` walking | High | High | F-1 requires no disk record inventory when listing is null, not only the option object |
| A git-ok fixture never plants a disk-only record, so `readRecordFiles` stays the success-path walker | High | High | Bind F-2 on a tree git can list that still has a `docs/adr` file absent from the listing |
| Leftover product `adrCorpus(root)` callers stay a disk corpus after observe is fixed | High | High | F-3 Accepted: `adr-state`, `adr-context`, and the `decisionsGoverning` default use observe's listing rule |

## Open Questions

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-10-records-use-the-same-listing.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | observe() leftover: pass `{ tracked: listing }` and refuse a disk walk of records when git could not list? | F-1 | accepted — observe() passes `{ tracked: listing }`; no disk walk of records when git could not list; missing listing is not an empty corpus; option object alone is not enough if readRecordFiles still walks |
| 2 | when git lists, do record files come from that listing (disk-only docs/adr excluded, F-30/F-31 sibling for records)? | F-2 | accepted — when git lists successfully, record files also come from that listing; disk-only `docs/adr` files are not the corpus; does not reverse F-1 or ADR-038 |
| 3 | leftover product `adrCorpus(root)` callers: same listing rule as observe, without a shared in-process module with adr-lint? | F-3 | accepted — leftover product callers (adr-state.mjs, adr-context.mjs, decisionsGoverning default) use the same listing rule as observe (pass tracked listing; git fail = UNPROVEN, not a disk walk; disk-only files are not the corpus); no shared in-process module with adr-lint; does not reverse F-1, F-2, or ADR-038 |
