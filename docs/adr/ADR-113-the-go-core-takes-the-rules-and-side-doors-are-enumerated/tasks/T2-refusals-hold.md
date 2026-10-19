# Task ADR-113-T2: A broken config and an mrw write are seen by both refusals

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** see ADR-113's Inter-task Contracts
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A configuration that cannot be read is said, never read as no check, and mrw's MCP write is a write to every hook that watches writes (ADR-113, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/refusals-hold.test.mjs` | add | the task's tests, each with a planted twin that must fail |
| ADR-113 Decision 2 sources | edit | named in the parent record's Context and Decision; the file list is completed as the task is built and recorded in its sign-off |

## Ordered Steps

1. [S1] Write the failing tests: a broken config beside a declared check keeps PreToolUse's refusal and says the problem; a read-only reviewer's mcp__mrw__mrw_write is refused; both on Node and Go. Record the red run.
2. [S2] Implement on the Node path and in the Go core where the rule is a hook's, keeping them in parity.
3. [S3] Record a killed mutant per decision point, and add catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/refusals-hold.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a broken config and an mrw write are seen by both refusals` | `tests/refusals-hold.test.mjs` | the config-problem origin and mrw's MCP write as a write, on both paths, each with its failing twin | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the finding's text, or the gate's output |
| 4 — it is used | every session and every gate run |

## Mutation Log

## Invariants

- Gates advise and two refusals are sanctioned (CLAUDE.md §3); nothing here adds a refusal outside them.
- The Node path and the Go core say the same thing at each commit.

## Risks

- A planted twin that does not fail proves nothing; each is shown failing in the same test.

## Stop Condition

Stop if a change would add a refusal outside the two sanctioned ones, or if parity cannot be kept without a design decision.

## Out of Scope

- ADR-110 T3's cutover (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
