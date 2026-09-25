# ADR-003: Notes are soft-deleted

**Status:** Accepted
**Date:** 2026-08-14
**Owner:** notes team

## Context

A deleted note could not be recovered, and support was asked to recover them weekly.

## Existing Primitives Audit

Eloquent's `SoftDeletes` trait already does this.

## Decision

The `Note` model uses `SoftDeletes`.

## Alternatives Considered

- An audit table — rejected, the trait is enough.

## Consequences

Deleted notes stay in the table with a `deleted_at` stamp.

## Wiring & Contract Changes

None.

## Out of Scope

- Purging old deleted notes.
