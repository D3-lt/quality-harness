# ADR-001: Durations are stored as integer seconds

**Status:** Accepted
**Date:** 2026-06-01
**Owner:** api team

## Context

Three services parsed durations three ways.

## Existing Primitives Audit

Nothing existing covers it.

## Decision

Store every duration as an integer number of seconds.

## Alternatives Considered

- ISO-8601 strings — rejected, three parsers again.

## Consequences

One parser, one column type.

## Wiring & Contract Changes

None.

## Out of Scope

- Sub-second precision.
