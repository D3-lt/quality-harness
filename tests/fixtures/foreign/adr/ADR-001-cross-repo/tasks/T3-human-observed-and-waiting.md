# Task ADR-001-T3: human-observed, waiting on someone with other access

**Blocked-on:** an accepted client-verify-assets appears in the router audit log on both prod nodes — checked by: the on-call SRE
**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none

## Goal

An event only a person with access this reader does not have can confirm.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `deploy/verify.sh` | edit | the deploy-time call |

## Ordered Steps

1. Write the failing test first.
2. Then the rest.

## Acceptance

Acceptance is human-observed: an operator reads the router audit log on both production nodes.

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `t` | `deploy/verify.sh` | v | — |

## Invariants

- A wait is reported as waiting, never as debt or rot.

## Risks

- None; fixture.

## Stop Condition

Stop if a human-observed task is called unfinished forever.

## Out of Scope

- Everything else. (permanent: fixture.)

## Verification Log

## Mutation Log
