# ADR-001: Cart totals are integer cents

**Status:** Accepted
**Date:** 2026-09-24
**Owner:** cart maintainers
**Spec:** docs/specs/2026-09-24-cart-totals.md
**Enforced-by:** `internal/cart/cart_test.go` (`TestAdd`, two cases) and `go.mod` §3. Three mutations were run by hand.

## Context

Float totals drifted by a cent on large carts.

## Existing Primitives Audit

Nothing in the module handled money before this.

## Decision

`internal/cart` adds items as integer cents; `internal/money` will format them.

## Alternatives Considered

- `float64` with rounding at the edge — rejected, it is how the totals drifted.

## Consequences

Every price is an `int` of cents.

## Wiring & Contract Changes

None.

## Out of Scope

- Currency conversion (permanent: boundary: one currency)
