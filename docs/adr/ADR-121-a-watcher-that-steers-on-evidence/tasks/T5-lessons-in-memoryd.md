# Task ADR-121-T5: Proven lessons go to memoryd; mrw writes become visible

**Depends-on:** T1, T3
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** lesson memories; mrw receipts as `file.written`
**Consumes:** the contracts of T1, T3 (ADR-121 Inter-task Contracts)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A finding acted on and followed by a pass becomes an anchored lesson in the project's memoryd space; SessionStart recalls the lessons for the paths a session is likely to touch; mrw's `--json` receipt feeds `file.written` for every path an mrw write touched.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/lessons.test.mjs` | create | T5's mechanism |
| `core/hooks/lessons.go` | create | T5's mechanism |
| `plugin/scripts/hook-record.mjs` | edit | T5's mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run, against a memoryd test double and mrw receipts captured from the real binary: an acted-and-passed finding writes one lesson with the rule, the paths and an anchor; a second identical one is attested, not duplicated; SessionStart names the lessons for touched paths; an mrw receipt naming two paths records two `file.written` rows; with memoryd absent, nothing is written and that is said once.
2. [S2] Implement the writer, the recall at SessionStart and the receipt reader.
3. [S3] What the memoryd double does not model is named in Risks. [proof: human: read in review]
4. [S4] Record a killed mutant per mechanism. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/lessons.test.mjs 2>&1) \
  && for n in "an acted and passed finding becomes one anchored lesson" \
      "an mrw receipt makes every written path visible"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an acted and passed finding becomes one anchored lesson` | `tests/lessons.test.mjs` | the writer | — | S1, S2 |
| `an mrw receipt makes every written path visible` | `tests/lessons.test.mjs` | the receipt reader | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or watcher path that calls it |
| 3 — the caller can discover it | `qh nudges`, the finding text, the record |
| 4 — it is used | every session once T3 ships |

## Mutation Log

## Invariants

- With no watcher running, every hook answers exactly as before this record.
- The sanctioned refusals are unchanged.

## Risks

- See the parent record's Risks.

## Stop Condition

Stop if memoryd's local socket requires credentials a hook cannot hold.

## Out of Scope

- See the parent record (permanent: boundary: the parent record's Out of Scope applies to every task)

## Verification Log
