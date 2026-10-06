# Task ADR-001-T2: remove items purely

**Depends-on:** T1
**Covers:** none — no spec
**Produces:** none
**Consumes:** none

## Goal

`Remove` returns a new slice without the item, and leaves its input unchanged.

## Affected Files

| File | Change | Why |
|---|---|---|
| `internal/cart/cart.go` | edit | `Remove` |
| `internal/cart/cart_test.go` | edit | its test |

## Ordered Steps

1. Write the failing test first.
2. Add `Remove`.

## Acceptance

`go test -run` with a name nothing defines yet exits 0 having run nothing, so the fence asserts the test
exists before it runs it.

```bash
grep -q 'func TestRemove' internal/cart/cart_test.go && go test ./internal/cart -run '^TestRemove$'
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| `TestRemove` | `internal/cart/cart_test.go` | the input is unchanged | none |

## Invariants

- `Remove` never changes its input.

## Risks

- None known.

## Stop Condition

The test passes.

## Out of Scope

- none

## Verification Log
