# Task ADR-113-T6: Session state as MCP resources is proposed

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one Proposed record)
**Owner:** Zy
**Produces:** ADR-114, Proposed
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Draft ADR-114, "the core serves session state as MCP resources", as Proposed: `qh mcp` in the Go core with `resources/list`
and `resources/read` for branch state, the last check verdict, open turn-end findings and the baseline; a plugin
`.mcp.json`; its relation to ADR-012 and to `plugin/bin/qh-mcp`; and which pushed hook text it would let us drop, measured
(ADR-113, Decision 6).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-114-the-core-serves-state-as-mcp-resources.md` | add | the Proposed record |

## Ordered Steps

1. [S1] Measure the pushed text each resource could replace (SessionStart, UserPromptSubmit and Stop bytes on a fresh repository and on this one). [proof: human: the byte counts and where they were measured]
2. [S2] Draft the record from the measurement and lint it. [proof: human: adr-lint's output]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`, naming the record and the
measurements it rests on.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no test: a Proposed record | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the record |
| 2 — something selects it | the owner's decision on it |
| 3 — the caller can discover it | the ADR catalog |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- Nothing is built before the record is accepted.

## Risks

- Resources are pulled, so they may replace no pushed text at all; the record says so if the measurement shows it.

## Stop Condition

Stop if the measurement shows no pushed text a resource could replace; record that instead of a design.

## Out of Scope

- Building the server (deferred: docs/adr/ADR-113-the-go-core-takes-the-rules-and-side-doors-are-enumerated.md)

## Verification Log
