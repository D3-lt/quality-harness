---
status: active
supersedes: [002-cache-in-memory]
---

# Cache prices in Redis

## Context

Per-process caches disagree after a price change.

## Decision

Cache prices in one Redis instance.
