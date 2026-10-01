# Task ADR-080-T2: Every hook but a reviewer's imports the pass's verdicts and says each finding once

**Depends-on:** T1
**Covers:** F-5, F-6, UC2-S1, UC2-S2
**Estimated scope:** S (one import-and-say step, two tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** the `pass.gated` ledger line (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a finding is said by the next hook`, `a reviewer's PreToolUse does not import`

## Goal

Every lifecycle hook except a read-only reviewer's PreToolUse imports the pass's new verdicts and says each finding once, whether or not the pass has ended (ADR-080 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | an import-and-say step in `handleHook`, after `guardAlone` is decided and only when it is false |
| `tests/artifact-pass-behind.test.mjs` | edit | remove `todo` from this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the two tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] In `handleHook`, when `guardAlone` is false, import `pass.gated` lines not yet in the session log as `artifact.gated` naming the pass, and queue each finding as rule A keyed by path and identity.
3. [S3] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/artifact-pass-behind.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE "ok [0-9]+ - (a pass's findings reach the next hook once, while the pass still runs|a read-only reviewer neither imports nor delivers a pass finding)" "$T")" -eq 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a pass's findings reach the next hook once, while the pass still runs` | `tests/artifact-pass-behind.test.mjs` | said by the next hook while the lock is held; not by the one after | F-5, UC2-S1 | S2 |
| `a read-only reviewer neither imports nor delivers a pass finding` | `tests/artifact-pass-behind.test.mjs` | the reviewer is told nothing and writes nothing; the parent's next hook says it | F-6, UC2-S2 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | the step in `handleHook` |
| 3 — the caller can discover it | the rule A line the session sees |
| 4 — it is used | every adopter session after a pass with findings |

## Mutation Log

## Invariants

- A finding is said once per path and identity (`action.emitted`, rule A).
- A read-only reviewer's PreToolUse reads and writes nothing of the parent's.

## Risks

- None beyond T1's.

## Stop Condition

Stop and ask if delivering needs the pass to write the session log.

## Out of Scope

- The pass itself — T1.

## Verification Log
