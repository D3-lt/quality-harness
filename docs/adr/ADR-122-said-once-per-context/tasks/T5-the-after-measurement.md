# Task ADR-122-T5: The after-measurement and the release note

**Depends-on:** T1, T3, T4
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the before-and-after counts and the release note's text
**Consumes:** `scripts/hook-footprint.mjs` (T1); generation-aware `emittedFor` and every emitter routed (T3); one channel per recipient (T4)
**Data dependency:** needs a recorded session on this machine before and after the change (the same kind of work, at least one compaction each) for S2; the fence is hermetic
**Proof map:** v1

## Goal

The outside session's transcript method, re-run over a session before and after this record, says how much hook text an
adopter's session carries now, and the release note states it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/hook-footprint.test.mjs` | edit | an after-fixture: a synthetic session through the routed hooks carries each item once per context (a new test beside T1's) |

## Ordered Steps

1. [S1] Write the failing test and record the red run: a synthetic session driven through the routed hooks (two contexts
   split by a compaction, the same advisory on three trees, the same brief on five prompts) counts each item once per context
   in `scripts/hook-footprint.mjs`'s output.
2. [S2] Run `scripts/hook-footprint.mjs` over a recorded session before and after, and record, by item and channel, the
   firings and characters, and the median `durationMs` per hook firing against T1's baseline (the transcript records it per
   hook run, so the before figure exists for every recorded session). [proof: human: the person compares the two printed tables, and the sign-off records each session's prompt, tool-call and compaction counts, the plugin versions and the medians, never content]
3. [S3] Write the release note's sentence from S2's numbers, dated and named by what they were measured on. [proof: human: the owner reads the sentence beside S2's sign-off before the release]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/hook-footprint.test.mjs 2>&1) \
  && n="a routed session carries each item once per context" \
  && test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a routed session carries each item once per context` | `tests/hook-footprint.test.mjs` | the routed hooks, counted by T1's method | — | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new test |
| 2 — something selects it | the routed hooks of T3 and T4 |
| 3 — the caller can discover it | the release note |
| 4 — it is used | the outside run (CLAUDE.md §18) |

## Mutation Log
- 2026-10-22 · 149b136e* · mutant killed · exit 1 · `plugin/scripts/branch-state.mjs` · the brief is said again whenever the dirty count moves · acceptance-sha256:fd58a53edd8514a06ee968470be9777a65a1fb8d96498c4a5c61765977a52463

## Invariants

- No transcript or figure from another repository's corpus is committed (CLAUDE.md §6).

## Risks

- Two sessions are never the same work: the sign-off says what each was, and the comparison is per firing as well as in total.
- What the test doubles do not model: the synthetic session; S2 meets real ones.

## Stop Condition

Stop if the median added cost per firing is above 0.10 s (a branch-state cache hit, measured 2026-09-26, BACKLOG §301), or if
the after-session's total hook text is not lower than the before-session's per prompt: the scan then costs more than it saves,
and the owner decides.

## Out of Scope

- The release itself (CLAUDE.md §13), and the outside run (CLAUDE.md §18).

## Verification Log
- 2026-10-22 · 149b136e* · exit 1 · `out=$(node --test --test-reporter=tap tests/hook-footprint.test.mjs 2>&1) \ …` · acceptance-sha256:fd58a53edd8514a06ee968470be9777a65a1fb8d96498c4a5c61765977a52463 · ms:330 · test-lock-sha256:3ab5a32388eb88bbb4df286ec830ced868977e206f4b4476ac1f141383321d36 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvaG9vay1mb290cHJpbnQudGVzdC5tanMJYSByb3V0ZWQgc2Vzc2lvbiBjYXJyaWVzIGVhY2ggaXRlbSBvbmNlIHBlciBjb250ZXh0CTc1YmNjMDNmNzgyNDNmOWI0ZTExOTM1MTdkYzQ5M2MyZTUzN2M2NmRiNDA3MzEzMWQzMDM3OWQ0YzU1NmIyZmQKYm9keQl0ZXN0cy9ob29rLWZvb3RwcmludC50ZXN0Lm1qcwlhIHRvb2wgcmVzdWx0IHF1b3RpbmcgaG9vayB0ZXh0IGlzIG5vdCBob29rIG91dHB1dAllNDFjN2E4MTk0YjkwZTcxYTllZDFkMTE0ZjgwY2IzMmJiMmYwNzliZWY0Y2Y5OWI0M2RlNDQ3Y2VmYTE4MDlmCmJvZHkJdGVzdHMvaG9vay1mb290cHJpbnQudGVzdC5tanMJYW4gdW5wYXJzZWFibGUgdHJhbnNjcmlwdCBsaW5lIGlzIGNvdW50ZWQgYXMgdW5yZWFkYWJsZQkwNTZhOWJjYjkxYTc2YzYyYTc0MTY5NzM0ODU0NGYyZGExMDgwZTRmNmI3YWExODE3ZDJhYzQzYWJkYzljYjVhCmJvZHkJdGVzdHMvaG9vay1mb290cHJpbnQudGVzdC5tanMJaG9vay1mb290cHJpbnQgY291bnRzIHRoaXMgcGx1Z2luJ3MgaG9vayB0ZXh0IGJ5IGl0ZW0gYW5kIGNoYW5uZWwJZTcxYTc1YjczODJkYWUyMTMzMTc5MWJlODFjM2YwMTM5ZjM0ZTYwMDY0Mjk1N2Y0OTMyNzYyZTYzZmI4YTM0Yw
  ```
  ```
- 2026-10-22 · 149b136e* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-footprint.test.mjs 2>&1) \ …` · acceptance-sha256:fd58a53edd8514a06ee968470be9777a65a1fb8d96498c4a5c61765977a52463 · ms:284
