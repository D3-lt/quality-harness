# ADR-001: A status behind a fullwidth colon

**Status：** Accepted
**Date:** 2026-09-27
**Owner:** corpus maintainers

## Context

An IME typed the colon after `Status` as U+FF1A, and nothing on screen shows the difference.

## Existing Primitives Audit

None.

## Decision

Every reader names this file rather than counting it nowhere.

## Alternatives Considered

- Read the fullwidth colon as a colon — rejected here, because the fixture is about what a reader says when it cannot read a status.

## Consequences

None.

## Wiring & Contract Changes

None.

## Out of Scope

- Any other homoglyph.
