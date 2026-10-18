# Task ADR-111-T2: A red check is said as red, and no check is one line

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** M (the turn-end judgement, its texts and their tests)
**Owner:** Zy
**Produces:** the red-check lead in R1; the no-check turn-end line
**Consumes:** the rules the Go core lacks, named in the parity tests (T4)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

When the latest check on the current tree failed, R1 says so and that a done claim contradicts it; a turn end that changed
tracked files where no check is known says that once, instead of nothing (ADR-111, Decisions 3 and 4).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/completion-rules.mjs` | edit | `uncheckedWorkReason` leads with the failure when `checkEvent` is `check.failed`; the no-check return emits one R5 line keyed by tree |
| `tests/completion-judgement.test.mjs` | edit | the table's "no check, no finding" property becomes "no check, only the no-check line", with its breaking twin; new tests beside it |
| `tests/hook-goldens.test.mjs` | edit | a new scenario beside the locked ones: a red check, then done; a changed tree with no check, then done |
| `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | a mutant per sentence |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py` on both test files; write the failing tests beside any locked test: after a failed `qh-check` the turn end leads with "the last check on this tree failed"; with no check and a changed tracked file it says the no-check line once per tree, nothing on a second turn end at the same tree, and nothing when nothing changed. Record the red run.
2. [S2] Change `uncheckedWorkReason` and the no-check return; keep every other rule behind the check.
3. [S3] Measure the adopter cost (CLAUDE.md §19): bytes at Stop on a fresh repository with no check and on this repository, before and after. [proof: human: the byte counts and where they were measured]
4. [S4] Record a killed mutant per sentence. [proof: mutation]

## Acceptance

```bash
node --test tests/completion-judgement.test.mjs tests/hook-goldens.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `turn end: a failed check is said as failed, not as unchecked` | `tests/completion-judgement.test.mjs` | the red-check lead | — | S1, S2 |
| `turn end: a changed tree with no known check is said once, and an unchanged one is not` | `tests/completion-judgement.test.mjs` | the no-check line and its twins | — | S1, S2 |
| `a red check then done, and a changed tree with no check then done, are said at the turn end` | `tests/hook-goldens.test.mjs` | both through the hook | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two texts |
| 2 — something selects it | `completionJudgement` at Stop and SubagentStop; the mutants |
| 3 — the caller can discover it | the agent's context at the turn end (ADR-096) |
| 4 — it is used | ADR-112's arms |

## Mutation Log

## Invariants

- No rule that needs a check runs without one; the no-check line is the only output in that case.
- A cut log is never accused (the table's existing property).

## Risks

- The no-check line adds bytes at turn ends in projects that never declare a check; S3 measures it before release.

## Stop Condition

Stop if the no-check line would fire on a turn that changed only untracked or ignored files; that is a different rule.

## Out of Scope

- Refusing a done claim (permanent: boundary: CLAUDE.md §3)

## Verification Log
