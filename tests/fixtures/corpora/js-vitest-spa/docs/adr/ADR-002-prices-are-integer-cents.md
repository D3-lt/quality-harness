# ADR-002: Prices are integer cents

**Status:** Accepted
**Date:** 2026-08-13
**Owner:** web team

## Context

Floating-point prices rounded differently in the cart and at checkout.

## Existing Primitives Audit

None.

## Decision

Every price is an integer number of cents, formatted only for display by `formatCents`.

## Alternatives Considered

- A decimal library — rejected for one formatter.

## Consequences

Arithmetic stays exact.

## Wiring & Contract Changes

None.

## Out of Scope

- Currencies other than one.
