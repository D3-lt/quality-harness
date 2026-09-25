# Task ADR-001-T4: the client types carry the flag

**Depends-on:** none
**Covers:** none — no spec
**Produces:** `client.d.ts` exposes `is_pinned`
**Consumes:** `routes.json` documents `is_pinned` (T3)

## Goal

the client types carry the flag.

## Affected Files

| File | Change | Why |
|---|---|---|
| `web/src/client.d.ts` | edit | the client types carry the flag |

## Ordered Steps

1. Write the failing check first.
2. Make it pass.

## Acceptance

```bash
grep -q is_pinned web/src/client.d.ts
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| (grep) | `web/src/client.d.ts` | the flag is named | none |

## Invariants

- The flag is optional.

## Risks

- None known.

## Stop Condition

The grep passes.

## Out of Scope

- none

## Verification Log

