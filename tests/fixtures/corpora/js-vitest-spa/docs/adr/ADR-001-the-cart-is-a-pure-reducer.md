# ADR-001: The cart is a pure reducer

**Status:** Accepted
**Date:** 2026-08-11
**Owner:** web team

## Context

Cart state was mutated from three components and the totals drifted.

## Existing Primitives Audit

None; each component kept its own copy.

## Decision

Every cart change goes through a pure function in `src/cart.ts`.

## Alternatives Considered

- A store library — rejected for one list.

## Consequences

The cart is testable without rendering anything.

## Wiring & Contract Changes

None.

## Out of Scope

- Persisting the cart.
