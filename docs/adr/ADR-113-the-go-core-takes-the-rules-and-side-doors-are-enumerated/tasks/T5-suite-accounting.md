# Task ADR-113-T5: Every test file is accounted for

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** see ADR-113's Inter-task Contracts
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Every tracked test file is reached by a runner and runs a test unless named exempt, every skip names its reason, an environment skip fails where CI requires the environment, and release evidence compares the run's jobs with the workflow's (ADR-113, Decision 5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/suite-accounting.test.mjs` | add | the task's tests, each with a planted twin that must fail |
| `scripts/suite-accounting.mjs`, `scripts/selftest.sh` | add, edit | reach over what git lists, and the run's row: a file that registered no test, an exemption not carried, a skip with no reason; every selftest runs it, and a run with no row is UNRUN |
| `scripts/file-timing-reporter.mjs` | edit | each file's row counts its skips and names a skip with no reason |
| `tests/helpers/require.mjs`, `tests/qh-core-parity.test.mjs`, `tests/go-core-parity-adr-111.test.mjs`, `tests/publish-hook.test.mjs`, `tests/publish-ledger-binding.test.mjs`, `.github/workflows/selftest.yml` | add, edit | `QUALITY_HARNESS_REQUIRE` turns the go and config-hooks skips into a failure where named; the core job names go. No job names config-hooks: which runners carry git 2.54 is not measured here |
| `tests/gate-rules.test.mjs` | edit | the two Windows-only skips give their reason; the locks of ADR-075 T2 and ADR-091 T3 do not cover a test's options, and both records still lint PASS |
| `scripts/release-evidence.mjs` | edit | `declaredJobs` (matrices expanded) from the workflow at the sha; a run lacking a declared job is FAILED, an unreadable workflow could-not-look. Measured 2026-10-19 against run 39149819917 (the v3.8.46 campaign): 58 declared, 58 reported, none missing |
| `tests/mutations/scripts/*.json` | add, edit | catalogue entries for each mutant |
| `tests/review-ledger.test.mjs`, `docs/adr/ADR-100-a-repeated-procedure-is-one-command/tasks/T1-a-review-is-recorded.md`, `tests/file-timing.test.mjs`, `tests/one-ledger-reader.test.mjs` | edit | found at the full check: release-evidence's main path now reads the declared jobs, so ADR-100 T1's locked test is given the run's one job as declared and is relocked; the reporter's row shape gains `skipped` and `reasonless`; and ADR-101 T2's locked fast-pass rows are read through a fixture that now declares the `fastCheck` they record (T3's binding), a helper change that leaves the test byte-identical |

## Ordered Steps

1. [S1] Write the failing tests: a planted file in a subfolder, a planted zero-test file, a reasonless skip and a required environment that is absent each fail. Record the red run.
2. [S2] Implement on the Node path and in the Go core where the rule is a hook's, keeping them in parity.
3. [S3] Record a killed mutant per decision point, and add catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/suite-accounting.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every test file is reached, runs a test, and every skip names its reason` | `tests/suite-accounting.test.mjs` | file reach, zero-test files, skip reasons, required environments and the release's job set, each with a planted twin | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the finding's text, or the gate's output |
| 4 — it is used | every session and every gate run |

## Mutation Log
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/suite-accounting.mjs` · no test file is ever unreached · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/suite-accounting.mjs` · a Python file nothing names counts as reached · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/suite-accounting.mjs` · a name in a comment reaches a file · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/suite-accounting.mjs` · a file that registered no test passes · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/suite-accounting.mjs` · an exemption whose carrier ran nothing stands · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/suite-accounting.mjs` · a stale exemption is never named · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/file-timing-reporter.mjs` · a skip with no reason is not named · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/file-timing-reporter.mjs` · skips are not counted · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · a run lacking a declared job clears the release · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · an unreadable workflow reads as every job present · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · matrix jobs are not expanded · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · cfbb6e3a* · mutant killed · exit 1 · `tests/helpers/require.mjs` · a required capability that is missing still skips · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · 4db47214* · mutant killed · exit 1 · `scripts/suite-accounting.mjs` · a row missing a collected file passes · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · 4db47214* · mutant killed · exit 1 · `scripts/file-timing-reporter.mjs` · an empty suite counts as a test · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · 4db47214* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · a comment between jobs hides the jobs after it · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
- 2026-10-19 · 4db47214* · mutant survived · exit 0 · `scripts/release-evidence.mjs` · an inline job reads as no job · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-19 · 4db47214* · mutant survived · exit 0 · `scripts/release-evidence.mjs` · an inline job beside a block job reads as a shorter list · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-19 · 4db47214* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · an inline job beside a block job reads as a shorter list · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8

## Invariants

- Gates advise and two refusals are sanctioned (CLAUDE.md §3); nothing here adds a refusal outside them.
- The Node path and the Go core say the same thing at each commit.

## Risks

- A planted twin that does not fail proves nothing; each is shown failing in the same test.

## Stop Condition

Stop if a change would add a refusal outside the two sanctioned ones, or if parity cannot be kept without a design decision.

## Out of Scope

- ADR-110 T3's cutover (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
- 2026-10-19 · cfbb6e3a* · exit 1 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:178 · test-lock-sha256:cd0c86af932d5733113b2f6b00777e7a89a5150646bcd1e79cb41b8dc29d2ab9 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc3VpdGUtYWNjb3VudGluZy50ZXN0Lm1qcwlldmVyeSB0ZXN0IGZpbGUgaXMgcmVhY2hlZCwgcnVucyBhIHRlc3QsIGFuZCBldmVyeSBza2lwIG5hbWVzIGl0cyByZWFzb24JYmRiM2MxMWMyNzNjZjg5OWI3MDY0N2U5NzM1Y2IyNTM4MTI3YWViNGNhMmYyYzA5M2Y3ZmNhOTJkMWUwZjA5MA
  ```
  --- last 10 line(s) of stdout (of 35 after folding 35 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 81.283125

  ✖ failing tests:

  test at tests/suite-accounting.test.mjs:1:1
  ✖ tests/suite-accounting.test.mjs (78.623167ms)
    'test failed'
  ```
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:944
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:775
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:786
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:780
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:773
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:779
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:811
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:776
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:772
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:805
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:787
- 2026-10-19 · cfbb6e3a* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:791
- 2026-10-19 · 4db47214* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:952
- 2026-10-19 · 4db47214* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:961
- 2026-10-19 · 4db47214* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:1045
- 2026-10-19 · 4db47214* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:951
- 2026-10-19 · 4db47214* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:978
- 2026-10-19 · 4db47214* · exit 0 · `node --test tests/suite-accounting.test.mjs` · acceptance-sha256:38302a0bb06499a60239c1a938e876c3cd76070533a93e6ee7de2df786bff0f8 · ms:994
