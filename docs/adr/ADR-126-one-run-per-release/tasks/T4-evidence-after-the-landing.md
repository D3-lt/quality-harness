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
| `tests/release.test.mjs` | edit | its world moves to `tests/helpers/release-world.mjs`, which answers `--review`; BACKLOG §406's own test (no lock) follows `--review` |
| `tests/helpers/release-world.mjs` | create | the fake world every release test drives |
| `scripts/land.mjs` | edit | a sha already on main is answered before the clean-tree check, since nothing is pushed then |

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
- 2026-10-22 · d24d1772* · mutant killed · exit 1 · `scripts/release.mjs` · a landed sha takes an uncommitted attestation as evidence · acceptance-sha256:691a9e8eb55793aee516cce4d39ded45e62dbb26b2105fb0ef12e66cadaa3fe5

## Invariants

- Any other untracked or changed path is still an unclean tree, landed or not.

## Risks

- An attestation filed for the wrong sha: `release-evidence` already refuses one that does not cover the readers.

## Stop Condition

Stop if anything is pushed after the landing in the new order.

## Out of Scope

- The order itself (T5).

## Verification Log
- 2026-10-22 · d24d1772* · exit 1 · `out=$(node --test --test-reporter=tap tests/evidence-after-landing.test.mjs 2>&1) \ …` · acceptance-sha256:691a9e8eb55793aee516cce4d39ded45e62dbb26b2105fb0ef12e66cadaa3fe5 · ms:197 · test-lock-sha256:7d7e943b621cc46145c1578f85d9e6e7d18623dd2f56ab5c4ee147da6225fb59 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZXZpZGVuY2UtYWZ0ZXItbGFuZGluZy50ZXN0Lm1qcwlhIGxhbmRlZCBzaGEncyByZWxlYXNlIHRha2VzIGFuIHVuY29tbWl0dGVkIGF0dGVzdGF0aW9uLCBhbmQgYW4gdW5sYW5kZWQgb25lIGRvZXMgbm90CTU5NjUwN2NhNDNiZTI1ZTdiMTkzNzhjNzE1NmQ0Yzg1NWQ5ZWJjNDE2OWNmMWE2MDFjYWU3ODQ5NTc5Zjc4OGYKYm9keQl0ZXN0cy9ldmlkZW5jZS1hZnRlci1sYW5kaW5nLnRlc3QubWpzCWJlZm9yZSB0aGUgbGFuZGluZyBvbmx5IHRoZSByZXZpZXcgcXVlc3Rpb24gc3RvcHMgYSByZWxlYXNlCTc2N2ZmNTYwMGZiM2RhMzU2YTUyMmQ2MzUyYmE2N2JiMDVjZWUwNzQ2ZGFiYjQwZjM0YzU2MTg2YmZhNzliNDQ
  ```
  ```
- 2026-10-22 · d24d1772* · exit 0 · `out=$(node --test --test-reporter=tap tests/evidence-after-landing.test.mjs 2>&1) \ …` · acceptance-sha256:691a9e8eb55793aee516cce4d39ded45e62dbb26b2105fb0ef12e66cadaa3fe5 · ms:256
