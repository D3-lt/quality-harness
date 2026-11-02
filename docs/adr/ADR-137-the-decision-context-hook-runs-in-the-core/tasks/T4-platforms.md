# Task ADR-137-T4: The core's decision context answers per platform

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** Go `decisionContext` (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The Go reader takes the platform as a parameter where Node does (listedPath, separators, realpath case), and answers win32 and
darwin rows as Node does on this machine.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/decisioncorpus.go` | edit | Platform parameters |
| `core/hooks/orientation.go` | edit | listedPath and hasDecisionCorpus take the platform |
| `core/hooks/decisioncorpus_read.go` | edit | dcListedPath folds into listedPath; the running-platform reads that mirror Node's are said to be deliberate |
| `core/hooks/pending.go` | edit | The gate passes the platform |
| `core/hooks/decisioncorpus_parity_test.go` | edit | Answers the listedPath and hasDecisionCorpus rows |
| `tests/mutations/core/hooks/orientation.go.json` | edit | The win32 separator arm is noticed |
| `tests/decision-context-parity.test.mjs` | edit | win32 and darwin rows: backslash names, case-variant READMEs |

## Ordered Steps

1. [S1] Add `the core answers every per-platform record row as Node does`: rows with the platform passed in for backslash names, case-variant READMEs and case-insensitive realpath placement. Confirm it fails first.
2. [S2] Thread the platform through listedPath and the reader.
3. [S3] Add a mutant dropping the win32 separator arm; record it killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/decision-context-parity.test.mjs 2>&1 | tee "$out" && grep -q '✔ the core answers every per-platform record row as Node does' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the core answers every per-platform record row as Node does` | `tests/decision-context-parity.test.mjs` | win32 and darwin answers | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the platform parameters |
| 2 — selected | the Go reader |
| 3 — discoverable | T3 |
| 4 — used | every platform's hook |

## Mutation Log
- 2026-11-01 · f75c3cce0* · mutant killed · exit 1 · `core/hooks/orientation.go` · listedPath's win32 arm dropped: on win32 Node lists docs\adr\ADR-001-x.md as docs/adr/ADR-001-x.md and the core kept the backslashes, so hasDecisionCorpus and the backslash-listed record rows disagree · acceptance-sha256:14c64e8d2da29a3f43db0c2d5e8c90d78d5d1b5b835d0818662206d025b2befe

## Invariants

The darwin and linux answers from T2 are unchanged.

## Risks

Windows realpath is checked only on CI's Windows job and the outside run.

## Stop Condition

Stop if a platform answer cannot be reproduced without the real platform; name it.

## Out of Scope

- Python's reader.

## Verification Log
- 2026-11-01 · f75c3cce0* · exit 1 · `set -o pipefail …` · acceptance-sha256:14c64e8d2da29a3f43db0c2d5e8c90d78d5d1b5b835d0818662206d025b2befe · ms:1136 · test-lock-sha256:395477d5f9c7a71582ae8a1d6b6a34d10acc7a6579c1d01249e88242073960ff · test-lock-file:docs/adr/locks/395477d5f9c7a71582ae8a1d6b6a34d10acc7a6579c1d01249e88242073960ff.lock
  ```
  --- last 10 line(s) of stdout (of 75 after folding 77 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 1,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-01 · f75c3cce0* · exit 0 · `set -o pipefail …` · acceptance-sha256:14c64e8d2da29a3f43db0c2d5e8c90d78d5d1b5b835d0818662206d025b2befe · ms:1631
- 2026-11-01 · f75c3cce0* · exit 0 · `set -o pipefail …` · acceptance-sha256:14c64e8d2da29a3f43db0c2d5e8c90d78d5d1b5b835d0818662206d025b2befe · ms:1683
- 2026-11-02 · 85237d896* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:14c64e8d2da29a3f43db0c2d5e8c90d78d5d1b5b835d0818662206d025b2befe · ms:0 · test-lock-sha256:ef02c0acec5edd4dc7e1ee331f42db534d79c3f0b90bbda35564cdce105dbc29 · test-lock-file:docs/adr/locks/ef02c0acec5edd4dc7e1ee331f42db534d79c3f0b90bbda35564cdce105dbc29.lock · test-lock-kind:replace
- 2026-11-02 · ef88e82fd* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:14c64e8d2da29a3f43db0c2d5e8c90d78d5d1b5b835d0818662206d025b2befe · ms:0 · test-lock-sha256:2c0e2aac40b5a07c1ed5d70765734f5be86b184bcf4c64d78c852184ab8254b6 · test-lock-file:docs/adr/locks/2c0e2aac40b5a07c1ed5d70765734f5be86b184bcf4c64d78c852184ab8254b6.lock · test-lock-kind:replace
