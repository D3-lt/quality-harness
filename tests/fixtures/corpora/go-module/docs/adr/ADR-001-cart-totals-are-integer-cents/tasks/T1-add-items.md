# Task ADR-001-T1: add items purely

**Depends-on:** none
**Covers:** F-1
**Produces:** none
**Consumes:** none
**Status:** done

## Goal

`Add` returns a new slice and leaves its input unchanged.

## Affected Files

| File | Change | Why |
|---|---|---|
| `internal/cart/cart.go` | edit | `Add` |
| `internal/cart/cart_test.go` | edit | its test |

## Ordered Steps

1. Write the failing test first.
2. Add `Add`.

## Acceptance

```bash
grep -q 'func TestAdd' internal/cart/cart_test.go
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| `TestAdd` | `internal/cart/cart_test.go` | the input is unchanged | F-1 |

## Invariants

- `Add` never changes its input.

## Risks

- None known.

## Stop Condition

The test passes.

## Out of Scope

- none

## Verification Log

- 2026-08-20 · no-git · exit 0 · `grep -q 'func TestAdd' internal/cart/cart_test.go` · acceptance-sha256:623181b72832111cc47bf1d638a511e35e20e2c913c90ee60fd97acfb278635e · ms:12
