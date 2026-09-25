# Task ADR-002-T1: reject a note with no title

**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none
**Status:** done

## Goal

`POST /api/notes` without a title answers 422.

## Affected Files

| File | Change | Why |
|---|---|---|
| `tests/Feature/NoteTest.php` | edit | the feature test |

## Ordered Steps

1. Write the failing feature test first.
2. Add the validation rule.

## Acceptance

This fixture carries neither pnpm nor PHP, so the fence defines two stand-ins that
print their arguments; the sweep then answers the same on every platform. What the
readers judge is the last line: `pnpm --filter` selects a workspace package, not a
test, so the PHP suite beside it runs every test, the row below included.

```bash
pnpm() { echo "pnpm $*"; }
php() { echo "php $*"; }
pnpm --filter @app/web exec vitest run src/x && php artisan test
```

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| `test_a_title_is_required` | `tests/Feature/NoteTest.php` | a missing title is a 422 | none |

## Invariants

- A note always has a title.

## Risks

- None known.

## Stop Condition

The feature test passes.

## Out of Scope

- none

## Verification Log

- 2026-08-20 · no-git · exit 0 · `pnpm() { echo "pnpm $*"; } …` · acceptance-sha256:ec60261ab8d86aa72642d3ccf5d0ccc6a97c2e891c27d1794b4612d8df688804 · ms:4
