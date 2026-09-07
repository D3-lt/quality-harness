# Task ADR-036-T1: The `asserted` arm is retired, and the rate says what it rests on

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** a `completionClaim` with no `asserted` arm; a `claims-rate` header that names the evidence partition as its basis
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `completionClaim`, `ASSERTION_ARM_WITHDRAWN`

## Goal
No message is classified as having claimed completion, and nothing can restore that arm unnoticed.
The false-success rate is reported from the ledger's evidence kinds, and says so where a reader
meets the number.

⚠ Corrected while executing: the three §124 sentences classify `hedged`, not `none` — read from
`tests/lifecycle.test.mjs`, which has asserted it since the withdrawal. This task was drafted from
§124's prose and said `none`. `hedged` is the right answer: they DO discuss completion, honestly.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | remove the `asserted` arm and turn `ASSERTION_ARM_WITHDRAWN` into a retired-with-reason note citing ADR-036 | the arm is retired, not paused |
| `plugin/scripts/claims-rate.mjs` | the header states the rate rests on the evidence partition, not on a silenced classifier | a zero must not read as "no false success occurred" |
| `tests/lifecycle.test.mjs` | the retirement is asserted, including the three sentences §124 recorded | a removal nothing checks comes back |

## Ordered Steps

1. [S1] Write the failing test FIRST: no input — including plain completion claims — yields
   `asserted`, and the label matches. RED while nothing pins it.
   `[proof: test: tests/lifecycle.test.mjs]`
2. [S2] Turn `ASSERTION_ARM_WITHDRAWN`'s note from "withdrawn pending a measurement" into
   "retired by ADR-036", with the citation.
   `[proof: test: tests/lifecycle.test.mjs]`
3. [S3] Re-word `claims-rate.mjs`'s header to name the evidence partition as the basis.
   `[proof: test: tests/lifecycle.test.mjs]`

## Acceptance

```bash
set -o pipefail
out=$(mktemp)
node --test --test-name-pattern 'asserted arm is retired|completionClaim reads negation|honest final message' tests/lifecycle.test.mjs 2>&1 | tee "$out" && grep -qE '^ℹ pass [1-9]' "$out" && grep -qE '^ℹ fail 0$' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the asserted arm is retired and says so` | `tests/lifecycle.test.mjs` | no input yields `asserted`, the three §124 sentences stay `hedged`, and the label agrees | — | S1, S2, S3 |

## Reachability

The arm is reachable from `Stop` through `completionClaim`; the test calls it directly and the
existing Stop tests cover the advisory path unchanged.

## Stop Condition

If removing the arm changes the Stop advisory for a message that is NOT a completion claim, stop:
the arm was carrying a behaviour this record did not measure, and the retirement needs re-scoping
rather than forcing.

## Out of Scope

Trajectory-level detection, and any change to `hedged`, `limited` or `unavailable`. The ledger,
`claims-rate.mjs`'s buckets and `trajectory-metrics.mjs` are untouched.

## Verification Log

## Invariants

- No classification accuses a message of claiming completion.
- `hedged`, `limited` and `unavailable` keep their meanings.
