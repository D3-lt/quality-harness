# Task ADR-003-T1: the model soft-deletes

**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none

## Goal

`Note` uses `SoftDeletes`.

## Affected Files

| File | Change | Why |
|---|---|---|
| `app/Models/Note.php` | edit | the trait |

## Ordered Steps

1. Add the trait.

## Acceptance

```bash
grep -q SoftDeletes app/Models/Note.php
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| (grep) | `app/Models/Note.php` | the trait is used | none |

## Invariants

- Nothing is hard-deleted.

## Risks

- None known.

## Stop Condition

The grep passes.

## Out of Scope

- none

## Verification Log

(The README above calls T1 done; nothing here backs it. That README claim is the
unbacked one work-next names.)
