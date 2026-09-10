# ADR-040: SessionStart ready uses the listing

**Status:** Accepted
**Date:** 2026-09-10
**Owner:** zy
**Spec:** `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md`
**Cross-references:** ADR-005, ADR-008, ADR-038, ADR-039, `docs/specs/2026-09-10-records-use-the-same-listing.md`
**Governs:** `plugin/scripts/lifecycle.mjs`

Class: SessionStart surfaces that inventory ready task directories or corpus existence. Enumerated 2026-09-10 with `rg -n 'function taskDirectories\(|function readyTaskLines\(|function hasDecisionCorpus|sessionOrientation\(|sessionStateNote\(' plugin/scripts/lifecycle.mjs` and `git ls-files -- plugin/scripts/lifecycle.mjs`:

```
2537:function taskDirectories(root, listing) {
2656:function readyTaskLines(root, insideRepository, listing) {
3300:export function sessionStateNote(...)
3684:export function hasDecisionCorpus(root, listing = trackedPaths(root)) {
3695:export function sessionOrientation(cwd) {
3842:    const orientation = sessionOrientation(input.cwd)
3887:      const note = sessionStateNote(state, cwd, root, repositoryRoot !== null)
3902:    const note = sessionStateNote(state, cwd, root, false, new Date(), { tasks: false })
```

```
plugin/scripts/lifecycle.mjs
```

Members in: `taskDirectories`, `readyTaskLines`, `sessionOrientation`, `sessionStateNote` (F-1); `hasDecisionCorpus` and its only product caller `sessionOrientation` (F-2). Members left out: `work-next.mjs` `taskFiles` / `observe` (ADR-038 / ADR-039); `plugin/bin/adr-next` (this spec does not unify with it); `existsSync` of shipped `plugin/bin/adr-next` (tool presence, not a corpus gate).

**Enforced-by:** `tests/lifecycle.test.mjs::a disk-only task dir is not in flight`, `tests/lifecycle.test.mjs::a disk-only corpus dir is not a corpus`, `tests/lifecycle.test.mjs::git cannot list is UNPROVEN, not no ready tasks`, `tests/lifecycle.test.mjs::git cannot list is UNPROVEN, not no corpus`
**Invalidates:** none — checked (does not reverse ADR-038 F-13–F-33; does not change `work-next` `taskFiles`)
**Served-path change:** SessionStart `additionalContext` offers ADR tasks in flight only from listed task dirs, and does not open the shadow-install notice on a disk-only corpus dir; git-fail is named UNPROVEN.

## Context

Inherited from `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md` §Problem / §Goal. ADR-038 F-31 already takes `work-next` task files from `trackedPaths`. SessionStart still walked `taskDirectories` on disk and `hasDecisionCorpus` still `statSync`'d five directory names.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this SessionStart walk. Not pulled in.

## Existing Primitives Audit

- `plugin/scripts/lifecycle.mjs` `trackedPaths` — **reuse.** Same listing as ADR-038 F-30/F-31 and ADR-039.
- `taskDirectories` / `readyTaskLines` — **reshape.** Inventory task dirs from the listing; git-fail is UNPROVEN at the caller.
- `sessionOrientation` / `sessionStateNote` — **reshape.** Both take that listing; not-a-repo stays no ADR reading.
- `hasDecisionCorpus` — **reshape.** Prefix match on the listing (`docs/adr`, `docs/specs`, `docs/decisions`, `adr`, `specs`); null is `'UNPROVEN'`, not false.
- `work-next.mjs` `taskFiles` / `observe` — **leave.** This record does not unify with them.
- `plugin/bin/adr-next` — **leave.** Still the per-directory readiness gate; SessionStart chooses which directories to ask.

## Decision

**SessionStart inventories ready task directories and corpus existence from the git listing. Disk-only is not ready and not a corpus. Git-fail is UNPROVEN, not none.**

1. Inside a repository, take `listing = trackedPaths(root)` once. Not-a-repository does not list and does not read ADRs.
2. `taskDirectories(root, listing)` derives directories from listing paths that contain a `tasks` segment. It does not `existsSync(docs)` then `readdirSync`.
3. `readyTaskLines` returns `{ look, lines }`. Listing null inside a repo is `{ look: 'UNPROVEN', lines: [] }`, which SessionStart names. Omitting the ready section is not enough.
4. `hasDecisionCorpus(root, listing)` returns `'UNPROVEN' | true | false` from that listing, not `statSync`. A disk-only corpus dir does not open the shadow-install notice. Listing-null is UNPROVEN, not false (a false would skip the notice).
5. This record does not call `work-next` `taskFiles` / `observe`, and does not change `adr-next`.

## Alternatives Considered

- **Reuse `work-next` `taskFiles` / `observe` for SessionStart ready.** Rejected: F-1. SessionStart ready is not corpus routing; unifying them is a Non-Goal.
- **Treat listing-null as no ready tasks / no corpus.** Rejected: ADR-005. A false skips the shadow-install notice and reads as "nothing in flight".
- **Keep `statSync` for corpus existence because the notice is advisory.** Rejected: F-2. Disk existence is still "is this on this machine" (ADR-008).

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `lifecycle.mjs` `taskDirectories` / `readyTaskLines` | Session | listing inventory; UNPROVEN look |
| `sessionOrientation` | SessionStart | names UNPROVEN; uses listing for ready and corpus |
| `sessionStateNote` | PreCompact / compact SessionStart | same ready inventory |
| `hasDecisionCorpus` | SessionStart shadow-install gate | listing, not `statSync` |

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| listing-shaped `{ look, lines }` from `readyTaskLines` | T1 | T2 shares the same listing in `sessionOrientation` | No — additive look field |

## Implementation

See `docs/adr/ADR-040-sessionstart-ready-uses-the-listing/tasks/README.md`.

## Consequences

- **Positive:** A gitignored tasks dir is not in flight. A gitignored `docs/adr` does not open the shadow-install notice. Git-fail is named.
- **Negative:** SessionStart that previously offered an untracked-not-ignored tasks dir still does (`--others --exclude-standard`); only gitignored / unlisted dirs drop out.
- **Neutral:** `adr-next` is still spawned per listed tasks directory.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Unify SessionStart ready with `work-next` `taskFiles` / `observe` or with `adr-next` (permanent: boundary: F-1)
- Reverse ADR-038 F-13–F-33 (permanent: boundary: this record extends F-31 to SessionStart)
- The `observe` / `adrCorpus` record walk (permanent: boundary: ADR-039 owns that class)
- Statusline `layer`, an event ledger, host adapter (permanent: boundary: Non-Goals of this spec)
- Unify Python and JS Governs readers, or untangle `lifecycle.mjs` (permanent: boundary: Non-Goals)
- Change not-a-repository behaviour (permanent: boundary: F-1; existing test)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A green F-31 / work-next test leaves SessionStart walking disk | High | High | Bind on `sessionOrientation`, not `observe` |
| Untracked-not-ignored files still appear via `--others` | High | High | Disk-only fixtures are gitignored |
| A not-a-repo fixture is treated as git-fail | High | High | Git-fail requires rev-parse success and `trackedPaths` null |
| Listing-null as false hides the shadow-install notice | High | High | `hasDecisionCorpus` returns `'UNPROVEN'` |

## Rollback

Revert the SessionStart listing inventory in `lifecycle.mjs` (`taskDirectories`, `readyTaskLines`, `hasDecisionCorpus`, `sessionOrientation`, `sessionStateNote`). No persistent state.

## Follow-ups

- [ ]
