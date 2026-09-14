# ADR-053 Tasks

Implementation tasks for ADR-053: A false advisory is not a finding. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |
| 4 | T4 | T3 |
| 5 | T5 | T4 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Compound check then git commit does not accuse unverified | done | none — no spec | `node --test --test-name-pattern 'commit gate does not accuse unverified when this Bash already runs a check then git commit' tests/unread-advice.test.mjs` |
| T2 | A passing mrw --check is a validation for the commit gate | done | none — no spec | `node --test --test-name-pattern 'a passing mrw --check is a validation for the commit gate' tests/unread-advice.test.mjs` |
| T3 | A gitignored Write after a green check does not re-open the commit gate | done | none — no spec | `node --test --test-name-pattern 'a gitignored Write after a green check does not re-open the commit gate' tests/unread-advice.test.mjs` |
| T4 | PostToolUse is silent on a file that is not a QH record | done | none — no spec | `node --test --test-name-pattern 'PostToolUse is silent on a file that is not a QH record' tests/unread-advice.test.mjs` |
| T5 | Swift #expect is a failure call so an expect-only test is not dead | done | none — no spec | `node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- Tests live in `tests/unread-advice.test.mjs` (T1–T4) and `tests/swift-expect.test.mjs` (T5).
- Do not bump `TEST_HASH_REQUIRED_FROM`. Do not edit `tests/test-lock.test.mjs`.
- Hasher `_mask_lock_noncode(..., swift=True)` already keeps `#expect`; T5 is lint `code_only`.
