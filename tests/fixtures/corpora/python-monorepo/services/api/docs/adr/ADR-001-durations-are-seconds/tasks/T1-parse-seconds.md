# Task ADR-001-T1: parse a plain seconds string

**Depends-on:** none
**Covers:** none — no spec
**Status:** done

## Goal

`parse("90")` returns 90.

## Affected Files

| File | Change | Why |
|---|---|---|
| `services/api/duration.py` | edit | the parser |

## Ordered Steps

1. Write the failing test.
2. Make it pass.

## Acceptance

```bash
python3 -m unittest -v services.api.test_duration
```

## Tests

| Test | File | Asserts |
|---|---|---|
| `test_parses_plain_seconds` | `services/api/test_duration.py` | `parse("90") == 90` |

## Mutation Log

- (none at authoring)

## Verification Log

(A `done` status with no tool-written row: this is the unbacked claim the matrix expects work-next to name.)

## Stop Condition

The test passes.
