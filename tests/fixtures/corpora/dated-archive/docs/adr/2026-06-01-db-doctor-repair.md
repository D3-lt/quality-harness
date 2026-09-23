# Repair the doctor's election under load

**Status:** Accepted
**Date:** 2026-06-01

## Context

The election flapped.

## Existing Primitives Audit

Nothing existing covers it.

## Decision

One leader per shard, chosen by the lowest live node id.

## Alternatives Considered

- Random leader — rejected, non-deterministic recovery.

## Consequences

Deterministic failover.

## Wiring & Contract Changes

None.
