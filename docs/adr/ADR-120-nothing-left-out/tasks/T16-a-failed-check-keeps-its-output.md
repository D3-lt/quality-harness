# Task ADR-120-T16: A failed check keeps the tail of its output

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `<state dir>/outputs/<run id>.log` and the ledger row's `output` field
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A `qh-check` run that does not pass keeps the tail of its combined output, bounded, beside its ledger row, so a failure seen
once under load can be read afterwards; a pass keeps nothing.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/check-output.test.mjs` | create | the rows below (0 locks: new) |
| `plugin/scripts/qh-check.mjs` | edit | keep a bounded ring of the run's output lines while it streams |
| `plugin/scripts/check-record.mjs` | edit | `recordRun` (:121-139) writes the tail to `outputs/<id>.log` for a non-pass and names it in the row's `output` field; prunes to the newest 50 |
| `plugin/scripts/ledger-guard.mjs`, `core/hooks/ledger_guard.go` | edit | the refusal text names `outputs/` among the state directory's tool-written files |
| `tests/mutations/plugin/scripts/check-record.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a declared check that prints 1,000 lines then exits 1 leaves `outputs/<id>.log` holding the last 400 lines, named by the row's `output`; one that exits 0 leaves no file and no field; a timed-out run keeps its tail; output past 256 KB is cut at a line; the 51st kept file removes the oldest; the row is written even when the output file cannot be.
2. [S2] Implement the ring buffer, the write and the prune.
3. [S3] Add `outputs/` to the ledger guard's text, Node and Go.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \
  && for n in "a failed check keeps the tail of its output, named by its row" \
      "a passing check keeps no output, and the kept files stay bounded"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a failed check keeps the tail of its output, named by its row` | `tests/check-output.test.mjs` | the tail, the field, a timed-out run, the row without the file | — | S1, S2 |
| `a passing check keeps no output, and the kept files stay bounded` | `tests/check-output.test.mjs` | no file on a pass, the size cut, the prune | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `recordRun` on every non-pass |
| 3 — the caller can discover it | the row's `output` field; qh-check names the file when it fails |
| 4 — it is used | every failed check in an adopter's repository |

## Mutation Log

## Invariants

- A passing run's record is byte-for-byte what it is today.
- Nothing under the state directory is tracked or leaves the machine.

## Risks

- A check that prints a secret keeps it on disk in the state directory: it is the same output the terminal showed, kept locally under the repository's git directory, never tracked; what the test doubles do not model: a check that writes to the terminal directly rather than to its stdout or stderr.

## Stop Condition

Stop if `qh-check` cannot read the check's output without changing what the terminal shows.

## Out of Scope

- Keeping a passing run's output (permanent: boundary: a pass needs no diagnosis, and keeping every run's output is a disk cost with no reader)

## Verification Log
