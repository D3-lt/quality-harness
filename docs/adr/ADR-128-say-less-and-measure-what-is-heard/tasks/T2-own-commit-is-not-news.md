# Task ADR-128-T2: A session's own commit does not re-send the branch-state line

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (branch-state and its Go twin)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

When the only change since the last delivered branch-state line is HEAD moving by a commit this session's log records it
making, the line is not re-sent; any other change re-sends it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/branch-state.mjs` | edit | the compared text leaves HEAD out on an own commit |
| `tests/branch-state-own-commit.test.mjs` | add | the invariant and its twins |

## Ordered Steps

1. [S1] Write the test: a session commits twice; the brief is said once; a CI change, a fetch, a dirty count and a branch
   switch each re-send it (red today).
2. [S2] Measure before: `node scripts/hook-footprint.mjs <a session transcript>` (2026-10-23: 32 firings, 13,981 chars).
   [proof: human: the before and after counts are in the commit message]
3. [S3] Implement from the event log's own commit record; a log that cannot say re-sends the line (ADR-005).

## Acceptance

```bash
node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a session's own commit does not re-send the line` | `tests/branch-state-own-commit.test.mjs` | the suppression | — | S1, S3 |
| `CI, a fetch, a dirty count or a branch switch re-sends it` | `tests/branch-state-own-commit.test.mjs` | nothing else is suppressed | — | S3 |

## Mutation Log

## Invariants

- A red or unknown CI is said as ADR-094 and ADR-122 decide.

## Risks

- Telling "this session's commit" from "a commit that arrived" needs the log's record, not a sha guess.

## Stop Condition

The event log cannot tell a session's commit from a fetched one: stop and ask.

## Out of Scope

- Other emitters' wording (deferred: ADR-122-T5's after-measurement names the next largest).

## Verification Log
