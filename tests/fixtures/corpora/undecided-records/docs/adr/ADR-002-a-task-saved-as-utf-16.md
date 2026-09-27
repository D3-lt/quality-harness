# ADR-002: A task saved as UTF-16

**Status:** Accepted
**Date:** 2026-09-27
**Owner:** corpus maintainers

## Context

A Windows editor saved the task file below as UTF-16LE with a byte-order mark.

## Existing Primitives Audit

None.

## Decision

A task no reader can read leaves its directory UNPROVEN in every reader.

## Alternatives Considered

- Skip the file — rejected: skipped, the directory read as fully evidenced.

## Consequences

None.

## Wiring & Contract Changes

None.

## Out of Scope

- Converting the file.
