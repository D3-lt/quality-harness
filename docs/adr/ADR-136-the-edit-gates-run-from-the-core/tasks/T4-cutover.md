# Task ADR-136-T4: The registrations call the core's runner

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** native `runEditGate` (T3), native `runShellHook` (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Both registered runs are answered by the core with no flag and no node on PATH; `--batch` and unregistered names keep the
Node path.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/bridge.go` | edit | The registered scripts are native by default |
| `tests/shell-hook-native.test.mjs` | edit | The registrations run with no node on PATH |
| `tests/native-observation.test.mjs` | edit if needed | A Go→Node example that still spawns Node; relock ADR-131 T2 if a locked body moves |
| `tests/native-hooks.test.mjs` | edit if needed | Its budget regex over bridge.go |
| `scripts/components.json` | edit | The additionalContext producer |
| `docs/architecture.md` | edit | Line 109 |

## Ordered Steps

1. [S1] Add `the edit-gate registrations spawn no node`: both registered commands with no flag, over a PATH without node, exit 0 and print the gate's answer. Confirm it fails first.
2. [S2] Switch `RunBridge` for the registered scripts; keep `executeNodeCLI` for `--batch` and other names. Repoint any test whose Go→Node example now runs natively, relocking a locked task with `--replace-hashes` and saying so in the record.
3. [S3] Update the documents and manifest that name run-shell-hook.mjs as the registered runner. [proof: acceptance]
4. [S4] Add a mutant restoring the Node path for a registered script; record it killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/shell-hook-native.test.mjs tests/native-observation.test.mjs tests/qh-launcher.test.mjs 2>&1 | tee "$out" && grep -q '✔ the edit-gate registrations spawn no node' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the edit-gate registrations spawn no node` | `tests/shell-hook-native.test.mjs` | The per-edit path is native | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | T2, T3 |
| 2 — selected | `RunBridge` |
| 3 — discoverable | hooks.json, unchanged |
| 4 — used | Every Edit, Write, MultiEdit and NotebookEdit |

## Mutation Log

## Invariants

hooks.json is unchanged; `--batch` still reaches Node.

## Risks

A Windows-only difference shows only on CI's Windows job and the outside run.

## Stop Condition

Stop if the outside run or a CI platform disagrees with the native output.

## Out of Scope

- The rest of BACKLOG §438.

## Verification Log
