# Task ADR-109-T1: Measure what the tests do not see in this repository's own landed hunks

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one repository script, one campaign over recent commits, counts into the record)
**Owner:** Zy
**Produces:** the counts in ADR-109's Follow-ups: hunks, noticed, unnoticed, inconclusive, per commit and in total, for the inverse and for each operator
**Consumes:** none
**Proof map:** v1

## Goal

Answer, with numbers from this repository, whether reverting one landed hunk at a time finds changes the tests do not
see (ADR-109, Decision 1), so that T2 is built on a measurement or the record is withdrawn on one.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/inverse-hunks.mjs` | add | for a commit range: each plugin commit's `git diff -U0` hunks outside `tests/`, each mutated alone in a worktree of that commit, the commit's test files run (`tests/*.test.mjs` the commit touched, else the files its catalogue entries name), and a verdict per hunk per mutation: noticed (a test failed), unnoticed (green), inconclusive (did not parse, build or run). Mutations: the inverse (the original lines back), and three operators applied to the hunk's new lines where they match — a comparison flipped (`<`→`>=`, `===`→`!==`), a boolean literal flipped, a numeric literal nudged by one — so the same hunks compare the inverse with generated variants per fence run |
| `tests/inverse-hunks.test.mjs` | add | the script against a fixture repository the test creates: a hunk the fixture's test sees is noticed, one it does not is unnoticed, a revert that breaks syntax is inconclusive |

## Ordered Steps

1. [S1] Write the test against a fixture repository and record the red run (TDD red: the script does not exist).
2. [S2] Write the script: worktree per commit (ADR-075's isolation, never in place), one hunk reverted at a time through `git apply -R` of that hunk alone, the commit's tests run with the campaign's `testArgs` shape, verdicts classified as `scripts/mutate.mjs` classifies. Bound every child (CLAUDE.md §7).
3. [S3] Run it over `v3.8.40..HEAD`'s plugin commits, under load below the core count, and put the counts into ADR-109's Follow-ups and a BACKLOG §381 line: per commit and total, the inverse and each operator in its own column, with fence runs per unnoticed hunk found, the date and the range. [proof: human: the counts, the range, the date, and the load it ran under]
4. [S4] Decide against the threshold in Decision 1 and record the decision in Follow-ups. [proof: human: the owner's decision]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`, naming the range, the
counts, the load, and the decision on T2.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a reverted hunk the tests see is noticed, one they do not is unnoticed, and one that breaks the build is inconclusive` | `tests/inverse-hunks.test.mjs` | the three verdicts on a fixture the test builds; the script never writes into the repository it measures | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the script |
| 2 — something selects it | the owner runs it over the range |
| 3 — the caller can discover it | CLAUDE.md §2's command list, if T2 is built; else the record |
| 4 — it is used | the counts in Follow-ups |

## Mutation Log

## Invariants

- The script never runs in place and never writes a Verification Log or Mutation Log row: it measures, it does not record evidence (ADR-016 names what evidence a mutant row is).
- Hunks under `tests/` are excluded from every count.

## Risks

- The range's commits each carry several concerns, so a hunk's "own tests" are an approximation; the count is a floor on what a per-plan run would find, and the sign-off says so.

## Stop Condition

Stop and ask if the run cannot finish under load below the core count within an hour; a count taken under contention is unattributable and is not entered.

## Out of Scope

- Any change to the plugin (permanent: boundary: T1 measures; T2 builds)

## Verification Log
- 2026-10-28 · human-observed · Zy, 2026-10-28: signed off. Range v3.8.40..f01b174a: the 2026-10-17 run (contended) plus 5532409e^..f01b174a measured 2026-10-28 uncontended, load at most 9.12 on 10 cores. The inverse left 14 of 63 judged hunks unnoticed there (22%), 32 of 154 over the whole range (21%), against Decision 1's threshold of one in ten; the counts are a floor. Decision: keep the record and build T2. · acceptance-sha256:dcf3a6c93d90542ceed3932ed4cacc0aa2e56edeecb73bcc2b066e91fee24ca1
