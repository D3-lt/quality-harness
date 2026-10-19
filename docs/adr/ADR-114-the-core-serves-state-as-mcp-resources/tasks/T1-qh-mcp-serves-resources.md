# Task ADR-114-T1: `qh mcp` serves the four resources

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `qh mcp`
**Consumes:** none
**Data dependency:** hermetic for the tests; Decision 3's registration needs an outside session's measured use
**Proof map:** v1

## Goal

`qh mcp` answers `resources/list` and `resources/read` for branch state, the latest check, the open turn-end findings and the baseline, each from its ledger (ADR-114, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/qh-mcp-resources.test.mjs` | add | the task's test, with a planted unreadable ledger that must answer UNRUN |
| `core/cmd/qh/main.go`, `core/mcp/` | add | the subcommand and the server |

## Ordered Steps

1. [S1] Write the failing test: each resource read after a scripted session says what the hook said, and an unreadable ledger answers UNRUN. Record the red run.
2. [S2] Build the server in the Go core, read-only.
3. [S3] Record a killed mutant per resource. [proof: mutation]

## Acceptance

```bash
node --test tests/qh-mcp-resources.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `each resource says what its ledger holds, and an unreadable one says so` | `tests/qh-mcp-resources.test.mjs` | the four resources against the hook's output, and UNRUN on a planted unreadable ledger | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the subcommand |
| 2 — something selects it | `plugin/.mcp.json`, only after Decision 3's measurement |
| 3 — the caller can discover it | `resources/list` |
| 4 — it is used | nothing until registered |

## Mutation Log

## Invariants

- The resources read; nothing writes a ledger.
- A ledger that cannot be read is never answered as empty (ADR-005).

## Risks

- A resource that recomputes state instead of reading it drifts from the hook; the test compares the two on one session.

## Stop Condition

Stop if ADR-114 is not Accepted.

## Out of Scope

- Registering the server (deferred: docs/adr/ADR-114-the-core-serves-state-as-mcp-resources.md, Decision 3)

## Verification Log
