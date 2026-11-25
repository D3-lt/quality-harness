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

The seed job computes the answer; when it succeeds, `mutations` and `mutation cache` skip only on its `skip=1` (a seed
job that failed skips the shards as it did before this task); and `release-evidence` refuses a run whose shards were
skipped or are absent, unchanged (ADR-146 Decisions 3 and 4).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `.github/workflows/selftest.yml` | edit | The seed job's checkout, class step and output; the condition on `mutations`; `needs` and the condition on `mutation-cache`; the comments at :335-338 and :365-372 |
| `tests/landing-class-workflow.test.mjs` | add | The tests below |
| `tests/mutations/.github/workflows/selftest.yml.json` | edit | The condition dropped or inverted on each job; the output wired to another step |
| `tests/mutations/scripts/release-evidence.mjs.json` | edit | A skipped shard tolerated; the declared-job check dropped |
| `scripts/release-evidence.mjs` | edit | Comment at :92-97 only: a land push is full unless it is a pin landing |
| `scripts/release.mjs` | edit | Comment at :216 only, the same sentence |
| `CLAUDE.md` | edit | §13 step 3 and §18 |
| `.claude/rules/13-releasing.md` | edit | The 2026-11-25 measurement behind the reworded step |

## Ordered Steps

1. [S1] Write the tests of the table below and confirm they are red (TDD red): the seed job has no `skip` output.
2. [S2] In `mutation-cache-seed`: `actions/checkout` with `fetch-depth: 2` and `path: landing` as the first step, then
   the existing restore and publish steps unchanged, then `node scripts/landing-class.mjs`, run in that directory, as a
   step with an id, and the job output `skip`
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
| `the campaign is skipped only on the seed job's positive answer` | `tests/landing-class-workflow.test.mjs` | Read from the workflow's text: the seed job checks out with depth 2 into a directory of its own, runs `scripts/landing-class.mjs` there as its last step and exposes `skip` from that step; `mutations` carries exactly the condition of Decision 3, no status function, and its locked `needs` line; `mutation cache` needs both jobs and carries its condition; no other job mentions the output; the full-campaign line is the one `release-evidence` matches; no required check of main is a campaign job by name. Stand-in workflows fail the same check: the condition inverted, dropped, given a status function or put on `windows`; the output read from another step; the steps reordered; the checkout at the workspace root | — | S1, S2, S3 |
| `a run whose shards were skipped or are absent is not a release run` | `tests/landing-class-workflow.test.mjs` | Through `release-evidence`'s exported `main`, with the run a stand-in and the workflow's own declared jobs: a landing run listing one `skipped` job named for the matrix, one listing every shard `skipped` by name, and one listing no shard at all, each exit non-zero and say why; the same run with every declared job `success` exits 0 | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seed job's step and output, and the two conditions |
| 2 — something selects it | every push to `land/**` runs the seed job |
| 3 — the caller can discover it | the run's job list and the seed job's log line; CLAUDE.md §13 |
| 4 — it is used | T3's landing |

## Mutation Log
- 2026-11-25 · 2b4086fd4* · mutant killed · exit 1 · `.github/workflows/selftest.yml` · the shards run only on a pin and skip on everything else · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · covers:the positive skip condition
- 2026-11-25 · 2b4086fd4* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · a skipped job is tolerated in a release run · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · covers:a skipped campaign is not a release run

## Invariants

- A shard is skipped only when the seed job failed or was skipped, as before this task, or succeeded and wrote `skip=1`.
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
- 2026-11-25 · 2b4086fd4* · exit 1 · `node --test tests/landing-class-workflow.test.mjs` · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · ms:169 · test-lock-sha256:68aad1d43d1692940b0a127cdf20002d3499e2202b79514aa1a1dbd52f2c8271 · test-lock-file:docs/adr/locks/68aad1d43d1692940b0a127cdf20002d3499e2202b79514aa1a1dbd52f2c8271.lock
  ```
  --- last 10 line(s) of stdout (of 40 after folding 40 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: [ 'the seed job does not check out the commit with its parent', 'the seed job does not run the class script as the step `landing`', 'the seed job does not expose `skip` from the class step', 'the shards do not carry exactly the skip condition', 'the merge does not need the shards and the seed job', 'the merge does not carry exactly its condition' ],
      expected: [],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-25 · 2b4086fd4* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · ms:8 · test-lock-sha256:5a7c9bdc5644187d37a5dd84663f6465e15b3c26a622e1447170fa65a13d907c · test-lock-file:docs/adr/locks/5a7c9bdc5644187d37a5dd84663f6465e15b3c26a622e1447170fa65a13d907c.lock · test-lock-kind:replace
- 2026-11-25 · 2b4086fd4* · exit 0 · `node --test tests/landing-class-workflow.test.mjs` · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · ms:167
- 2026-11-25 · 2b4086fd4* · exit 0 · `node --test tests/landing-class-workflow.test.mjs` · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · ms:263
- 2026-11-25 · 2b4086fd4* · exit 0 · `node --test tests/landing-class-workflow.test.mjs` · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · ms:243
- 2026-11-25 · 5be9e6fa7* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · ms:9 · test-lock-sha256:82bb53471810c220d78f51de6bc5bd55c20672a70d1cd26c1a35c6bd17b0cc44 · test-lock-file:docs/adr/locks/82bb53471810c220d78f51de6bc5bd55c20672a70d1cd26c1a35c6bd17b0cc44.lock · test-lock-kind:replace
- 2026-11-25 · 5be9e6fa7* · exit 0 · `node --test tests/landing-class-workflow.test.mjs` · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c · ms:169
- 2026-11-25 · human-observed · observed by the Claude session that built T2, 2026-11-25: the reworded sentences of CLAUDE.md sections 13 and 18, the 2026-11-25 paragraph of the releasing rule file, the workflow's two comments and the comments in release-evidence.mjs and release.mjs were read against the workflow and evaluateRun at 216859738; each says a land push runs the full campaign unless its one commit only re-pins the catalogue, and that a skipped or absent shard is never a release run; the Codex reviews of 5aaf5d1bd..5be9e6fa7 and its three verifications read the same prose, the last returning APPROVE; approved · acceptance-sha256:00640d9b400ad0ef40e07f81320568f94fa8809472a1b575dcff323d854be61c
