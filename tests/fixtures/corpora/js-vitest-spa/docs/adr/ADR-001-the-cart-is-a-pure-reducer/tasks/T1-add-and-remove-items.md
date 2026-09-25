# Task ADR-001-T1: add and remove cart items purely

**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none
**Status:** done

## Goal

`addItem` returns a new cart; the original is untouched.

## Affected Files

| File | Change | Why |
|---|---|---|
| `src/cart.ts` | edit | the reducer |
| `src/cart.test.ts` | edit | its tests |

## Ordered Steps

1. Write the failing tests first.
2. Add the reducer.

## Acceptance

```bash
grep -q 'adds_an_item' src/cart.test.ts
```

## Tests

The second row is stale: its test was renamed away and the row was not.

| Test name | File | Verifies | Covers |
|---|---|---|---|
| `adds_an_item` | `src/cart.test.ts` | a new cart comes back | none |
| `removes_an_item` | `src/cart.test.ts` | removal is pure too | none |

## Invariants

- The input cart is never mutated.

## Risks

- None known.

## Stop Condition

Both tests pass.

## Out of Scope

- none

## Verification Log

- 2026-08-20 · no-git · exit 0 · `grep -q 'adds_an_item' src/cart.test.ts` · acceptance-sha256:a15cd2551d793db3734e8da49308522becb19de3396dcfd29073576ecf72dbd9 · ms:3
