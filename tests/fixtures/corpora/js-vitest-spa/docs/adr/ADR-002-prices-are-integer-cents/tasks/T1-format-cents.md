# Task ADR-002-T1: format cents for display

**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none
**Status:** done

## Goal

`formatCents(1999)` is `"19.99"`.

## Affected Files

| File | Change | Why |
|---|---|---|
| `src/price.ts` | edit | the formatter |

## Ordered Steps

1. Add the formatter.

## Acceptance

```bash
grep -q 'export function formatCents' src/price.ts
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| (grep) | `src/price.ts` | the formatter exists | none |

## Invariants

- No float reaches a total.

## Risks

- None known.

## Stop Condition

The grep passes.

## Out of Scope

- none

## Verification Log

(Claimed done in its Status and in the README, and never run: nothing blocks it, so
it is ready to start, and it is claimed finished. Both are true; adr-verify comes first.)
