# Task ADR-138-T2: A Windows CI job probes the tag and the candidate over pinned corpora

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `outside-run.json`
**Consumes:** `sameOutput(before, after)` (T1)
**Data dependency:** live — the job clones the public corpora pinned in scripts/outside-corpora.json; the tests drive the script with local stand-ins
**Proof map:** v1

## Goal

A `windows-latest` job in the release run writes `outside-run.json` with the contract of ADR-138 Decision 4: the run id, the
candidate sha, the baseline tag and its sha as reachable from the candidate, both cores' identities, and per corpus its id, its
pin (a sha, or a fixture's path and content digest), both reports' digests, the candidate's attestation, `sameOutput`'s answer,
`diffReports`'s explanation when unequal, and could-not-run with its reason.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/outside-run.mjs` | add | Stages each corpus, probes it with both cores, writes the artifact |
| `scripts/outside-corpora.json` | add | The public corpora: id, URL, pinned sha, shape label; reviewed like code |
| `.github/workflows/selftest.yml` | modify | The `outside run` job: `windows-latest`, `needs: core-assets`, on land pushes and on a dispatched campaign, invoking the script at the run's sha and uploading `outside-run.json` |
| `tests/outside-run.test.mjs` | add | The script over local stand-ins, and the workflow job's selector, dependency, invocation and upload |
| `tests/mutations/scripts/outside-run.mjs.json` | add | A dropped corpus, a swallowed could-not-run or a wrong baseline is noticed |
| `tests/mutations/.github/workflows/selftest.yml.json` | add | The job's condition, dependency or upload removed is noticed |

## Ordered Steps

1. [S1] Write the failing tests: (a) two local public stand-ins, a fixture present only at the candidate, and two stub cores:
   every corpus appears once with both digests and the right baseline; an unchanged one is `same: true`, a changed one is
   `same: false` with its explanation, a missing pin is could-not-run; (b) the workflow parsed: the job exists, runs on
   `windows-latest`, `needs: core-assets`, runs for land pushes and dispatched campaigns, passes the run's sha, uploads the artifact.
2. [S2] Implement `scripts/outside-run.mjs`. Fixtures are staged as tests/corpus-matrix.test.mjs stages them: each copied into
   its own initialized git repository with one commit, discovered as every directory under tests/fixtures/corpora at the
   candidate, each probed by both cores over identical bytes. Commit `scripts/outside-corpora.json` with the five corpora
   surveyed 2026-11-03, each pinned to the sha read that day.
3. [S3] Add the job to the workflow and run it once on a landing; read its artifact. [proof: human: the first live run's artifact is read and its corpora counted]
4. [S4] Add mutants on the script and the workflow; record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/outside-run.test.mjs 2>&1 | tee "$out" && grep -q '✔ the outside run proves its own comparison per corpus' "$out" && grep -q '✔ the outside run job is selected on every release run and uploads its artifact' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the outside run proves its own comparison per corpus` | `tests/outside-run.test.mjs` | Contract, baseline, fixture discovery, could-not-run | — | S1, S2 |
| `the outside run job is selected on every release run and uploads its artifact` | `tests/outside-run.test.mjs` | Selector, dependency, invocation, upload | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `scripts/outside-run.mjs` |
| 2 — selected | the workflow job, tested |
| 3 — discoverable | the release run's artifact list |
| 4 — used | T3 |

## Mutation Log
- 2026-11-03 · ee3c2ae10* · mutant killed · exit 1 · `scripts/outside-run.mjs` · a corpus GitHub could not serve would be compared as if probed, so a missing corpus could read as unchanged · acceptance-sha256:12881f3df529ef50a92cae3bbe427550ccd05258f3765a8fe5830df166edc15d

## Invariants

Main's ruleset does not require the job: a failed or slow outside run never blocks a landing (ADR-118); only the release reads it.

## Risks

Network and rate limits on the clones: could-not-run, never a pass.

## Stop Condition

Stop if the candidate's core cannot be taken from the run's own assets on Windows.

## Out of Scope

- The evidence rule (T3).

## Verification Log
- 2026-11-03 · ee3c2ae10* · exit 1 · `set -o pipefail …` · acceptance-sha256:12881f3df529ef50a92cae3bbe427550ccd05258f3765a8fe5830df166edc15d · ms:225 · test-lock-sha256:0945a5de18f295b5ed192eab494c4c80cd835e004c002302e99642a3b2f9c10e · test-lock-file:docs/adr/locks/0945a5de18f295b5ed192eab494c4c80cd835e004c002302e99642a3b2f9c10e.lock
  ```
  --- last 10 line(s) of stdout (of 35 after folding 35 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 88.749791

  ✖ failing tests:

  test at tests/outside-run.test.mjs:1:1
  ✖ tests/outside-run.test.mjs (85.525583ms)
    'test failed'
  ```
- 2026-11-03 · ee3c2ae10* · exit 0 · `set -o pipefail …` · acceptance-sha256:12881f3df529ef50a92cae3bbe427550ccd05258f3765a8fe5830df166edc15d · ms:385
- 2026-11-03 · 8226d0201* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:12881f3df529ef50a92cae3bbe427550ccd05258f3765a8fe5830df166edc15d · ms:1 · test-lock-sha256:f0d47f64a64f0b91ad63e10f07216eb9d2dc056b405795a76d02158fbea388db · test-lock-file:docs/adr/locks/f0d47f64a64f0b91ad63e10f07216eb9d2dc056b405795a76d02158fbea388db.lock · test-lock-kind:replace
