# Task ADR-146-T2: A pin landing skips the campaign, and a release still refuses such a run

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `the seed job's skip output`, `the skipped campaign`
**Consumes:** `scripts/landing-class.mjs` (T1), `the skip output line` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the positive skip condition`, `a skipped campaign is not a release run`

## Goal

The seed job computes the answer, `mutations` and `mutation cache` skip only on `skip=1` from a seed job that succeeded,
and `release-evidence` refuses a run whose shards were skipped or are absent, unchanged (ADR-146 Decisions 3 and 4).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `.github/workflows/selftest.yml` | edit | The seed job's checkout, class step and output; the condition on `mutations`; `needs` and the condition on `mutation-cache`; the comments at :335-338 and :365-372 |
| `tests/landing-class-workflow.test.mjs` | add | The tests below |
| `tests/mutations/.github/workflows/selftest.yml.json` | edit | The condition dropped or inverted on each job; the output wired to another step |
| `scripts/release-evidence.mjs` | edit | Comment at :92-97 only: a land push is full unless it is a pin landing |
| `scripts/release.mjs` | edit | Comment at :216 only, the same sentence |
| `CLAUDE.md` | edit | §13 step 3 and §18 |
| `.claude/rules/13-releasing.md` | edit | The 2026-11-25 measurement behind the reworded step |

## Ordered Steps

1. [S1] Write the tests of the table below and confirm they are red (TDD red): the seed job has no `skip` output.
2. [S2] In `mutation-cache-seed`: `actions/checkout` with `fetch-depth: 2` as the first step, then the existing restore
   and publish steps unchanged, then `node scripts/landing-class.mjs` as a step with an id, and the job output `skip`
   read from that step.
3. [S3] Give `mutations` `if: needs.mutation-cache-seed.outputs.skip != '1'` and leave its `needs` line byte-identical.
   Give `mutation-cache` `needs: [mutations, mutation-cache-seed]` and
   `if: ${{ always() && needs.mutation-cache-seed.outputs.skip != '1' }}`. Leave the `QUALITY_HARNESS_FULL_CAMPAIGN`
   line byte-identical.
4. [S4] Reword the two workflow comments, the two script comments, CLAUDE.md §13 step 3 and §18 and the rule file.
   [proof: human: the prose read against the workflow at review]
5. [S5] Add the catalogue mutants (the condition dropped from `mutations`; `!=` turned into `==`; the output read from
   the publish step; the condition added to a required job) and record one killed per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
node --test tests/landing-class-workflow.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the campaign is skipped only on the seed job's positive answer` | `tests/landing-class-workflow.test.mjs` | Read from the workflow's text: the seed job checks out with depth 2, runs `scripts/landing-class.mjs` and exposes `skip` from that step; `mutations` carries exactly the condition of Decision 3, no status function, and its locked `needs` line; `mutation cache` needs both jobs and carries its condition; no other job mentions the output; the full-campaign line is the one `release-evidence` matches; a stand-in workflow with the condition on `selftest` fails the same check | — | S1, S2, S3 |
| `a run whose shards were skipped or are absent is not a release run` | `tests/landing-class-workflow.test.mjs` | Through `release-evidence`'s command line with a stand-in `gh`: a landing run listing one `skipped` job named for the matrix, and one listing no shard at all, each exit non-zero and name the campaign; the same run with every declared job `success` exits 0 | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seed job's step and output, and the two conditions |
| 2 — something selects it | every push to `land/**` runs the seed job |
| 3 — the caller can discover it | the run's job list and the seed job's log line; CLAUDE.md §13 |
| 4 — it is used | T3's landing |

## Mutation Log

## Invariants

- A shard is skipped only when a seed job that succeeded wrote `skip=1`.
- No required check of main gains a condition.
- tests/one-run-release.test.mjs and tests/package.test.mjs pass unchanged.

## Risks

- The forge evaluates the condition otherwise than its documentation says: T3 reads a live run, and until then a release
  refuses a skipped shard whatever skipped it.

## Stop Condition

Stop if a locked test must change to pass, or if `release-evidence` accepts either stand-in run.

## Out of Scope

- A condition on any required job (deferred: docs/BACKLOG.md §475)

## Verification Log
