# ADR-008: Ship the plugin, not the repository

**Status:** Proposed
**Date:** 2026-08-28
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-004-templates-are-not-linked.md, docs/BACKLOG.md §42
**Governs:** `.claude-plugin/marketplace.json`
**Invalidates:** none — checked. ADR-004 decided what this plugin installs into a user's home; this decides what reaches their machine in the first place, and neither touches the other's mechanism.
**Served-path change:** A user installing this plugin downloads roughly 660 K instead of 1,491 K, and stops receiving this repository's tests, its ADR corpus and its backlog.

## Context

`.claude-plugin/marketplace.json` declares `"source": "."`. The plugin IS the repository, so every
tracked file is unpacked into every user's plugin cache, once per version.

Measured 2026-08-28, tracked bytes:

| directory | bytes | does a user run or read it? |
|-----------|------:|-----------------------------|
| `evals/` (after `results/` was untracked) | 24 K | the case definitions, for `claude plugin eval` |
| `tests/` | 523 K | no |
| `docs/` | 311 K | no — this repository's own ADR corpus and backlog |
| `scripts`, `bin`, `skills`, `templates`, `workflows`, `hooks`, manifest, README, LICENSE | ~660 K | yes |

Before this session's untracking it was 2,091 K, of which 603 K was `evals/results` — measurement
artefacts nobody runs, which had also carried a personal home path into a public repository. That is
removed. What remains is **834 K of tests and development history in every install, against 660 K of
plugin** — more than half the download is not the product.

This machine holds 30 cached versions at 42 M. The waste is per version, so it compounds.

It has been noticed before and half-fixed: commit `e95b0f9` is titled "quality-harness 2.19.2: the
fence trap, and 660K nobody needed". It removed the eval `report.html` files and left the aggregate
JSON, which grew back to 603 K within two days, because nothing stopped it being committed. A
one-off cleanup does not hold; a boundary does.

## Existing Primitives Audit

- `.claude-plugin/marketplace.json` already has a `source` field, already set, and already the single
  place that decides what is published. **Reshaped:** its value, from `"."` to a subdirectory.
- `${CLAUDE_PLUGIN_ROOT}` is already used by all 20 skill and hook references instead of relative
  paths. **Reused unchanged, IF the cache unpacks the source subdirectory as the plugin root** —
  which is the load-bearing assumption below, and T1 exists to test it rather than assume it.
- `scripts/selftest.sh` and the CI workflow already name their paths in one place each.
  **Reshaped:** those paths gain a prefix.

## Decision

Move the plugin's shipped surface — `bin`, `scripts`, `skills`, `templates`, `workflows`, `hooks`,
`.claude-plugin/plugin.json`, `README.md`, `LICENSE` — under a single directory, and point
`marketplace.json`'s `source` at it. `tests/`, `docs/`, `evals/` and CI stay at the repository root,
where they are still checked on every push and no longer shipped.

**This decision is contingent on one fact that has not been established, and T1 establishes it before
anything moves.** If Claude Code unpacks a `source` subdirectory so that its contents are the plugin
root, then `${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs` keeps resolving and all 20 references are
untouched — the change is a `git mv`, a `source` value, and path prefixes in `selftest.sh` and CI.
If instead the cache mirrors the repository and the plugin root sits one level down, every one of
those 20 references is wrong in a way no test in this repository can see, because the tests run from
a checkout where the paths still work.

That asymmetry is the whole risk. **T1 must verify against a real installed cache, not by reading
documentation**, and if the assumption is false this record is Withdrawn rather than executed — a
40% saving is not worth breaking every skill's path resolution.

## Alternatives Considered

- **An ignore list in the plugin manifest.** There is no such field; `source` is the only lever the
  format offers. Not rejected on merit — unavailable.
- **Delete `docs/` and `tests/` from the repository.** Rejected outright: the ADR corpus is the
  evidence chain this project exists to demonstrate, and the tests are what make its own gates
  trustworthy. The problem is that they SHIP, not that they exist.
- **A separate publishing repository, synced on release.** Rejected: two repositories drift, and this
  project has spent three releases on exactly that failure mode with the standalone install
  (ADR-001, ADR-004). One tree, one boundary.
- **Do nothing; 1.5 M is small.** Tenable, and the honest counter-argument. Rejected because it
  compounds per cached version — 30 here — and because more than half of what a user downloads being
  someone else's test suite is a statement about the project, not just bytes.

## Component / Boundary Impact

The repository gains an explicit boundary between the product and the work that produces it. Nothing
inside the plugin changes ownership; the tests keep reaching into it, now across a directory.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `marketplace.json` `source` | `"."` → the plugin directory | the manifest | Claude Code's installer |
| `scripts/selftest.sh` paths | gain the directory prefix | the script | every developer, CI |
| `.github/workflows/selftest.yml` | five path references gain the prefix | the workflow | CI |
| `${CLAUDE_PLUGIN_ROOT}/...` in skills and hooks | **unchanged, if T1 confirms the assumption** | 20 files | the runtime |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the verified answer to how a `source` subdirectory is unpacked | T1 | T2 | Yes — a negative answer withdraws this record instead of executing T2 |

## Implementation

Two tasks, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** a user downloads ~660 K instead of ~1,491 K, and the boundary is structural — a new
  test file cannot leak into the product by being committed, which is what defeated `e95b0f9`.
- **Negative:** every path in `selftest.sh`, CI, and any test that reaches for `bin/` gains a prefix,
  and a contributor's muscle memory for the tree changes. One large mechanical diff.
- **Neutral:** the repository keeps everything it has today. This moves files; it deletes nothing.

## Out of Scope

- Removing `evals/` from the shipped set. (permanent: `plugin.json` declares `"experimental": {"evals": "evals"}`, so the case definitions are part of the plugin by design; at 24 K after `results/` was untracked, they are not the problem.)
- Reducing `tests/` or `docs/` themselves. (permanent: the problem is that they ship, not that they exist — and both are load-bearing for this project's own claims.)
- Rewriting history to purge what has already been published. (deferred: docs/BACKLOG.md §42)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `${CLAUDE_PLUGIN_ROOT}` resolves one level above the plugin after the move, breaking all 20 references | Med | Critical | T1 verifies against a real installed cache before anything moves, and a negative answer withdraws this record |
| A test that reaches for `bin/` by a relative path keeps passing from the checkout while the shipped plugin is broken | Med | High | T2 asserts the shipped set from `marketplace.json`'s `source`, not from a hardcoded list, so the manifest and the tree cannot disagree |
| A file is left behind in the move and silently stops shipping | Med | High | T2's check is derived from the manifest and enumerates what a user receives; a shipped file that is not under `source` fails it |

## Rollback

Revert the commit: `source` returns to `"."` and the files return to the root. No persistent state.
A user on the intermediate version has a working plugin either way, because the manifest and the
tree move together in one commit.

## Follow-ups

- [ ] Decide whether the already-published history is worth rewriting (docs/BACKLOG.md §42).
