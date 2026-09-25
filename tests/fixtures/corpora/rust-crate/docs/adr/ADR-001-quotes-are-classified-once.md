# ADR-001: Quotes are classified in one place

**Status:** Accepted
**Date:** 2026-08-10
**Owner:** scanner maintainers

## Context

Two call sites decided what a quote character was, and they disagreed about `'`.

## Existing Primitives Audit

Nothing in the crate classified characters before this.

## Decision

`quote_kind` in `src/lib.rs` is the one place a quote is classified.

## Alternatives Considered

- A `match` at each call site — rejected, it is how the two disagreed.

## Consequences

One function to test, and the integration tests exercise it through the public API.

## Wiring & Contract Changes

None.

## Out of Scope

- Unicode quotation marks.
