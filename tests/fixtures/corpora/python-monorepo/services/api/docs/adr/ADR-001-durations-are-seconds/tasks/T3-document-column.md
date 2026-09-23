# Task ADR-001-T3: document the column type

**Depends-on:** none
**Covers:** none — no spec

## Goal

The schema doc names `INTEGER` for every duration column.

## Affected Files

| File | Change | Why |
|---|---|---|
| `services/api/docs/schema.md` | edit | the column note |

## Ordered Steps

1. Add the note.

## Acceptance

```bash
grep -q "INTEGER" services/api/docs/schema.md
```

## Tests

| Test | File | Asserts |
|---|---|---|
| (grep) | `services/api/docs/schema.md` | the word is there |

## Mutation Log

- (none at authoring)

## Verification Log

## Stop Condition

The grep passes.
