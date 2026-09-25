# Task ADR-001-T2: the admin form sets the flag

**Depends-on:** none
**Covers:** none — no spec
**Produces:** the admin form submits `is_pinned`
**Consumes:** the API accepts `is_pinned` on create and update (T1)

## Goal

the admin form sets the flag.

## Affected Files

| File | Change | Why |
|---|---|---|
| `resources/views/notes/form.blade.php` | edit | the admin form sets the flag |

## Ordered Steps

1. Write the failing check first.
2. Make it pass.

## Acceptance

```bash
grep -q is_pinned resources/views/notes/form.blade.php
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| (grep) | `resources/views/notes/form.blade.php` | the flag is named | none |

## Invariants

- The flag is optional.

## Risks

- None known.

## Stop Condition

The grep passes.

## Out of Scope

- none

## Verification Log

