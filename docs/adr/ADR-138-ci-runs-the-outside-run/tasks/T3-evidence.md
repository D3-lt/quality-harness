# Task ADR-138-T3: release-evidence accepts the release run's outside run when no output changed

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the widened outside-run evidence rule
**Consumes:** `outside-run.json` (T2); `sameOutput(before, after)` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`release-evidence` downloads `outside-run.json` from the sha's release run and verifies it (ADR-138 Decision 4). It answers the
outside-run question when the run is that release run, the baseline is the tag release-evidence itself names, the corpus set is
exactly the committed list plus every fixture at the candidate, each once, none could not run, no verdict left PASS and every
corpus is `same: true`. Otherwise it answers UNPROVEN naming the corpora and their explanations; a filed peer attestation then
answers it, except that a verdict which left PASS in either source vetoes the release.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/release-evidence.mjs` | modify | The CI branch of the outside-run question, and the veto across both sources |
| `scripts/release.mjs` | modify | Its outside-run request prints the explanations from the artifact |
| `CLAUDE.md` | modify | §18 says when a person is asked, and what the bounded check does not protect |
| `.claude/rules/18-somebody-else-runs-it.md` | modify | The 2026-11-03 evidence and the split |
| `tests/release-evidence-ci-outside.test.mjs` | add | Every acceptance condition and its refusal; the mixed case |
| `tests/mutations/scripts/release-evidence.mjs.json` | modify | Each condition dropped is noticed |

## Ordered Steps

1. [S1] Write the failing test with a fake `gh run download` and stand-in artifacts: all same (answered); one unequal (UNPROVEN,
   explained); one could-not-run; a missing, a duplicated and an extra corpus; a malformed entry; a wrong sha, a wrong run, a
   wrong baseline; a reused artifact from an earlier run; and a CI regression beside a clean peer attestation (UNPROVEN).
2. [S2] Implement the branch in `outsideRunEvidence`; keep the peer path, and feed CI's verdict moves into its veto.
3. [S3] Update release.mjs's request, CLAUDE.md §18 and the rule file. [proof: human: the prose says when a person is asked, read against the code at review]
4. [S4] Add mutants, one per condition; record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/release-evidence-ci-outside.test.mjs 2>&1 | tee "$out" && grep -q '✔ the release run answers the outside run only when its comparison is complete and nothing changed' "$out" && grep -q '✔ a regression in either source vetoes the release' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the release run answers the outside run only when its comparison is complete and nothing changed` | `tests/release-evidence-ci-outside.test.mjs` | Every condition, both directions | — | S1, S2 |
| `a regression in either source vetoes the release` | `tests/release-evidence-ci-outside.test.mjs` | ADR-082's veto across CI and peer evidence | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the CI branch in `outsideRunEvidence` |
| 2 — selected | `release-evidence <sha>` |
| 3 — discoverable | release.mjs's request text |
| 4 — used | the next release |

## Mutation Log
- 2026-11-03 · 78b3ab550* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · a regression the release run's outside run saw would be outvoted by a clean peer run over another corpus · acceptance-sha256:a8aa5af684183f587d465bb398ac98f7199bde9822501b57ba7b4526771cfcbb

## Invariants

A release never counts as outside-run-answered on an artifact it could not download, verify or match to the corpus set; that is
could-not-look.

## Risks

An artifact from another run or sha read as this one's: refused by the verification step and tested.

## Stop Condition

Stop if the artifact cannot be tied to the release run's id and the sha.

## Out of Scope

- CI wall-clock (docs/BACKLOG.md §459).

## Verification Log
- 2026-11-03 · 78b3ab550* · exit 1 · `set -o pipefail …` · acceptance-sha256:a8aa5af684183f587d465bb398ac98f7199bde9822501b57ba7b4526771cfcbb · ms:247 · test-lock-sha256:656b5eae029106e03acb3846b51d901535828272686d1d46a1aefbfd0b063d68 · test-lock-file:docs/adr/locks/656b5eae029106e03acb3846b51d901535828272686d1d46a1aefbfd0b063d68.lock
  ```
  --- last 10 line(s) of stdout (of 59 after folding 59 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: [ 'unproven', 'missing' ],
      expected: [ 'unproven', 'regressed' ],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-03 · 78b3ab550* · exit 0 · `set -o pipefail …` · acceptance-sha256:a8aa5af684183f587d465bb398ac98f7199bde9822501b57ba7b4526771cfcbb · ms:288
