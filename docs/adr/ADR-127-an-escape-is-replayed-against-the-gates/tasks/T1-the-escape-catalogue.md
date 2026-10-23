# Task ADR-127-T1: Every BACKLOG section is classified, and every defect found outside is a catalogue entry

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** the escape entry schema (`tests/escapes/<section>-<n>.json`) and the classification (`tests/escapes/README.md`)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Read every BACKLOG section, §1 to the highest, in the index and the archives: list each in `tests/escapes/README.md` with
the defects it holds (`<section>-<n>`), and for each defect write an entry or the reason it is not an escape; a test holds the
classification complete and every entry well formed.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/escapes.test.mjs` | create | the schema and completeness checks (0 locks: new) |
| `tests/escapes/README.md` | create | one row per section, its defects, and each one's entry or exclusion |
| `tests/escapes/<section>-<n>.json` | create | one entry per defect found outside |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: an entry with a missing field, an unknown origin or platform, a fix
   commit git cannot resolve, a path or named test file the tree does not hold, or a test name its file does not register, is
   refused; an entry with `fix: null` must say why; a section number missing from the README, a defect id listed twice, a
   listed defect that is neither an entry nor an exclusion, and an entry the README does not list are each named.
2. [S2] Read each section (the origin search in ADR-127's Context is a reading aid, not the boundary); for each defect decide:
   found outside (who, the release it escaped in, the fix commits from its text or `git log --grep`, the paths, the tests the
   fix added, the platforms they observe it on), or not an escape, with the reason. A confirmed escape whose fix or tests
   cannot be named is an entry with `fix: null` and the reason, never an exclusion.
3. [S3] Write the entries and the README; the tests pass.
4. [S4] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/escapes.test.mjs 2>&1) \
  && for n in "an escape entry names its origin, release, fix, paths, tests and platforms, and each resolves" "every section number is classified, every listed defect is an entry or an exclusion, and none is both"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an escape entry names its origin, release, fix, paths, tests and platforms, and each resolves` | `tests/escapes.test.mjs` | the schema, with a dirty twin per field | — | S1, S3 |
| `every section number is classified, every listed defect is an entry or an exclusion, and none is both` | `tests/escapes.test.mjs` | completeness against the BACKLOG, by section number and defect id | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | T2's replay reads every entry |
| 3 — the caller can discover it | `tests/escapes/README.md` |
| 4 — it is used | the land job (T3) |

## Mutation Log

## Invariants

- Every section number from 1 to the highest in the BACKLOG and its archives is in the README.
- No entry names a path outside this repository, and none carries another repository's text (CLAUDE.md §6).

## Risks

- 415 sections is a long read: it is the task, and the test makes a skipped one visible.
- Doubles: none — the tests read the real BACKLOG, the tree and git.

## Stop Condition

Stop if a section's origin cannot be told from its text: it is an exclusion only when the text shows it was found here;
otherwise ask the owner.

## Out of Scope

- Replaying anything (T2).

## Verification Log
