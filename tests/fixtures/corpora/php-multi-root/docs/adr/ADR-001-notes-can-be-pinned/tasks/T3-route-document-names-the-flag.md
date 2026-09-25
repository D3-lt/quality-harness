# Task ADR-001-T3: the route document names the flag

**Depends-on:** none
**Covers:** none — no spec
**Produces:** `routes.json` documents `is_pinned`
**Consumes:** none

## Goal

the route document names the flag.

## Affected Files

| File | Change | Why |
|---|---|---|
| `routes.json` | edit | the route document names the flag |

## Ordered Steps

1. Write the failing check first.
2. Make it pass.

## Acceptance

```bash
grep -q is_pinned routes.json
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| (grep) | `routes.json` | the flag is named | none |

## Invariants

- The flag is optional.

## Risks

- None known.

## Stop Condition

The grep passes.

## Out of Scope

- none

## Verification Log

