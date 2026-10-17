# Task ADR-108-T1: A check that could not start says what to do

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one arm's sentence, one test)
**Owner:** unassigned
**Produces:** the could-not-start sentence in `uncheckedWorkReason`
**Consumes:** none
**Proof map:** v1

## Goal

At turn end, when the latest check on this turn's work was recorded `unstarted`, `timeout` or `unproven`, the finding
names which, and says to report it as `EVIDENCE-LIMITED: <reason>` with the check's own output and not to run the check
again on the same tree (ADR-108, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/completion-rules.mjs` | edit | `uncheckedWorkReason`'s `couldNotLook` arm gets the verdict and the instruction; `completionFacts` passes which verdict it read (`lastCheck.verdict` is already there) |
| `tests/adr-108.test.mjs` | add | the test below |
| `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | the catalogue mutants |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the finding after an `unstarted` check still says only to run `qh-check`).
2. [S2] In `uncheckedWorkReason`, when `couldNotLook` and the verdict is known, say: `the latest qh-check on this turn's work <did not start | timed out | could not be proven to have run> (<verdict>). Report it as EVIDENCE-LIMITED: <what it printed> in your final message and do not run it again on this tree; if it cannot start on an unmodified tree the finding is about this machine, and declaring the real command as check in .quality-harness.json is the fix.` Keep every other arm's text byte-identical.
3. [S3] Add the catalogue mutants (the instruction dropped; the verdict not named) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a check that could not start is reported once as evidence-limited, not run again")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a check that could not start is reported once as evidence-limited, not run again` | `tests/adr-108.test.mjs` | through the real Stop hook, in a temp repository whose declared `check` is a command that does not exist (exit 127): after a write and a `qh-check` recorded `unstarted`, the Stop finding names `unstarted`, says `EVIDENCE-LIMITED` and "do not run it again"; dirty twins: a check that ran and FAILED keeps today's sentence byte-identical, and a tree with no check at all keeps today's sentence | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the sentence in `uncheckedWorkReason` |
| 2 — something selects it | the `couldNotLook` arm, from `lastCheck.verdict` |
| 3 — the caller can discover it | the Stop hook's `additionalContext` |
| 4 — it is used | the test drives the real hook |

## Mutation Log
- 2026-10-17 · e5d4769e* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · the could-not-start finding no longer says not to run the check again · acceptance-sha256:963c185927a37ac2bd82a95884047494738350e9d0870edb8404fb168dd1dcb7

## Invariants

- Every other arm of `uncheckedWorkReason` prints byte-identical text (the hook goldens stay green).
- `completionJudgement` reaches no file (`tests/pure-judges.test.mjs`).

## Risks

- None beyond ADR-108's.

## Stop Condition

Stop and ask if `lastCheck.verdict` is not available where `uncheckedWorkReason` is built.

## Out of Scope

- A check that ran and failed (permanent: boundary: a failure is a finding about the work, and ADR-060 re-opens R1 on it by design)

## Verification Log
- 2026-10-17 · e5d4769e* · exit 1 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:963c185927a37ac2bd82a95884047494738350e9d0870edb8404fb168dd1dcb7 · ms:1377 · test-lock-sha256:9070d623b714f0dc57c35659e0372b695f4df2a9c36152eaf91a78b9b73164a3 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgY291bGQgbm90IHN0YXJ0IGlzIHJlcG9ydGVkIG9uY2UgYXMgZXZpZGVuY2UtbGltaXRlZCwgbm90IHJ1biBhZ2FpbgkxNjZiMGM5Y2FhNTU2ZWY4MThhYjNmYWFhYWQ2ZjA0NGJlNTRhNmFjMDQwZDQyZjIyNGM1NGNlNWUyMDAzMzlj
  ```
  ```
- 2026-10-17 · e5d4769e* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:963c185927a37ac2bd82a95884047494738350e9d0870edb8404fb168dd1dcb7 · ms:2624
- 2026-10-17 · e5d4769e* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:963c185927a37ac2bd82a95884047494738350e9d0870edb8404fb168dd1dcb7 · ms:0 · test-lock-sha256:7947e7d98641bccc4c08bed801781aeff8ecc4539acd92157a6e483560b934d2 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgY291bGQgbm90IHN0YXJ0IGlzIHJlcG9ydGVkIG9uY2UgYXMgZXZpZGVuY2UtbGltaXRlZCwgbm90IHJ1biBhZ2FpbgllZjdmZTQ1Y2QxMmFmYWVmMDUxYjMyNjEyODdhMjUxNmVjNGQ1M2IwZTFmMzhkNjhkNGIyNDc4ODE0NzVkYzk3 · test-lock-kind:replace
- 2026-10-17 · e5d4769e* · exit 1 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:963c185927a37ac2bd82a95884047494738350e9d0870edb8404fb168dd1dcb7 · ms:979
  ```
  ```
- 2026-10-17 · e5d4769e* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:963c185927a37ac2bd82a95884047494738350e9d0870edb8404fb168dd1dcb7 · ms:2529
