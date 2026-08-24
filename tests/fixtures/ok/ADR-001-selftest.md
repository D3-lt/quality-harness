# ADR-001: Verify the toolkit gates run after transfer

**Status:** Accepted
**Date:** 2026-07-30
**Owner:** toolkit selftest
**Spec:** spec-selftest.md
**Cross-references:** none
**Served-path change:** None — this ADR changes only measurement or tooling.

## Context

The packaged gates must actually execute on a fresh machine. This fixture is a
known-good artifact set: `adr-lint` exiting 0 here proves the linter parses and
accepts a conforming ADR + task pair under the target Python.

## Existing Primitives Audit

None — fixture only.

## Decision

Ship one conforming ADR, one conforming task file, and a derived tasks README as
the positive control of `selftest.sh`.

## Alternatives Considered

- **Template-only smoke test:** run gates on the shipped templates. Rejected because templates are placeholder-filled and fail by design, so they only exercise the failure path.

## Component / Boundary Impact

None — internal to the toolkit package.

## Wiring & Contract Changes

None — implementation-internal only

## Inter-task Contracts

None

## Implementation

Single inline task, see `tasks/T1-fixture.md`.

## Consequences

- **Positive:** transfer failures surface at install time, not mid-ADR.
- **Negative:** fixture must be updated when gate grammars change.
- **Neutral:** fixture lives outside any real ADR corpus.

## Out of Scope

- Verifying skill-body behavior (only the executable gates are testable) (permanent: prose skills have no exit code)
- Windows path support (deferred: re-check when a non-POSIX target appears)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Gate grammar drifts and the fixture goes stale | Med | Low | selftest failure names the gate |

## Rollback

None — no persistent state.

## Follow-ups
