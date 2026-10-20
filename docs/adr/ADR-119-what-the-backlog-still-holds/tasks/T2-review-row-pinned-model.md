# Task ADR-119-T2: A review row says the model the launcher pinned

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `reviews.jsonl` rows with the pinned `model`, `bound` and `reportedModel`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A review row records the model the launcher pinned with `-m`, keeps a printed model that differs as `reportedModel`, and
writes `bound` as `pinned`, `disagrees` or `unproven`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/host-review.test.mjs` | edit | new rows for a printed model that differs from the pin, and for a host with no pin; :15 and :52 assert `reported` today and move to the new vocabulary (0 locks) |
| `tests/review-ledger.test.mjs` | edit | one new test beside the 11 ADR-100 T1 locks, whose bodies stay byte-identical |
| `plugin/scripts/host-review.mjs` | edit | `reviewFromOutput` (:58-64) keeps the pinned model; the rows at :242 and :256 write `bound` and `reportedModel` |
| `tests/mutations/plugin/scripts/host-review.mjs.json` | edit | one catalogue entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a Codex run pinned to `CODEX_MODEL` whose output prints another model records `model: CODEX_MODEL`, `reportedModel` the printed one and `bound: disagrees`; one printing the pinned model records `bound: pinned` and no `reportedModel`; Cursor with no `--model` records what it printed (`tests/host-review.test.mjs:53`) as `unproven`.
2. [S2] In `reviewFromOutput`, take `model` from the pin when one was passed, set `reportedModel` when the printed model differs, and set `bound` to `pinned`, `disagrees` or `unproven` (no pin). `unavailable()` (:33) stays `unproven`.
3. [S3] Write `bound` and `reportedModel` into the rows at :242 and :256; :384's prompt-file row already records `CODEX_MODEL` and gains `bound: pinned`.
4. [S4] Record a killed mutant for the pin winning over the printed model and for the `disagrees` branch, with a catalogue entry each. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \
  && for n in "a review row records the model the launcher pinned, and a printed model that differs as disagrees" \
      "a host with no pinned model records what it printed, as unproven" \
      "a review row from the launcher carries its bound and the model the reviewer printed"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a review row records the model the launcher pinned, and a printed model that differs as disagrees` | `tests/host-review.test.mjs` | pin wins; `reportedModel` set only on a difference; `pinned` when they agree | — | S1, S2 |
| `a host with no pinned model records what it printed, as unproven` | `tests/host-review.test.mjs` | Cursor with no `--model` keeps the printed model, `bound: unproven` | — | S1, S2 |
| `a review row from the launcher carries its bound and the model the reviewer printed` | `tests/review-ledger.test.mjs` | the `reviews.jsonl` row holds `model`, `bound` and `reportedModel`; the locked tests beside it are unchanged | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `hostReview()` and the `--prompt-file` path both call `recordReview`; the mutants on the pin |
| 3 — the caller can discover it | ADR-062's schema, as amended here |
| 4 — it is used | nothing reads `model` or `bound` yet (`release-evidence.mjs:450-457`) |

## Mutation Log

## Invariants

- `release-evidence` reads only status, head, base and exact from a row; nothing it decides changes.
- An unavailable review stays `unproven`.

## Risks

- A reader outside this repository may compare `bound` with `reported`. None is known; ADR-062 is amended by Invalidates, and the release notes name the change.

## Stop Condition

Stop if a host's output can name a model the launcher did not pass and still be the run's real model (a server-side
fallback): `pinned` would then claim more than was observed, and the vocabulary needs the owner.

## Out of Scope

- A gate on `model` or `bound` (permanent: boundary: no record sanctions a refusal on it, CLAUDE.md §3)

## Verification Log
