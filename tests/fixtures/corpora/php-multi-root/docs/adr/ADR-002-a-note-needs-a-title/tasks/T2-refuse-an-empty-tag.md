# Task ADR-002-T2: refuse an empty tag

**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none
**Status:** done

## Goal

`php artisan notes:tag` with no tag exits 1 and says why.

## Affected Files

| File | Change | Why |
|---|---|---|
| `composer.json` | edit | the console command's package |

## Ordered Steps

1. Run the command with no tag.
2. Watch it refuse.

## Acceptance

**Acceptance is human-observed:** a maintainer runs `php artisan notes:tag` with no tag
on a staging host and sees it exit 1 with a refusal.

## Tests

| Test name | File | Verifies | Covers |
|---|---|---|---|
| (human-observed) | — | the refusal | none |

## Invariants

- An empty tag is never stored.

## Risks

- None known.

## Stop Condition

The refusal is seen.

## Out of Scope

- none

## Verification Log

- 2026-08-21 · human-observed · a maintainer verified on staging: `php artisan notes:tag` with no tag -> exit 1 'refusing an empty tag'
