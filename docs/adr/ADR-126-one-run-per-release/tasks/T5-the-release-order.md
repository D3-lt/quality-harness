# Task ADR-126-T5: The release order, with a deadline per wait

**Depends-on:** T1, T4
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** `release-evidence` clears a `land/<sha>` push run (T1); `release-evidence --review` (T4)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`release.mjs` lands the candidate, waits for every job of the landing's run (not only the required checks), asks for the
outside runs when `release-evidence` says they are missing, and tags; it dispatches nothing, and every wait has its own deadline.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/release-order.test.mjs` | create | the cases (0 locks: new) |
| `scripts/release.mjs` | edit | steps 3-5 (:155-205); `waitFor`'s deadline (:46-58) |
| `tests/release.test.mjs` | edit | the world helper's runs (a helper; locked bodies relocked only where their truth changes) |
| `CLAUDE.md` | edit | §13 steps 2-7 |
| `.claude/rules/13-releasing.md` | edit | the order |

## Ordered Steps

1. [S1] Write the failing test and record the red run: no `gh workflow run` call; the land run's jobs are waited for; a missing
   outside run exits 2 with the request text; a second wait gets a fresh deadline.
2. [S2] Rewrite steps 3-5 and the deadline; update §13 and its rules file. Relock any locked `tests/release.test.mjs` row whose
   truth changes, with the reason.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/release-order.test.mjs 2>&1) \
  && for n in "release waits for every job of the landing's run and dispatches nothing" \
      "each wait has its own deadline, and a missing outside run is asked for, not waited out"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `release waits for every job of the landing's run and dispatches nothing` | `tests/release-order.test.mjs` | steps 3-4 | — | S1, S2 |
| `each wait has its own deadline, and a missing outside run is asked for, not waited out` | `tests/release-order.test.mjs` | the deadline and the request | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `release()` |
| 3 — the caller can discover it | its log lines |
| 4 — it is used | `node scripts/release.mjs` |

## Mutation Log

## Invariants

- Nothing is tagged on less than `release-evidence`'s SUCCESS.

## Risks

- Locked release tests assert the dispatch; they are relocked with the reason "ADR-126: the landing's run is the campaign".

## Stop Condition

Stop if a locked test's truth changes beyond the dispatch and the main push run.

## Out of Scope

- Messaging peers from a script (permanent: boundary: a script cannot reach another session; it prints the request).

## Verification Log
