# Task ADR-121-T7: A diff is checked against what Accepted records decided

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `qh decisions-check`
**Consumes:** the contracts of T1 (ADR-121 Inter-task Contracts)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A diff is checked, by rules only, against what Accepted records decided: a changed literal that a record states as a
value (a timeout, a bound, a count it fixed), and the return of an approach a record lists under Alternatives Considered
as rejected. Each finding quotes the record's line and the diff's line, errs towards silence, and is advice only; its
precision is measured on this repository's history before it advises anyone.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/decisions-check.test.mjs` | create | the rows below, on temporary repositories (0 locks: new) |
| `core/hooks/decisions.go` | create | the record reader (Decision and Alternatives sections), the diff matcher, the quoting |
| `core/cmd/qh/main.go` | edit | `qh decisions-check` |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a record deciding "the budget is 30 s" and a diff changing that constant from 30 to 60 in the governed file gets one finding quoting both lines; a diff changing an unrelated 30 gets none; a diff reintroducing a name a record's Alternatives Considered rejected gets one finding; a branch whose own new record decided the change gets none (the record at the merge base is read, not the branch's); a Proposed or Superseded record is never read.
2. [S2] Implement the reader and matcher in Go.
3. [S3] Run it over this repository's last 200 commits and record precision (findings a reader confirms over findings made) in the record before T7 advises anywhere. [proof: human: the owner reads the measured precision]
4. [S4] Record a killed mutant per mechanism. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/decisions-check.test.mjs 2>&1) \
  && for n in "a changed value a record decided is named, quoting both" \
      "a branch's own new record and an unrelated literal are silent"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a changed value a record decided is named, quoting both` | `tests/decisions-check.test.mjs` | the value and rejected-alternative rules | — | S1, S2 |
| `a branch's own new record and an unrelated literal are silent` | `tests/decisions-check.test.mjs` | the twins, the merge-base read | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `qh decisions-check`, then the watcher at commit once S3's precision is accepted |
| 3 — the caller can discover it | the command and its advice text |
| 4 — it is used | commits in a repository with Accepted records |

## Mutation Log

## Invariants

- Advice only: it never refuses (CLAUDE.md §3).
- Only Accepted records are read, at the merge base.

## Risks

- False positives train readers to ignore it: S3 measures precision first, and it stays off until the owner accepts the number; what the test doubles do not model: a record whose decided value is stated in prose rather than as a literal.

## Stop Condition

Stop if S3's precision is below what the owner accepts: the rule set is narrowed before anything ships.

## Out of Scope

- A model-based reading of records (permanent: boundary: rules only, as the parent record decides for monitors)

## Verification Log
