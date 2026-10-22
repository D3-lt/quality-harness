# ADR-126 Tasks

Implementation tasks for ADR-126: a release is one landing and one CI run, and a test sets every budget it depends on.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Task Index

| ID | Title | Status | Depends-on | Covers | Acceptance |
|----|-------|--------|------------|--------|------------|
| [T1](T1-one-run-per-release.md) | A landing's push run is the release's full campaign, and main runs nothing of its own | done | none | none — no spec | `node --test tests/one-run-release.test.mjs`, named tests |
| [T2](T2-coverage-in-two-jobs.md) | The coverage floor is two parallel jobs | pending | none | none — no spec | `node --test tests/coverage-split.test.mjs`, named tests |
| [T3](T3-the-suite-sets-its-budgets.md) | Every runner of the suite sets the budgets its tests depend on | done | none | none — no spec | `node --test tests/suite-budgets.test.mjs`, named tests |
| [T4](T4-evidence-after-the-landing.md) | Before the landing only the review stops a release; after it an attestation is evidence | pending | none | none — no spec | `node --test tests/evidence-after-landing.test.mjs`, named tests |
| [T5](T5-the-release-order.md) | The release order, with a deadline per wait | pending | T1, T4 | none — no spec | `node --test tests/release-order.test.mjs`, named tests |
| [T6](T6-a-windows-check.md) | land names the Windows check once land/<sha> is pushed | pending | none | none — no spec | `node --test tests/windows-check.test.mjs`, named tests |

## Waves

| Wave | Tasks | Why together |
|------|-------|--------------|
| 1 | T1, T2, T3, T4, T6 | independent: each touches its own mechanism |
| 2 | T5 | consumes T1's run verdict and T4's `--review` |
