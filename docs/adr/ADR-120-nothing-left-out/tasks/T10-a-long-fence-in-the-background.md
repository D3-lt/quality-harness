# Task ADR-120-T10: adr-verify runs a long fence in the background and records it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `adr-verify --background`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A task whose Acceptance runs for an hour is run once, by the tool, in the background, bounded by `fenceTimeout`, and its Verification Log row is written when the run ends, so evidence that took an hour is never re-typed or re-run.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/adr-verify-background.test.mjs` | create | the rows below (0 locks: new) |
| `plugin/bin/adr-verify` | edit | `--background`: start the fence detached with its tree observation and lease, return at once naming the run; the child writes the row and its receipt on exit, exactly as a foreground run would |
| `plugin/skills/adr-execute/SKILL.md` | edit | when to use it, and that the session is told when the row lands |
| `tests/mutations/plugin/bin/adr-verify.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: `--background` on a fence that sleeps then exits 0 returns before the fence ends, and the row appears with exit 0, the fence digest and a receipt; a fence that exits 1 writes exit 1; a tree that changed during the run writes the row as UNPROVEN, not passed; a fence past `fenceTimeout` is killed and written as such; a second `--background` on the same task while one runs is refused with the running id.
2. [S2] Implement the detached child through the existing fence runner (`plugin/lib/fence.py`), reusing the foreground row writer.
3. [S3] Document it in the adr-execute skill. [proof: human: the skill wording, read in the round's review]
4. [S4] Record a killed mutant per mechanism, with catalogue entries, and run `node scripts/mutate.mjs --case 'ADR-120 T10' --no-cache`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \
  && for n in "a background fence run writes the row a foreground run would" \
      "a background run whose tree moved, timed out or overlaps is never recorded as passed"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a background fence run writes the row a foreground run would` | `tests/adr-verify-background.test.mjs` | exit, digest, receipt | — | S1, S2 |
| `a background run whose tree moved, timed out or overlaps is never recorded as passed` | `tests/adr-verify-background.test.mjs` | the twins | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A detached child outlives the session: it holds a lease, is bounded by `fenceTimeout`, and SessionEnd does not wait on it.

## Stop Condition

Stop if the receipt cannot be written from a detached child without weakening ADR-117's writer rule.

## Out of Scope

- Attaching a log produced outside the tool (permanent: boundary: CLAUDE.md §4: evidence is tool-written; a transcribed log is a claim the gate cannot tell from a typed one)

## Verification Log
