# Task ADR-023-T3: Force a full campaign for a release, and prove the forcing works

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** the scheduling rule that decides when reuse is permitted
**Consumes:** `cacheKey()` and the reuse decision (T2), the measured/reused summary counts (T2)
**Data dependency:** hermetic

**Proof map:** v1

## Goal

Reuse is available for iteration and never for a released artifact: a tag or a push to `main` runs
every entry and reports zero reused.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `.github/workflows/selftest.yml` | edit | pass `--no-cache` when the ref is a tag or `main`; this is the line that SELECTS the full campaign and without it T2's reuse silently applies to releases |
| `tests/package.test.mjs` | edit | the CI-shape test reads that condition, so a release losing its full campaign is a test failure rather than a quiet change |
| `CLAUDE.md` | edit | §13's release procedure gains the sentence that a release campaign is always full, beside the nine-jobs rule |

## Ordered Steps

1. [S1] Write the failing assertion first: the CI-shape test requires the mutation job to pass `--no-cache` under a tag/`main` condition, and requires the condition to name both. Confirm it is red before the workflow changes. (TDD red.)
2. [S2] Add the condition to the workflow, in the same expression that already decides the shard argument so the two cannot drift apart.
3. [S3] Assert the other direction on a fixture: a run given `--no-cache` reports zero reused even when a populated cache would have matched every entry. Without this the flag could be accepted and ignored, which looks identical to a full run in the log. [proof: mutation]
4. [S4] Record in `CLAUDE.md` §13 that a release campaign is always full, so the rule survives the workflow being rewritten. [proof: human: a reader checks §13 names the rule beside the nine-jobs step — prose has no assertion, and inventing a keyword test for it would be the word-matching contract test BACKLOG §80 is about]

## Acceptance

```bash
set -o pipefail
node --test tests/package.test.mjs tests/mutate-runner.test.mjs 2>&1 | tee /tmp/adr023-t3.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr023-t3.out \
  && node scripts/mutate.mjs --case 'a forced run reuses nothing' 2>&1 | tee /tmp/adr023-t3b.out \
  && grep -q "1/1 mutations were noticed" /tmp/adr023-t3b.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a release campaign is never served from the cache` | `tests/package.test.mjs` | the workflow passes `--no-cache` for a tag and for `main` | — | S1, S2 |
| `a forced run reuses nothing` | `tests/mutate-runner.test.mjs` | `--no-cache` measures every entry even against a fully-populated cache | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests above |
| 2 — something selects it | the workflow condition is the selector, and the CI-shape test fails when it is deleted — the case this table exists to force |
| 3 — the caller can discover it | `CLAUDE.md` §13 states it in the release procedure a maintainer follows; `--no-cache` is in the usage line from T2 |
| 4 — it is used | every release run's summary reports zero reused, which is observable in the CI log rather than assumed |

## Mutation Log

## Invariants

- A tag and `main` always measure the full catalogue. A released artifact is never partly evidenced by a verdict taken at another commit.
- `--no-cache` measures everything even when the cache would have matched; a flag that is accepted and ignored is indistinguishable from one that works.
- The scheduling rule lives in the workflow and in `CLAUDE.md`, never only in a comment.

## Risks

- The condition could be written so it matches neither a tag nor `main` and silently permits reuse everywhere. That is exactly what S1's test asserts, and why it names both refs rather than checking the flag is present somewhere.

## Stop Condition

Stop if a release run ever reports a non-zero reused count. That means the forcing does not work,
and everything downstream of it — including this record's central claim that a wrong reuse surfaces
at the next tag — rests on it.

## Out of Scope

- The reuse mechanism itself, which is T2
- Whether other branches should force a full run; only tags and `main` are decided here

## Verification Log
- 2026-09-02 · caaf026 · exit 1 · `set -o pipefail …` · acceptance-sha256:71bb37921d33ea3fdd4583f682d723e342c2d6a1d69512bfa0eaad7821eb0b53 · ms:681
  ```
  --- last 10 line(s) of stdout (of 47 after folding 47 raw)
  ✔ the README names every skill and gate this plugin ships (0.23675ms)
  ℹ tests 38
  ℹ suites 0
  ℹ pass 38
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 599.524292
  no mutation matches a forced run reuses nothing
  ```
- 2026-09-02 · caaf026* · exit 1 · `set -o pipefail …` · acceptance-sha256:71bb37921d33ea3fdd4583f682d723e342c2d6a1d69512bfa0eaad7821eb0b53 · ms:631
  ```
  --- last 10 line(s) of stdout (of 47 after folding 47 raw)
  ✔ the README names every skill and gate this plugin ships (0.534375ms)
  ℹ tests 38
  ℹ suites 0
  ℹ pass 38
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 531.213875
  no mutation matches a forced run reuses nothing
  ```
