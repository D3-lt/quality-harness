# Task ADR-026-T1: Reorder the front door and write two walkthroughs that really ran

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** the captured tutorial output
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A reader who has never seen this project can install it and watch it catch a real
defect within ten minutes, and every transcript they follow was produced by running
the commands rather than written to look plausible.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `README.md` | edit | `## Start here` becomes the second section; the later install block stops repeating it |
| `docs/TUTORIALS.md` | create | the two walkthroughs, with captured output |
| `docs/ONBOARDING.md` | create | first hour, first week, and what to leave alone |
| `docs/BACKLOG.md` | edit | §112 receives the two deferred items this record punts |

## Ordered Steps

1. [S1] Confirm the README check is red against a README missing a shipped skill or gate, so the gate that guards this file is known to work before relying on it. (TDD red.) [proof: acceptance]
2. [S2] Run the tutorial commands against a throwaway repository and capture the real output — including the failure case, where a test is weakened until it cannot fail and the mutation check refuses to call it evidence. [proof: human: the transcripts are copied from a terminal, which no fence can confirm; §112 carries the automated version and says why the cheap form is worse than the gap]
3. [S3] Write the two documents around that captured output, and move `## Start here` to the top of the README. [proof: acceptance]
4. [S4] Confirm the suite still passes, including that the README continues to name every skill and gate the plugin ships. [proof: acceptance]

## Acceptance

```bash
set -o pipefail
node --test tests/package.test.mjs 2>&1 | tee /tmp/adr026-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr026-t1.out \
  && test -s docs/TUTORIALS.md && test -s docs/ONBOARDING.md \
  && grep -q "^## Start here" README.md \
  && grep -q "NOT evidence" docs/TUTORIALS.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the README names every skill and gate this plugin ships` | `tests/package.test.mjs` | restructuring the front page did not drop a shipped surface from it | — | S1, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | both documents are tracked, and the fence asserts they are non-empty |
| 2 — something selects it | `README.md` links both from `## Start here`, which is the second section a reader meets |
| 3 — the caller can discover it | the links are in the install block itself, not in a footer |
| 4 — it is used | not observable from here: this repository has no traffic telemetry, and saying so is better than a proxy that would read like evidence |

## Mutation Log

## Verification Log

## Invariants

- Every transcript in `docs/TUTORIALS.md` was produced by running the command it sits under.
- The README keeps naming every skill and gate the plugin ships; reordering must not drop one.
- The measured costs stay on the front page — the turn ratio and both zero-delta ablation cases — because a reader who finds the losses later trusts the wins less.

## Risks

- The captured output goes stale when a tool's wording changes. The record pins the two OUTCOMES rather than the prose, and §112 carries the automated check with the argument for why the naive form is worse.

## Stop Condition

Stop if the walkthrough cannot be reproduced on a clean checkout — then the tutorial
is wrong rather than merely aging, and shipping it would put a fabricated transcript
in the documentation of a project about not fabricating evidence.

## Out of Scope

- An integration test that re-runs the walkthrough (deferred: docs/BACKLOG.md §112)
- Translation (deferred: docs/BACKLOG.md §112)
