# Task ADR-131-T1: Bind native production inputs to the executed binary

**Status:** done
**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L (cross-boundary)
**Owner:** Codex
**Produces:** versioned native source and asset identity
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Bind native production inputs to the executed binary.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/native-source.mjs` | add | repository-only production scope and source/manifest construction |
| `scripts/build-core.mjs` | edit | source-bound manifest |
| `plugin/scripts/qh-fetch.mjs` | edit | retain verified provenance |
| `plugin/scripts/corpus-probe.mjs` | edit | actual executable identity |
| `scripts/attest-import.mjs` | edit | verify native binding |
| `scripts/release-evidence.mjs` | edit | native change and coverage |
| `scripts/release-assets.mjs` | edit | bind manifest to landing run |
| `tests/native-release.test.mjs` | add | native-only change regression |

## Ordered Steps

1. [S1] Write a failing regression for the native-only release coverage hole with a real temporary Git repository. [proof: acceptance]
2. [S2] Wire source scope, versioned manifest and actual binary observation through probe/import/release. [proof: acceptance]
3. [S3] Prove stale, wrong-target, unreadable and legacy negative controls; exercise native mutants. [proof: mutation]

## Acceptance

```bash
node --test --test-concurrency=1 tests/native-release.test.mjs tests/native-provenance.test.mjs tests/native-import.test.mjs tests/native-probe-path.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a native-only production change requires fresh outside evidence` | `tests/native-release.test.mjs` | Go changes cannot be silently exempted | — | S1, S2 |
| `native tests, build outputs and documentation outside core do not require an outside reader run` | `tests/native-release.test.mjs` | non-reader negative control | — | S2 |

## Invariants

- Legacy plugin digests are not rewritten.
- Only a correctly bound executed binary covers a native reader change.
- No provenance scan or network request is added to ordinary prompt hooks.

## Risks

False coverage must remain unknown rather than a passing observation. Cross-platform paths and child ownership require actual boundary checks.

## Out of Scope

- Removing retained Node tools (permanent: boundary: the owner selected native lifecycle hooks only).

## Stop Condition

Do not declare completion when native identity is only a version string, a claimed source hash without binary binding, or an unreadable observation.

## Verification Log
- 2026-10-28 · a276b4d6* · exit 0 · `node --test --test-concurrency=1 tests/native-release.test.mjs tests/native-provenance.test.mjs tests/native-import.test.mjs tests/native-probe-path.test.mjs` · acceptance-sha256:77657ea192050a3c9ada7214be1da9092595dacb2b06cce5afd752424f1f6088 · ms:5419
- 2026-10-29 · a276b4d6* · exit 0 · `node --test --test-concurrency=1 tests/native-release.test.mjs tests/native-provenance.test.mjs tests/native-import.test.mjs tests/native-probe-path.test.mjs` · acceptance-sha256:77657ea192050a3c9ada7214be1da9092595dacb2b06cce5afd752424f1f6088 · ms:3340
- 2026-10-29 · a276b4d6* · exit 1 · `node --test --test-concurrency=1 tests/native-release.test.mjs tests/native-provenance.test.mjs tests/native-import.test.mjs tests/native-probe-path.test.mjs` · acceptance-sha256:77657ea192050a3c9ada7214be1da9092595dacb2b06cce5afd752424f1f6088 · ms:2177 · test-lock-sha256:f787f805cf3a93ee8a9acdb13103806a562f3e4492a1312aaabf84a6c2251bde · test-lock-file:docs/adr/locks/f787f805cf3a93ee8a9acdb13103806a562f3e4492a1312aaabf84a6c2251bde.lock
  ```
  --- last 10 line(s) of stdout (of 78 after folding 78 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 'not-required',
      expected: 'unproven',
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-29 · a276b4d6* · exit 0 · `node --test --test-concurrency=1 tests/native-release.test.mjs tests/native-provenance.test.mjs tests/native-import.test.mjs tests/native-probe-path.test.mjs` · acceptance-sha256:77657ea192050a3c9ada7214be1da9092595dacb2b06cce5afd752424f1f6088 · ms:3269

## Mutation Log
- 2026-10-28 · a276b4d6* · mutant killed · exit 1 · `plugin/scripts/reader-paths.mjs` · A native-only source change cannot be omitted from outside-run coverage · acceptance-sha256:77657ea192050a3c9ada7214be1da9092595dacb2b06cce5afd752424f1f6088
