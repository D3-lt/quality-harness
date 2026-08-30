# Task ADR-001-T1: the code and its tests live in a sibling repository

**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none

## Goal

A task whose implementation lands in another repository, named by a relative path.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `../sibling_repo/src/guard.php` | edit | lands in the sibling repo |

## Ordered Steps

1. Write the failing test first, in the sibling repository.
2. Then the rest.

## Acceptance

```bash
true
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `test_the_sentinel_is_refused` | `../sibling_repo/tests/Unit/GuardTest.php` | the guard refuses it | — |
| `test_a_second_row_same_file` | `../sibling_repo/tests/Unit/GuardTest.php` | and admits the other | — |

## Invariants

- A path leaving this repository is unproven here, never disproven.

## Risks

- None; fixture.

## Stop Condition

Stop if the gate reports absence rather than inability.

## Out of Scope

- Everything else. (permanent: fixture.)

## Verification Log

- 2026-08-30 · no-git · exit 0 · `true` · acceptance-sha256:0000000000000000000000000000000000000000000000000000000000000000

## Mutation Log
