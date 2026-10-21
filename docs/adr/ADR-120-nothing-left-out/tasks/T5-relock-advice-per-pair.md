# Task ADR-120-T5: The relock advice once per check pair

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** one §390 advice line per (from, to) check pair
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

One change to a declared check, relocked across many tasks, is advised once with the tasks it covers, not once per task
(BACKLOG §392).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/test-lock.test.mjs` | edit | new tests beside :2555-2580 (0 locks, from `python3 scripts/test-locks.py tests/test-lock.test.mjs` on 2026-10-21) |
| `plugin/bin/adr-lint` | edit | `check_test_lock` (:2956-2983) groups the move by pair |
| `plugin/lib/record.py` | edit | `lock_findings` (:4152-4164) returns the pair with the move, so the caller can group it |
| `tests/mutations/plugin/bin/adr-lint.json` | edit | one entry for the grouping |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: three done tasks relocked under one (from, to) pair print one §390 line naming all three; two pairs print two lines; a single task keeps today's per-task line.
2. [S2] Return the pair from `lock_findings` beside its message, and group in `check_test_lock` before `errors.advise`.
3. [S3] Record a killed mutant on the grouping, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/test-lock.test.mjs 2>&1) \
  && for n in "one check change relocked across tasks is advised once, naming them" \
      "two check changes are advised once each" \
      "a relock that moved the check binding passes done and names the move"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `one check change relocked across tasks is advised once, naming them` | `tests/test-lock.test.mjs` | the grouping | — | S1, S2 |
| `two check changes are advised once each` | `tests/test-lock.test.mjs` | the twin | — | S1, S2 |
| `a relock that moved the check binding passes done and names the move` | `tests/test-lock.test.mjs` | today's single-task line, unchanged | — | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `check_test_lock` on every done task |
| 3 — the caller can discover it | adr-lint's advice |
| 4 — it is used | every corpus lint |

## Mutation Log

## Invariants

- The move stays advice (`errors.advise`), never an error.
- `adr-next` and `record.py:4251` keep calling with `advise=False`.

## Risks

- A grouping across records hides which record a task is in: each task is named with its file.

## Stop Condition

Stop if two tasks with one pair need different actions: the per-task line is then the right one.

## Out of Scope

- Grouping other advice kinds (permanent: boundary: §392 measured this one form; another repeats only on its own evidence)

## Verification Log
