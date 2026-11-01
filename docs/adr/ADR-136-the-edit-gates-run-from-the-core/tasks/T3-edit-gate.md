# Task ADR-136-T3: The core runs the facts gate as runEditGate does

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** native `runEditGate`
**Consumes:** native `runShellHook` (T2), `shellhook.go` helpers (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A native `runEditGate` runs the facts gate through the native runner, skips an uninteresting path as Node does, and appends
the same `artifact.gated` row: key, blob before, and `complete` only for a passing gate over a file unchanged during it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/shellhook_run.go` | edit | The edit gate and its event row |
| `tests/shell-hook-native.test.mjs` | edit | Facts-gate scenarios through both runners |
| `tests/mutations/core/hooks/shellhook_run.go.json` | edit | Event-row mutants |

## Ordered Steps

1. [S1] Add `the native edit gate records what the Node one records`: facts-gate-shaped stubs through both runners, comparing output and the session's event rows (an edit to a tracked file, a file edited while its gate ran, an uninteresting path, a missing session_id or cwd, a failing and an UNPROVEN gate). Confirm it fails first.
2. [S2] Implement it with eventlog.go's canonicalFile, contentId and appendEvent.
3. [S3] Add mutants on `complete` and the uninteresting skip; record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/shell-hook-native.test.mjs 2>&1 | tee "$out" && grep -q '✔ the native edit gate records what the Node one records' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the native edit gate records what the Node one records` | `tests/shell-hook-native.test.mjs` | Output and event rows match | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `runEditGate` in Go |
| 2 — selected | `qh bridge shell-hook facts-gate-dispatch.sh` under the flag |
| 3 — discoverable | T4 |
| 4 — used | T4 |

## Mutation Log

## Invariants

The row's shape and key match event-log.mjs; a gate never answered is never recorded complete.

## Risks

A canonical-key difference on symlinks or 8.3 names; tests/artifact-key.test.mjs holds Node's side.

## Stop Condition

Stop if the Go canonical key disagrees with Node's on any fixture.

## Out of Scope

- The batch (BACKLOG §438).

## Verification Log
