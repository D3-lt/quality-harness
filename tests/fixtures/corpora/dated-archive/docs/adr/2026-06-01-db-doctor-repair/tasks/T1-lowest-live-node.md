# Task T1: pick the lowest live node

**Depends-on:** none
**Covers:** none — no spec

## Goal

`leader(nodes)` returns the lowest live id.

## Affected Files

| File | Change | Why |
|---|---|---|
| `doctor/election.sh` | edit | the rule |

## Ordered Steps

1. Write the check.

## Acceptance

```bash
bash doctor/election.sh
```

## Tests

| Test | File | Asserts |
|---|---|---|
| (script) | `doctor/election.sh` | exits 0 on the fixture |

## Mutation Log

- (none at authoring)

## Verification Log

## Stop Condition

The script exits 0.
