# Task ADR-126-T1: A landing's push run is the release's full campaign, and main runs nothing of its own

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `release-evidence` clears a `land/<sha>` push run; the workflow's push trigger is `land/**` only
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The workflow runs the full mutation campaign on every push to `land/**` and runs nothing on a push to `main`;
`release-evidence` reads a `push` run on `land/<its sha>` as a full campaign, and a pull request's run as cached.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/one-run-release.test.mjs` | create | the cases (0 locks: new) |
| `.github/workflows/selftest.yml` | edit | `on.push.branches` (:9); `QUALITY_HARNESS_FULL_CAMPAIGN` (:296) |
| `scripts/release-evidence.mjs` | edit | `evaluateRun`'s cached rule (:101-109); `fetchRun` asks for `headBranch` (:223) |
| `tests/mutations/scripts/release-evidence.mjs.json` | edit | the mechanism's mutant |

## Ordered Steps

1. [S1] Write the failing test and record the red run: a push run on `land/<sha>` is success; a push on any other branch and a
   pull request are cached; the workflow's push trigger names `land/**` alone; its full-campaign switch is true for a push to
   `land/**`.
2. [S2] Change the trigger and the switch; `evaluateRun` reads `headBranch`; `fetchRun` requests it.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/one-run-release.test.mjs 2>&1) \
  && for n in "a push to land/<sha> is a full campaign, and any other push or a pull request is not" \
      "the workflow runs on land pushes, never on a push to main, and every land push is a full campaign"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a push to land/<sha> is a full campaign, and any other push or a pull request is not` | `tests/one-run-release.test.mjs` | `evaluateRun` | — | S1, S2 |
| `the workflow runs on land pushes, never on a push to main, and every land push is a full campaign` | `tests/one-run-release.test.mjs` | the workflow text | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `main` calls `evaluateRun` on the run `fetchRun` returns |
| 3 — the caller can discover it | the SUCCESS line names the run |
| 4 — it is used | `scripts/release.mjs` step 5 |

## Mutation Log

## Invariants

- A run whose campaign may have reused verdicts is never cleared.

## Risks

- `headBranch` absent from an older run's answer: then it is cached, the safe side.

## Stop Condition

Stop if the forge's required checks stop arriving at a sha once main's push run is gone.

## Out of Scope

- The dispatch step in `release.mjs` (T5).

## Verification Log
