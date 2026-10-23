# Task ADR-127-T3: One land job runs the replay, and release-evidence prints its count as advice

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the `escapes` job, its `escapes-report` artifact, and the advice line
**Consumes:** `node scripts/escapes.mjs` and its report (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

One job of the land run, outside the campaign's shard matrix and not a required check, runs the full catalogue on Linux under
its budget and uploads the report; `release-evidence` downloads it from the landing run and prints its line and the
INSENSITIVE entries as advice, or that the count is unknown, without changing its verdict or exit code.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/escapes-report.test.mjs` | create | the job, the artifact and the advice (0 locks: new) |
| `scripts/release-evidence.mjs` | edit | read the artifact, print the advice |
| `.github/workflows/selftest.yml` | edit | the `escapes` job |
| `CLAUDE.md` | edit | §2: the command |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: the workflow runs the replay in exactly one job, on land pushes only,
   outside the shard matrix, with a timeout and the budget, uploading `escapes-report`; that job is not among the ruleset's
   required checks; `release-evidence` judges a run the same whether the `escapes` job passed, failed, was skipped or is
   absent (a dispatched run skips it); it prints the line and names each INSENSITIVE entry for a report of its sha, full and
   with the current catalogue digest, and prints that the count is unknown for a missing report, another sha, a partial one, or
   another digest; its verdict and exit code are the same in every case.
2. [S2] Add the job, the download through the landing run `release-evidence` already reads, the advice, and the §2 line.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/escapes-report.test.mjs 2>&1) \
  && for n in "one land job runs the replay under its budget, uploads its report, and is not a required check" "release-evidence prints a matching report's count as advice, an unmatched one as unknown, and never changes its verdict"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `one land job runs the replay under its budget, uploads its report, and is not a required check` | `tests/escapes-report.test.mjs` | the workflow and the ruleset | — | S1, S2 |
| `release-evidence prints a matching report's count as advice, an unmatched one as unknown, and never changes its verdict` | `tests/escapes-report.test.mjs` | the advice and its binding | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | the land push trigger, and `release-evidence`'s main |
| 3 — the caller can discover it | the advice line, and CLAUDE.md §2 |
| 4 — it is used | every release |

## Mutation Log

## Invariants

- release-evidence's verdicts and exit codes are unchanged (CLAUDE.md §3).
- main's required checks are unchanged.

## Risks

- The job's length is unmeasured until the first land run with the catalogue: its budget makes an overrun UNPROVEN entries,
  never a red job; shard it if the measured time needs it.
- Doubles: a report file and a fake run stand for the artifact; the first land run is the real one.

## Stop Condition

Stop if the job would need to be a required check to be read: it stays advice, and release-evidence reads it from the run.

## Out of Scope

- A refusal on an INSENSITIVE escape (permanent: boundary: CLAUDE.md §3).

## Verification Log
