# Task ADR-126-T4: Before the landing only the review stops a release; after it an attestation is evidence

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `release-evidence --review`; `release.mjs` accepts an attestation-only tree on a landed sha
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`release-evidence --review <sha>` answers the review question alone; `release.mjs` asks it before anything lands, and once the
sha is on main it takes a tree whose only change is untracked `docs/corpus-reports/*.json` as clean.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/evidence-after-landing.test.mjs` | create | the cases (0 locks: new) |
| `scripts/release-evidence.mjs` | edit | `--review` beside `--local` in `main` |
| `scripts/release.mjs` | edit | the clean-tree check (:64-73) and the pre-landing question (:91-99) |
| `tests/release.test.mjs` | edit | the world helper answers `--review` (a helper; no locked body changes) |

## Ordered Steps

1. [S1] Write the failing test and record the red run: before the landing a missing outside run does not stop the release and a
   missing review does; on a landed sha an attestation-only tree goes on, and on an unlanded one it stops naming the attestation.
2. [S2] `--review`; the landed-sha rule; the pre-landing call.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/evidence-after-landing.test.mjs 2>&1) \
  && for n in "before the landing only the review question stops a release" \
      "a landed sha's release takes an uncommitted attestation, and an unlanded one does not"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `before the landing only the review question stops a release` | `tests/evidence-after-landing.test.mjs` | the pre-landing call | — | S1, S2 |
| `a landed sha's release takes an uncommitted attestation, and an unlanded one does not` | `tests/evidence-after-landing.test.mjs` | the clean-tree rule | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `release()` calls both on every run |
| 3 — the caller can discover it | the refusal names what to do |
| 4 — it is used | every release |

## Mutation Log

## Invariants

- Any other untracked or changed path is still an unclean tree, landed or not.

## Risks

- An attestation filed for the wrong sha: `release-evidence` already refuses one that does not cover the readers.

## Stop Condition

Stop if anything is pushed after the landing in the new order.

## Out of Scope

- The order itself (T5).

## Verification Log
