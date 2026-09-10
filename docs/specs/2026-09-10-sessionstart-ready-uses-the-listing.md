# Spec: SessionStart ready uses the listing

> **Date:** 2026-09-10 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-040 (`docs/adr/ADR-040-sessionstart-ready-uses-the-listing.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md` exits 0.
> **Cross-references:** docs/specs/2026-09-09-a-staged-product-not-a-funnel.md (ADR-038 F-31), docs/specs/2026-09-10-records-use-the-same-listing.md (observe / adrCorpus; a different goal), docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-008-the-plugin-is-not-the-repository.md, plugin/scripts/lifecycle.mjs

## Problem

ADR-038 F-31 already takes `work-next` task files from `trackedPaths`. SessionStart still finds task directories with `existsSync(docs)` then `readdirSync` (`taskDirectories`), then `readyTaskLines` offers them as "ADR tasks in flight". A gitignored tasks dir, or a look git could not complete, is then a looked-at ready set (ADR-005). The same SessionStart surface answers "is there a corpus" for the shadow-install notice via `hasDecisionCorpus` `statSync` of five relative directory names, independent of that listing.

## Goal

SessionStart inventories ready task directories from the git listing, not disk. When git cannot list, that look is UNPROVEN, not "no ready tasks". Whether a decision corpus exists (the shadow-install notice) also answers from that listing, not `statSync`.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | trust SessionStart: disk-only task dirs are not in flight; disk-only corpus dirs do not open the shadow-install notice; git fail is UNPROVEN |
| SessionStart | system | `additionalContext` names ready tasks from the listing, or UNPROVEN |
| `sessionOrientation` / `readyTaskLines` / `taskDirectories` | system | inventory task dirs from the listing the caller can prove |
| `sessionStateNote` | system | the compact note SessionStart hands back uses that same inventory |
| `hasDecisionCorpus` | system | SessionStart's corpus-existence look for the shadow-install notice uses the listing |

## Use Cases

### UC-1: SessionStart inventories ready task dirs from the listing

- **Trigger:** `SessionStart` runs (`sessionOrientation`); compact SessionStart may also hand back `sessionStateNote` · **Preconditions:** the cwd resolves to a git repository
- **Main flow:**
  1. Take `listing = trackedPaths(root)` (the same listing rule as ADR-038 F-30/F-31: `git ls-files` plus `--others --exclude-standard`).
  2. Inventory task directories from that listing, not `existsSync` / `readdirSync`.
  3. Offer "ADR tasks in flight" only for directories that listing named.
- **Failure paths:**
  - a. at step 2, a `tasks/` dir exists on disk but is absent from the listing (gitignored or otherwise unlisted) → it is not offered as in flight.
  - b. at step 1, git cannot list (`listing == null`) → the look is UNPROVEN, not a silent empty ready list and not "no ready tasks".
  - c. at preconditions, the cwd is not a repository → no ADR reading (already tested; this spec does not reverse it).
- **Postconditions:** disk existence is not ready. Could-not-list is not none-ready. This spec does not call `work-next` `taskFiles` / `observe`, and does not change `adr-next`.

### UC-2: SessionStart's corpus-existence gate uses the listing

- **Trigger:** `sessionOrientation` decides whether the shadow-install notice is worth emitting · **Preconditions:** the cwd resolves to a git repository
- **Main flow:**
  1. Take `listing = trackedPaths(root)` (the same listing rule as F-1 / ADR-038 F-30/F-31).
  2. Answer whether a decision corpus exists from that listing, not `statSync` of `docs/adr`, `docs/specs`, `docs/decisions`, `adr`, `specs`.
  3. A listed directory among those names may open the notice; a disk-only one may not.
- **Failure paths:**
  - a. at step 2, a named corpus dir exists on disk but is absent from the listing (gitignored or otherwise unlisted) → it is not a corpus for this gate.
  - b. at step 1, git cannot list (`listing == null`) → the look is UNPROVEN, not "no corpus" (a false that would skip the notice).
  - c. at preconditions, the cwd is not a repository → no ADR reading (F-1; not this member).
- **Postconditions:** disk existence is not a corpus. Could-not-list is not no-corpus. This spec does not unify with `work-next` `observe` / `adrCorpus` or with `adr-next`.


## Scenarios

### UC1-S1 [happy] SessionStart offers ready tasks the listing named (F-1 Accepted) [@spec] → `tests/lifecycle.test.mjs::SessionStart offers ready tasks the listing named`

```gherkin
Given a git repository whose listing includes a tasks directory
And adr-next reports a ready task in that directory
When SessionStart runs (sessionOrientation)
Then additionalContext may name that directory under ADR tasks in flight
And this spec does not reverse offering tracked ready tasks
```

### UC1-S2 [failure] a disk-only task dir is not in flight (F-1 Accepted) [@spec] → `tests/lifecycle.test.mjs::a disk-only task dir is not in flight`

```gherkin
Given a git repository that can list
And a tasks directory exists on disk but is absent from trackedPaths (gitignored)
When SessionStart runs
Then additionalContext does not offer that directory as ADR tasks in flight
And the compact note sessionStateNote writes does not offer it either
```

### UC1-S3 [failure] git cannot list is UNPROVEN, not no ready tasks (F-1 Accepted) [@spec] → `tests/lifecycle.test.mjs::git cannot list is UNPROVEN, not no ready tasks`

```gherkin
Given a git repository (rev-parse succeeds)
And git cannot list the tree (trackedPaths returns null)
And a tasks directory exists on disk
When SessionStart runs
Then the look is UNPROVEN
And this is not treated as no ready tasks (omitting the section is not enough)
And a fixture that is not a repository is a different member (already empty; not this failure)
```

### UC2-S1 [happy] SessionStart may treat a listing-named corpus dir as a corpus (F-2 Accepted) [@spec] → `tests/lifecycle.test.mjs::SessionStart may treat a listing-named corpus dir as a corpus`

```gherkin
Given a git repository whose listing includes docs/adr (or another of the five relative names)
When SessionStart runs (sessionOrientation)
Then corpus existence for the shadow-install notice may be true
And this spec does not reverse showing that notice when a listed corpus dir exists
```

### UC2-S2 [failure] a disk-only corpus dir is not a corpus (F-2 Accepted) [@spec] → `tests/lifecycle.test.mjs::a disk-only corpus dir is not a corpus`

```gherkin
Given a git repository that can list
And docs/adr exists on disk but is absent from trackedPaths (gitignored)
And no listed corpus directory exists
When SessionStart runs
Then the corpus-existence look does not treat that directory as a corpus
And the shadow-install notice is not opened on that account
```

### UC2-S3 [failure] git cannot list is UNPROVEN, not no corpus (F-2 Accepted) [@spec] → `tests/lifecycle.test.mjs::git cannot list is UNPROVEN, not no corpus`

```gherkin
Given a git repository (rev-parse succeeds)
And git cannot list the tree (trackedPaths returns null)
And a corpus directory exists on disk
When SessionStart runs
Then the corpus-existence look is UNPROVEN
And this is not treated as no corpus (a false that would skip the shadow-install notice)
And a fixture that is not a repository is a different member (F-1; not this failure)
```


## Facts

Scouted on `spec/staged-product-not-a-funnel`. Command (CLAUDE.md §5):

```text
rg -n 'function taskDirectories\(|function readyTaskLines\(|readyTaskLines\(|taskDirectories\(|if \(existsSync\(docs\)\) walk\(docs' plugin/scripts/lifecycle.mjs
```

Output (this branch):

```text
2526:function taskDirectories(root) {
2543:  if (existsSync(docs)) walk(docs, 0, false)
2647:function readyTaskLines(root, insideRepository) {
2654:  for (const directory of taskDirectories(root)) {
2999:  if (existsSync(docs)) walk(docs, 0)
3300:    const ready = readyTaskLines(root, insideRepository)
3681:  const ready = readyTaskLines(root, repositoryRoot !== null)
```

`2999` is `readRecordFiles` (sibling spec `2026-09-10-records-use-the-same-listing.md`), not this class. Members in for F-1: `taskDirectories` (`existsSync(docs)` then `readdirSync`); `readyTaskLines` (spawns `adr-next` per walked dir; `if (!insideRepository) return []`); callers `sessionOrientation` (SessionStart) and `sessionStateNote` (PreCompact / compact SessionStart).

Second command (does this class take a listing?):

```text
rg -n 'trackedPaths\(' plugin/scripts/lifecycle.mjs
```

Output:

```text
3018:export function trackedPaths(root) {
3041:export function adrCorpus(root, { tracked = trackedPaths(root) } = {})
```

`readyTaskLines` / `taskDirectories` never call `trackedPaths`. Git fail is only `rev-parse` via `insideRepository`; a repo whose `ls-files` fails still walks disk.

F-2 (same branch). Command (CLAUDE.md §5):

```text
rg -n -A 8 'function hasDecisionCorpus' plugin/scripts/lifecycle.mjs
rg -n 'hasDecisionCorpus\(' plugin tests --glob '!**/node_modules/**' --glob '!**/__pycache__/**'
```

Output:

```text
3655:function hasDecisionCorpus(root) {
3656:  for (const relative of ['docs/adr', 'docs/specs', 'docs/decisions', 'adr', 'specs']) {
3657:    try {
3658:      if (statSync(path.join(root, relative)).isDirectory()) return true
3659:    } catch { /* absent is the common case */ }
3660:  }
3661:  return false
3662:}

plugin/scripts/lifecycle.mjs:3655:function hasDecisionCorpus(root) {
plugin/scripts/lifecycle.mjs:3688:  if (check || ready.length || hasDecisionCorpus(root)) {
```

Members in for F-2: the five relative names (`docs/adr`, `docs/specs`, `docs/decisions`, `adr`, `specs`); `statSync(...).isDirectory()` independent of `trackedPaths`; the only product caller is `sessionOrientation` (shadow-install notice). `sessionStateNote` is not a caller. Other `statSync` in this file (cwd walk, record file size, said-marker mtime) are not this class.


| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Current: SessionStart `sessionOrientation` and the compact note `sessionStateNote` both call `readyTaskLines`, which walks `taskDirectories` (`existsSync(docs)` then `readdirSync`, else walk `root`). `insideRepository` is only `git rev-parse --show-toplevel`; `trackedPaths` is never asked. A gitignored `tasks/` dir, or a repo git cannot list, is still offered as ADR tasks in flight when `adr-next` answers. After: both callers inventory task directories from `trackedPaths` (ls-files plus `--others --exclude-standard`). Disk-only task dirs (on disk, absent from that listing) are not ready. When git cannot list, that look is UNPROVEN, not a silent empty ready list and not "no ready tasks". Not-a-repository stays no ADR reading (existing test; not this member). After does not unify with `work-next` `taskFiles` / `observe` or with `adr-next`. This spec does not reverse ADR-038 F-13–F-33. Why it can fail: F-31 stays green; `session orientation states this project` git-inits untracked-not-ignored files that `--others` would list, so it does not catch disk-only; a not-a-repo fixture tests the wrong git-fail member; a green `sessionOrientation` test leaves `sessionStateNote` walking disk. | `tests/lifecycle.test.mjs::a disk-only task dir is not in flight` | @spec | |
| F-2 | Accepted. Current: `hasDecisionCorpus` answers whether a decision corpus exists by `statSync` of five relative directory names (`docs/adr`, `docs/specs`, `docs/decisions`, `adr`, `specs`) and returns true on the first that `isDirectory()`. It never consults `trackedPaths`. The only product caller is `sessionOrientation`, which uses that boolean (with `projectCheckCommand` and `readyTaskLines`) to decide whether the shadow-install notice is worth emitting. `sessionStateNote` is not a caller. After: that SessionStart gate answers corpus existence from `trackedPaths` (ls-files plus `--others --exclude-standard`). A disk-only directory among those names (on disk, absent from the listing) is not a corpus. When git cannot list, that look is UNPROVEN, not "no corpus" (a false that would skip the notice). Not-a-repository stays no ADR reading (F-1; not this member). After does not unify with `work-next` `observe` / `adrCorpus` or with `adr-next`. This spec does not reverse F-1 or ADR-038 F-13–F-33. Why it can fail: a green F-1 ready-task test leaves `hasDecisionCorpus` still `statSync`-ing; a gitignored `docs/adr` still opens the shadow-install notice; treating listing-null as false hides the notice (ADR-005); a not-a-repo fixture tests the wrong git-fail member. | `tests/lifecycle.test.mjs::a disk-only corpus dir is not a corpus` | @spec | |

## Domain

**Listing** = `trackedPaths`, or `null` when git cannot answer. **Disk-only** = a directory on this machine that the listing did not name (`tasks/` for ready inventory; `docs/adr` and the four sibling names for corpus existence). **Ready in flight** = SessionStart / compact-note prose offering a task directory. **Corpus existence** = SessionStart's look that gates the shadow-install notice. Ubiquitous language already decided: could-not-look ≠ empty (ADR-005); disk existence ≠ tracked (ADR-008). SessionStart ready is not `work-next` `taskFiles`. Corpus existence is not `adrCorpus` / `observe`.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `plugin/scripts/lifecycle.mjs` `taskDirectories` / `readyTaskLines` | inventory task dirs from the listing; git fail is UNPROVEN, not empty ready | SessionStart `additionalContext`; compact note |
| `plugin/scripts/lifecycle.mjs` `sessionOrientation` | name UNPROVEN when listing is null; do not offer disk-only dirs | SessionStart hook |
| `plugin/scripts/lifecycle.mjs` `sessionStateNote` | same inventory as orientation (same function, second caller) | PreCompact → compact SessionStart |
| `plugin/scripts/lifecycle.mjs` `hasDecisionCorpus` | corpus existence from the listing; git fail is UNPROVEN, not no corpus | SessionStart shadow-install notice (`sessionOrientation` only) |

## Non-Goals

- Unify SessionStart ready with `work-next` `taskFiles` / `observe` or with `adr-next` (this spec's own listing rule for Session).
- Reverse ADR-038 F-13–F-33.
- The `observe` / `adrCorpus` record walk (sibling spec `2026-09-10-records-use-the-same-listing.md`).
- Statusline `layer` / UNPROVEN-as-Advise.
- An event ledger.
- Cursor / OpenCode host adapter.
- Unify Python and JS Governs readers.
- Untangle `lifecycle.mjs`.
- Change not-a-repository behaviour (no ADR reading).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| A green F-31 / work-next test leaves SessionStart walking disk | High | High | Bind on `sessionOrientation` / SessionStart, not on `observe` |
| The existing orientation test uses untracked-not-ignored files, so `--others` still finds them | High | High | Bind disk-only on a gitignored `tasks/` dir absent from the listing |
| A not-a-repo fixture is treated as git-fail UNPROVEN | High | High | Git-fail requires rev-parse success and `trackedPaths` null |
| A green `sessionOrientation` test leaves `sessionStateNote` walking disk | High | High | F-1 names both callers |
| A green F-1 ready-task test leaves `hasDecisionCorpus` still `statSync`-ing | High | High | Bind F-2 on `sessionOrientation`'s shadow-install gate, not on `readyTaskLines` |
| A gitignored `docs/adr` still opens the shadow-install notice | High | High | Bind disk-only on a corpus dir absent from the listing |
| Treating listing-null as false hides the notice | High | High | Git-fail is UNPROVEN, not "no corpus" |

## Open Questions

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | SessionStart readyTaskLines / taskDirectories: listing not disk; git fail UNPROVEN not no ready tasks; do not unify with work-next / adr-next; do not reverse ADR-038? | F-1 | accepted — sessionOrientation and sessionStateNote both inventory task dirs from trackedPaths; disk-only dirs are not ready; git cannot list is UNPROVEN, not no ready tasks; not-a-repo stays no ADR reading; does not unify with work-next / adr-next; does not reverse ADR-038 |
| 2 | SessionStart hasDecisionCorpus: listing not statSync; disk-only corpus dir is not a corpus; git fail UNPROVEN not no corpus; do not unify adr-next; do not reverse F-1 / ADR-038? | F-2 | accepted — hasDecisionCorpus answers from trackedPaths; disk-only corpus dir is not a corpus; git cannot list is UNPROVEN, not no corpus; does not unify with adr-next; does not reverse F-1 or ADR-038 |
