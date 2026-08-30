# Task ADR-001-T2: part-done, waiting on a decision nobody has made

**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none

## Goal

Real work landed; the rest waits on a human choosing, which no command can check.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `src/schema.ts` | edit | the extracted schema |

## Ordered Steps

1. Write the failing test first.
2. Then the rest.

## Acceptance

```bash
true
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `t` | `src/schema.ts` | v | — |

## Invariants

- `partial` is checked as hard as `done` for what its evidence claims.

## Risks

- None; fixture.

## Stop Condition

Stop if `partial` reads as an exemption.

## Out of Scope

- Everything else. (permanent: fixture.)

## Verification Log

## Mutation Log
