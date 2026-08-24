# Architecture: quality-harness selftest fixture

**Status:** Living — every ADR that changes structure updates this doc in the same commit.
**Repo:** fixtures/ok
**Tier:** library
**Gate command:** `bash selftest.sh`
**Last full audit:** 2026-07-30 via `/quality-harness:arch-write grill-only`

Known-good positive control for `arch-lint`. Minimal but conforming: a real module map,
every rule section explicitly `None` with a reason, so the gate exercises its parser
rather than a repo's real toolchain.

## Module Map

| Module | Layer | One reason to change | Owner |
|--------|-------|----------------------|-------|
| `ADR-001-selftest.md` | domain | the ADR fixture's shape drifts from adr-lint | ADR-001 |
| `tasks` | domain | the task fixture's shape drifts from adr-lint | ADR-001 |

## Dependency Contracts

None — fixture has no import graph.

## Concept Ownership (DRY)

None — fixture owns no shared concept.

## Composition Root

None — fixture constructs nothing.

## Test Doubles

None — fixture uses no fakes.

## Trust & Data Boundaries

None — fixture handles no data.

## Superseded

None yet
