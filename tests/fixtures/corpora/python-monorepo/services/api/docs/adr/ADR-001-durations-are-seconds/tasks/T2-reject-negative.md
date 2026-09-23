# Task ADR-001-T2: reject a negative duration

**Depends-on:** T1
**Covers:** none — no spec

## Goal

`parse("-5")` raises `ValueError`.

## Affected Files

| File | Change | Why |
|---|---|---|
| `services/api/duration.py` | edit | the guard |

## Ordered Steps

1. Write the failing test.
2. Make it pass.

## Acceptance

```bash
test -f services/api/duration.py
```

## Tests

| Test | File | Asserts |
|---|---|---|
| `test_rejects_negative` | `services/api/test_duration.py` | raises |

## Mutation Log

- (none at authoring)

## Verification Log

- 2026-09-23 · no-git · exit 0 · `test -f services/api/duration.py` · acceptance-sha256:e6ab049f7f6a0f7d6c77c964a8d3ccb82eba68e9d0d00715efa1828c6ec59123 · ms:1

## Stop Condition

The test passes.
