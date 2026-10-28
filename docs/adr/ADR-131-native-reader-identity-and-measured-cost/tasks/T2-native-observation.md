# Task ADR-131-T2: Observe native execution and count each delivered context once

**Status:** done
**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L (cross-boundary)
**Owner:** Codex
**Produces:** native-aware process coverage and exclusive model-context totals
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Observe native execution and count each delivered context once.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/process_trace*.go` | add | opt-in native process observation and platform resources |
| `core/hooks/proc.go`, `core/hooks/artifact.go`, `core/hooks/bridge_exec_*.go` | edit | instrument actual execution boundaries |
| `scripts/observation/` | add | bounded Node/native process collection |
| `scripts/hook-cost.mjs` | edit | complete installed-chain cost |
| `scripts/hook-footprint.mjs` | edit | non-overlapping delivered totals |
| `tests/native-observation.test.mjs`, `tests/native-cost.test.mjs`, `tests/hook-footprint.test.mjs`, `tests/process-observation.test.mjs` | add/edit | exercise collection and attribution boundaries |

## Ordered Steps

1. [S1] Write failing regression tests for the native observer blind spot and overlapping item attribution. [proof: acceptance]
2. [S2] Observe native attempts/starts/completions and actual check execution, including owned detached work. [proof: acceptance]
3. [S3] Kill a real native automatic-baseline launch mutant; preserve guards and explicit checks. [proof: mutation]

## Acceptance

```bash
(cd core && go test ./hooks -run '^TestNativeProcessTrace' -count=1 -timeout=90s) && env -u QUALITY_HARNESS_QH_BIN node --test --test-concurrency=1 tests/native-observation.test.mjs tests/hook-footprint.test.mjs tests/native-cost.test.mjs tests/process-observation.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `native baseline observation sees a real project check` | `tests/native-observation.test.mjs` | positive native execution control | — | S1, S2 |
| `a context attachment contributes once to the exclusive total` | `tests/native-observation.test.mjs` | item labels cannot inflate delivered context | — | S1, S2 |
| `hook-cost observes every registered native SessionStart hook and labels partial process coverage` | `tests/native-cost.test.mjs` | full matching registry chain reaches the native observer | — | S2 |

| `native observation refuses a different Git checkout as its trace sink` | `tests/native-observation.test.mjs` | external observation cannot modify an unrelated checkout | — | S2 |
## Invariants

- An unavailable native/CPU observation is not zero.
- Observers are opt-in and add no default context output.
- Baseline and process tests cannot pass by waiting less than a detached child.

## Risks

False coverage must remain unknown rather than a passing observation. Cross-platform paths and child ownership require actual boundary checks.

## Out of Scope

- Always-on telemetry (permanent: boundary: observers are explicitly enabled for a bounded local run).

## Stop Condition

Do not claim no child execution using only Node interception or an absent marker before owned descendants complete.

## Verification Log
- 2026-10-28 · a276b4d6* · exit 0 · `env -u QUALITY_HARNESS_QH_BIN node --test --test-concurrency=1 tests/native-observation.test.mjs tests/hook-footprint.test.mjs` · acceptance-sha256:e221a0c0a8998dbd07db074e9b8b37dc2f8f325de595aa489d2587b4b73801ed · ms:1093
- 2026-10-29 · a276b4d6* · exit 0 · `env -u QUALITY_HARNESS_QH_BIN node --test --test-concurrency=1 tests/native-observation.test.mjs tests/hook-footprint.test.mjs tests/native-cost.test.mjs tests/process-observation.test.mjs` · acceptance-sha256:06781a009b0b163916a2215a84b8147e652167b99c6c092cc97843812ff671ab · ms:4640
- 2026-10-29 · a276b4d6* · exit 0 · `(cd core && go test ./hooks -run '^TestNativeProcessTrace' -count=1 -timeout=90s) && env -u QUALITY_HARNESS_QH_BIN node --test --test-concurrency=1 tests/native-observation.test.mjs tests/hook-footprint.test.mjs tests/native-cost.test.mjs tests/process-observation.test.mjs` · acceptance-sha256:366b7f9ec5c8fce75c6a1b4767e683ccb3155066c3da9d60fb5a78772ac0576c · ms:12398
- 2026-10-29 · a276b4d6* · exit 1 · `(cd core && go test ./hooks -run '^TestNativeProcessTrace' -count=1 -timeout=90s) && env -u QUALITY_HARNESS_QH_BIN node --test --test-concurrency=1 tests/native-observation.test.mjs tests/hook-footprint.test.mjs tests/native-cost.test.mjs tests/process-observation.test.mjs` · acceptance-sha256:366b7f9ec5c8fce75c6a1b4767e683ccb3155066c3da9d60fb5a78772ac0576c · ms:9352 · test-lock-sha256:cbb2220b3d9561e826c3def1503202b5fa16c70215f2968b5b5c2bd694828061 · test-lock-file:docs/adr/locks/cbb2220b3d9561e826c3def1503202b5fa16c70215f2968b5b5c2bd694828061.lock
  ```
  --- last 10 line(s) of stdout (of 60 after folding 60 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 6,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-29 · a276b4d6* · exit 0 · `(cd core && go test ./hooks -run '^TestNativeProcessTrace' -count=1 -timeout=90s) && env -u QUALITY_HARNESS_QH_BIN node --test --test-concurrency=1 tests/native-observation.test.mjs tests/hook-footprint.test.mjs tests/native-cost.test.mjs tests/process-observation.test.mjs` · acceptance-sha256:366b7f9ec5c8fce75c6a1b4767e683ccb3155066c3da9d60fb5a78772ac0576c · ms:8443

## Mutation Log
- 2026-10-28 · a276b4d6* · mutant killed · exit 1 · `core/hooks/orientation.go` · A real native automatic project-check launch must trip the installed-launcher marker and native-attempt observer · acceptance-sha256:e221a0c0a8998dbd07db074e9b8b37dc2f8f325de595aa489d2587b4b73801ed
- 2026-10-29 · a276b4d6* · mutant killed · exit 1 · `core/hooks/orientation.go` · A real native automatic project-check launch must trip the installed-launcher marker and native-attempt observer · acceptance-sha256:366b7f9ec5c8fce75c6a1b4767e683ccb3155066c3da9d60fb5a78772ac0576c
