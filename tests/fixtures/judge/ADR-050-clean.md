# ADR-050: Move the nightly export to a queue

**Status:** Accepted
**Date:** 2026-08-26

## Context

The nightly export runs in-process and took 42 min on 2026-08-19, up from 9 min
in March; `src/export/run.py` holds a single transaction for the whole window and
the incident on 2026-08-20 was traced to it. Measured against production data.

## Decision

We will move the export to a worker queue and adopt one job per account.

## Alternatives Considered

- Keep it in-process and raise the timeout — rejected because the transaction is
  the problem, not the limit; it would still hold a lock for the whole window.
- Shard by date range — discarded since the 42 min is dominated by one account,
  so sharding by date does not split the work that is slow.

## Consequences

Each account fails independently and retries alone. The cost is a queue to
operate and a new failure mode when a worker dies mid-job; runs also lose their
single-transaction guarantee, so a partial export becomes visible.
