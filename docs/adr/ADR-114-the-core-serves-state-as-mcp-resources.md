# ADR-114: The core serves session state as MCP resources, and pushes nothing less

**Status:** Accepted
**Date:** 2026-10-19
**Owner:** Zy
**Spec:** None — no spec stage; ADR-113 Decision 6 asked for this record, Proposed, and nothing built
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-012-the-gates-reach-a-client-with-no-shell.md, docs/adr/ADR-094-a-standing-fact-is-said-once-and-prose-reuses-the-pass.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-113-the-go-core-takes-the-rules-and-side-doors-are-enumerated.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks
**Served-path change:** none until accepted and built; then an agent may ask the core for the state the hooks already wrote

## Context

The hooks push the session's state as text: SessionStart's orientation and branch state, a per-prompt brief when it changes (ADR-094), and the turn end's findings. Pushed text is paid for by every adopter on every event where it is said (CLAUDE.md §19), so ADR-113 asked whether MCP resources, which an agent pulls, could carry some of it.

Measured 2026-10-19 on macOS, by a scratch script that ran the plugin's hook programs in a hermetic home with the baseline off and no CI lookup, on a fresh one-commit repository and on a local clone of this one (bytes of stdout and stderr together):

| Repository | SessionStart | First prompt's brief | An unchanged brief | Stop after one edit |
|------------|--------------|----------------------|--------------------|---------------------|
| fresh | 228 | 271 | 0 | 1,084 |
| this repository | 972 | 481 | 0 | 907 |

An unchanged brief already costs nothing. The turn end's findings are what the agent must act on, and a resource is read only by an agent that asks, so pulling them would lose them. What a resource could stand in for is SessionStart's block and a changed brief: under 1.5 KB a session here.

`plugin/bin/qh-mcp` is a Python MCP server of tools, for a client with no shell (ADR-012). It serves no resources.

## Existing Primitives Audit

- **The ledgers the hooks write** (`checks.jsonl`, `baseline.jsonl`, the session log, the branch-state cache): every resource is read from one of them, never computed again.
- **`plugin/bin/qh-mcp`** (ADR-012): kept as the tool surface; this adds no tool to it.
- **The Go core** (`core/`, ADR-110, ADR-113): where a long-lived reader would live, since it starts in milliseconds.

## Decision

1. **If built, `qh mcp` serves four read-only resources over stdio** from the Go core: `qh://branch-state`, `qh://check/latest`, `qh://turn-end/findings` and `qh://baseline`. Each answers from the ledger that already holds it, in the hooks' own vocabulary: a ledger it cannot read is UNRUN or UNPROVEN, never empty (ADR-005).
2. **Nothing pushed is dropped for a resource.** The measurement leaves little to drop, and what the agent must act on has to arrive unasked.
3. **It ships only on a measured use.** A plugin `.mcp.json` would put the server in every adopter's listing (§19), so it is registered only after an outside session shows an agent reading a resource where it would otherwise have run a gate again, counted in turns.

**This fails if** a resource answers a state its ledger does not hold, a pushed line is removed because a resource exists, or the server is registered before a measured use.

## Alternatives Considered

- **Build nothing.** The measurement says the push is already small, and this is the recommendation unless Decision 3's use is shown. Not chosen as the decision, because ADR-113 asked for the design on record before anyone measures the use; Decision 3 holds the build until that measurement, so this alternative stands until it says otherwise.
- **Add resources to `plugin/bin/qh-mcp`.** One server instead of two, but the state's readers live in Node and Go, and a third reader of the same ledgers is a copy that drifts.
- **Replace the pushed text with resources.** Rejected: a pulled finding is not read by an agent that does not ask.

## Component / Boundary Impact

`core/` would gain `qh mcp`; nothing else changes. This repository has no architecture document.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `qh mcp` | new Go subcommand, stdio MCP server, resources only | T1 | an MCP client |
| `plugin/.mcp.json` | registered only after Decision 3's measurement | T1 | the host |

## Inter-task Contracts

None — one task.

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** an agent can ask for the last check, the baseline and the open findings without running anything.
- **Negative:** a second MCP server to keep beside `qh-mcp`.
- **Neutral:** the pushed text is unchanged.

## Out of Scope

- Tools that write (permanent: boundary: the resources read the ledgers the hooks write, and ADR-012's server keeps the tools)
- Dropping pushed text (permanent: boundary: Decision 2)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A resource drifts from the hook that writes its ledger | Med | Med | each resource is tested against the hook's own output on the same session |
| The listing cost is paid for nothing | High | Low | Decision 3: registered only on a measured use |

## Rollback

Nothing is built while Proposed. Built, remove the subcommand and the registration; no ledger changes.

## Follow-ups

- [x] Owner decision: Accepted, 2026-10-19 ("accept."), over the recommendation to leave it Proposed. Decision 3 still holds: the server is built, and registered only after a measured use.
