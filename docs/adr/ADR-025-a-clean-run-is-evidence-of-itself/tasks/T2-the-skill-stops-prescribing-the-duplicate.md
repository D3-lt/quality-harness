# Task ADR-025-T2: Stop prescribing the run the mutation pass already takes

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** the merged `--mutant` invocation writing both logs (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`adr-execute` says that a pass which records a mutation has already recorded its verification entry,
so the saving T1 makes available is actually taken.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/skills/adr-execute/SKILL.md` | edit | step 4 prescribes a separate `adr-verify <task>` run; that is the duplicate, and prose is what causes it |
| `tests/package.test.mjs` | edit | the skill-content check reads this file, and a claim about a shipped skill needs a check that fails when the sentence goes |

## Ordered Steps

1. [S1] Write the failing assertion first: the shipped `adr-execute` skill states that a `--mutant` pass records the verification entry. Confirm red against the current text. (TDD red.)
2. [S2] Rewrite step 4 to say it: when the task's mutation is being recorded in the same pass, the `--mutant` invocation IS the validate run, and a second `adr-verify <task>` is a re-run of the same fence on the same bytes. [proof: acceptance]
3. [S3] Keep the separate run prescribed where it is still needed — a task with no mutation to record, and the Red step, which is taken on a different tree and can never share an execution. Name both, or the advice reads as "stop validating". [proof: acceptance]
4. [S4] Re-run `adr-lint` over this record and confirm the ADR-level checks still pass with both tasks present. [proof: acceptance]

## Acceptance

```bash
set -o pipefail
node --test tests/package.test.mjs 2>&1 | tee /tmp/adr025-t2.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr025-t2.out \
  && python3 plugin/bin/adr-lint docs/adr/ADR-025-a-clean-run-is-evidence-of-itself.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-execute says the mutation pass records the verification entry` | `tests/package.test.mjs` | the shipped skill carries the guidance, and the Red exception with it | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test above reads the shipped file |
| 2 — something selects it | the skill IS what an executing agent loads; `tests/package.test.mjs` already asserts the skill ships |
| 3 — the caller can discover it | it is step 4 of the skill an agent follows to execute a task |
| 4 — it is used | fence executions per task drop from 5.5 toward 3.7, measurable by the same count in `docs/BACKLOG.md` §111 re-run over the corpus |

## Mutation Log

## Invariants

- The skill never advises skipping a verification entry — only skipping a second invocation that would produce an identical one.
- The Red step keeps its own run. It is taken on a different tree and sharing it would be a claim about bytes that were never executed.

## Risks

- Prose that reads as "you can skip validating" would remove a check rather than a duplicate. S3 exists for that, and names the two cases where the separate run stays.

## Stop Condition

Stop if T1's entry turns out not to be interchangeable with the plain path's — then the skill must
keep prescribing both runs, and this task is wrong rather than incomplete.

## Out of Scope

- The gate behaviour itself, which is T1
- Fence scoping advice, which is already in the task template
