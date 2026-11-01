# ADR-135: Branch state runs in the core

**Status:** Accepted
**Accepted:** 2026-11-01 by Zy: "go further with moving mjs / js parts in to golang", then "Bounded inline (Recommended)" for the refresh
**Date:** 2026-11-01
**Owner:** Zy
**Spec:** None — the owner directed the port in conversation; CLAUDE.md §15 is the behaviour's own contract
**Cross-references:** docs/adr/ADR-065-branch-state-serves-its-snapshot.md, docs/adr/ADR-094-a-standing-fact-is-said-once-and-prose-reuses-the-pass.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-116-qh-ships-as-release-assets-fetched-and-verified.md, docs/adr/ADR-131-native-reader-identity-and-measured-cost.md, docs/adr/ADR-132-the-installed-plugin-includes-its-go-core.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — the parity and native tests are written by T1 to T3; this header names them once they exist
**Invalidates:** none — checked; ADR-110's 2026-10-28 amendment is amended below, its tasks keep their done state
**Amends:** ADR-110 2026-10-28 amendment — "The branch-state and edit-gate CLIs remain Node, reached through native bridge commands" (docs/adr/ADR-110-a-static-core-owns-the-hooks.md:200) no longer holds for branch-state; edit-gate stays Node
**Served-path change:** The SessionStart and UserPromptSubmit branch-state hooks run in the Go core (`qh bridge branch-state`) instead of spawning `node plugin/scripts/branch-state.mjs`, and a stale cache is refreshed inside the hook under a hard budget instead of by a detached child.

## Context

`plugin/scripts/branch-state.mjs` (1175 lines on 2026-11-01) is the one Node process every adopter pays on every prompt:
`core/hooks/bridge.go` spawns it for both branch-state registrations in `plugin/hooks/hooks.json`. The owner asked on
2026-11-01 to move more of the JavaScript into the Go core. ADR-110 amended itself on 2026-10-28 to keep branch-state in
Node; this record reverses that for branch-state only.

The Node refresher detaches a child after printing the cached answer (`startRefresher`, branch-state.mjs:851). ADR-110
Decision 4 says the core starts no detached process; the refresh "runs bounded inside the hook that asked for it, or is
skipped and said". The owner chose that on 2026-11-01 over keeping a detached child. ADR-065 measured a cache miss at about
1.3 s and each `gh` call at 1.1 to 2.3 s, which is why a hard budget is part of the decision.

## Existing Primitives Audit

Reuse in the core: `findGitDir` (core/hooks/eventlog.go:125), `stateDir` and the event reader (eventlog.go:184, :282),
`git()` (core/hooks/proc.go:99), `hideWindow` (hide_windows.go), and the hook goldens of tests/hook-golden.mjs. The
classifier parity pattern (tests/qh-core-parity.test.mjs writes rows; core/hooks/parity_test.go answers them) is the oracle
pattern for T1. Missing in Go and added here: the review-ledger reader (`reviewedHeads`), the loose-object parent reader
(`commitParents`), and `LC_ALL=C` on read-only git calls, which `git()` does not set and the untagged-repository detection
depends on (branch-state.mjs:83-91).

Class: every Node process the Go hooks start. Enumerated 2026-11-01 with
`git grep -n -E '"node"|\.mjs"' -- 'core/*.go' ':!*_test.go'`: branch-state.mjs and run-shell-hook.mjs (bridge.go:16-18),
run-shell-hook.mjs again from the artifact pass (artifact.go:82, :151, :672), install-notices.mjs (orientation.go:457),
publish-hook.mjs (orientation.go:489) and adr-context.mjs (pending.go:13). Only branch-state is ported here; the others are
left (see Out of Scope).

## Decision

1. The Go core answers `qh bridge branch-state [--brief] [--cached N]` itself, with the same output, suppression and exit 0
   on every path. `plugin/scripts/branch-state.mjs` stays as the hand-run CLI and as the parity oracle until T4 retires its
   hook use; `plugin/scripts/statusline.mjs` keeps importing its cache helpers.
2. A stale or missing cache is refreshed inside the hook under a hard budget of 2 s for the network half. Past it, the cached
   answer is printed marked stale, the refresh is left to the next prompt, and nothing outlives the hook. The git half is
   always collected first, as today.
3. Read-only git calls in the port pin `LC_ALL=C` beside `GIT_OPTIONAL_LOCKS=0`.
4. Parity is proved, not asserted: T1 compares the pure functions over a corpus the Node functions produce; T3 replays the
   subprocess scenarios of the locked Node tests against the native command. The locked tests stay byte-identical.

## Alternatives Considered

- **Detached Go child, as Node does:** rejected by the owner on 2026-11-01; it needs a second exception to ADR-110 Decision 4.
- **Port a smaller script first:** rejected; branch-state is the per-prompt cost every adopter pays (CLAUDE.md §19).
- **Rewrite the Node tests against Go:** rejected; 135 of their tests are locked (test-locks.py, 2026-11-01).

## Component / Boundary Impact

The hooks component of docs/architecture.md gains a branch-state handler in `core/hooks`; the scripts component keeps
branch-state.mjs as a CLI. docs/architecture.md:105-106 and :122-124 are updated by T4.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `qh bridge branch-state` | Answered natively instead of spawning Node | core/hooks | hooks.json registrations |
| `<git-dir>/qh-branch-state.json` | Same schema, written by Go | core/hooks | statusline.mjs, core/hooks/mcp.go, the Node CLI |
| Refresh | Bounded inline; no lock file or detached child from the hook | core/hooks | none |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `branchstate.go` pure functions | T1 | T2, T3 | No |
| `collectBranchState` | T2 | T3 | No |
| native `qh bridge branch-state` | T3 | T4 | No; same output |

## Implementation

See ADR-135-branch-state-runs-in-the-core/tasks/README.md.

## Consequences

One Node spawn leaves every prompt. The costs: a stale cache can make a prompt wait up to the 2 s budget where the detached
child never made it wait, a refresh skipped past the budget leaves the answer one prompt older, and two implementations of
the cache key exist until statusline is ported (T1's parity corpus covers `snapshotKey`, so they cannot drift silently).

## Out of Scope

- run-shell-hook.mjs, install-notices.mjs, publish-hook.mjs and adr-context.mjs on the hook path (deferred: docs/BACKLOG.md §438).
- Porting statusline.mjs (deferred: docs/BACKLOG.md §438).
- The edit-gate CLIs (permanent: boundary: ADR-110's amendment keeps them Node and this record does not change that).

## Risks

A parity gap in an untested output shape reaches every prompt; T3 replays the locked scenarios and the release needs an
outside run (ADR-131). Windows file replacement over an open cache file must be reproduced (branch-state.mjs:782-807).

## Rollback

Point `RunBridge` back at the Node script (bridge.go), which T4 keeps working. The cache schema does not change.

## Follow-ups

- [ ] T1 to T4, then a release with an outside run.
