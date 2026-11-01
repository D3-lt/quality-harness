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
| `core/hooks/orientation.go` | edit | listedPath takes the platform |
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

## Invariants

The darwin and linux answers from T2 are unchanged.

## Risks

Windows realpath is checked only on CI's Windows job and the outside run.

## Stop Condition

Stop if a platform answer cannot be reproduced without the real platform; name it.

## Out of Scope

- Python's reader.

## Verification Log
