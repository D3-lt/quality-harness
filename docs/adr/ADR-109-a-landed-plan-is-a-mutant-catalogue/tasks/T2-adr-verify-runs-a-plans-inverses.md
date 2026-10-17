# Task ADR-109-T2: adr-verify runs a landed plan's inverses, and breaks its invariants, as mutants

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one arm beside --mutant-plan, reusing its parser and transaction)
**Owner:** unassigned
**Produces:** `adr-verify --inverse <plan>` and `adr-verify --break-invariants <plan>`
**Consumes:** the counts in Follow-ups (T1); `--mutant-plan`'s parser and restore transaction (ADR-107)
**Proof map:** v1

## Goal

For a plan that has landed, run each hunk's inverse as a mutant through the existing transaction, record each as killed or
survived in the Mutation Log, and restore the tree; and for each of the task's `## Invariants` that names a site the plan
touched, run the inverse of those sites together and report the invariant `unguarded` when the fence stays green, `unread`
when it names nothing the plan touched (ADR-109, Decisions 2, 3 and 4).
survived in the Mutation Log, and restore the tree (ADR-109, Decisions 2 and 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the `--inverse <plan>` arm: parse with `--mutant-plan`'s reader; refuse a plan that has not landed; per hunk, restore the original lines in the transaction, run the fence, classify, record, restore |
| `tests/inverse-plan.test.mjs` | add | the test below |
| `tests/mutations/plugin/bin/adr-verify.json` | edit | the catalogue mutants |
| `plugin/skills/adr-execute/SKILL.md` | edit | one paragraph beside `--mutant-plan` |

## Ordered Steps

1. [S1] Add the test below and record the red run.
2. [S2] Implement `--inverse`; a plan whose hunk body is not at its address is refused as not landed, before any fence runs.
3. [S3] Implement `--break-invariants`: resolve each `## Invariants` bullet's backticked names through adr-lint's existing resolver to the plan's hunks; an invariant with no resolved site is `unread`; one with sites runs their inverses together and is `unguarded` on a green fence, `guarded` on a red one. Each verdict is one Mutation Log row naming the bullet.
4. [S4] Add the catalogue mutants (a survivor recorded as killed; a hunk left restored after exit; a not-landed plan run; an invariant with no resolved site reported unguarded) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/inverse-plan.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a landed plan's inverses are run one at a time, a survivor is named by its address, and the tree is restored")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a landed plan's inverses are run one at a time, a survivor is named by its address, and the tree is restored` | `tests/inverse-plan.test.mjs` | through the CLI on a fixture: a two-hunk plan where the fence sees one hunk gives one killed row and one survived row naming the address, exit 1; every file is byte-identical after; a plan that has not landed is refused with nothing run or written; a plan whose every hunk is seen exits 0 | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the arm |
| 2 — something selects it | `--inverse` on the command line |
| 3 — the caller can discover it | `--help` and the adr-execute skill |
| 4 — it is used | the test drives the CLI |

## Mutation Log

## Invariants

- No third plan reader: the arm imports `--mutant-plan`'s parser.
- The source is never left mutated after exit (the transaction's `finally`, ADR-002).

## Risks

- None beyond ADR-109's.

## Stop Condition

Stop and ask if `--mutant-plan`'s transaction cannot hold several sequential mutations of one file in one run.

## Out of Scope

- Generated variants (permanent: boundary: ADR-109 alternative (a))

## Verification Log
