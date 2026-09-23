# Task ADR-001-T1: lint the inventory

**Depends-on:** none
**Covers:** none — no spec

## Goal

Every host has one role.

## Affected Files

| File | Change | Why |
|---|---|---|
| `inventory.yml` | edit | the map |

## Ordered Steps

1. Write the check.

## Acceptance

```bash
test -f inventory.yml
```

## Tests

| Test | File | Asserts |
|---|---|---|
| (test -f) | `inventory.yml` | present |

## Mutation Log

- (none at authoring)

## Verification Log

## Stop Condition

The file exists.
