# Task ADR-001-T1: the API accepts the flag

**Depends-on:** none
**Covers:** none — no spec
**Produces:** the API accepts `is_pinned` on create and update
**Consumes:** none

## Goal

the API accepts the flag.

## Affected Files

| File | Change | Why |
|---|---|---|
| `app/Http/Requests/NoteRequest.php` | edit | the API accepts the flag |

## Ordered Steps

1. Write the failing check first.
2. Make it pass.

## Acceptance

```bash
grep -q is_pinned app/Http/Requests/NoteRequest.php
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| (grep) | `app/Http/Requests/NoteRequest.php` | the flag is named | none |

## Invariants

- The flag is optional.

## Risks

- None known.

## Stop Condition

The grep passes.

## Out of Scope

- none

## Verification Log

