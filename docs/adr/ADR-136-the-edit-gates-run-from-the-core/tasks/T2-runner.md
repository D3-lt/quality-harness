# Task ADR-136-T2: The core runs post-edit-check as runShellHook does

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** native `runShellHook`
**Consumes:** `shellhook.go` helpers (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A native `runShellHook` spawns the resolved bash on the script with the same arguments, stdin, environment and timeout, ends
the gate's whole tree at the deadline (Unix group, Windows `taskkill /T /F`), and prints what Node prints: the
`additionalContext` wrapping, the failure messages and exit codes.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/shellhook_run.go` | add | The runner, behind QH_SHELL_HOOK_NATIVE=1 until T4 |
| `core/hooks/shellhook_kill_windows.go` | add | `taskkill /T /F` at the deadline |
| `core/hooks/bridge.go` | edit | Selects the native runner under the flag |
| `tests/shell-hook-native.test.mjs` | add | Scenarios through both runners |
| `tests/mutations/core/hooks/shellhook_run.go.json` | add | Wrapping, timeout and tree mutants |

## Ordered Steps

1. [S1] Write `tests/shell-hook-native.test.mjs`: `post-edit-check.sh`-shaped stub scripts in a scratch plugin root, run through `node run-shell-hook.mjs` and through `qh bridge shell-hook` with QH_SHELL_HOOK_NATIVE=1, comparing stdout, stderr and exit: a passing gate that prints (wrapped as additionalContext), one that prints nothing, a non-zero exit, a timeout under a short QUALITY_HARNESS_SHELL_TIMEOUT_MS whose script leaves a grandchild (none survives), a child killed by a signal, an MSYS crash banner, an unknown script (exit 2). Confirm it fails first.
2. [S2] Implement the runner with a signal-aware variant of ADR-135's runner and the Windows tree kill.
3. [S3] Add mutants on the wrapping condition, the timeout message and the tree kill; record two killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/shell-hook-native.test.mjs 2>&1 | tee "$out" && grep -q '✔ the native shell hook says what the Node runner says in every scenario' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the native shell hook says what the Node runner says in every scenario` | `tests/shell-hook-native.test.mjs` | Output, messages, exits and no survivor | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `shellhook_run.go` |
| 2 — selected | `qh bridge shell-hook post-edit-check.sh` under the flag |
| 3 — discoverable | T4 |
| 4 — used | T4 |

## Mutation Log

## Invariants

Exit 0 on every path but an unknown script; stdout bytes match Node's (CLAUDE.md §19).

## Risks

Windows bash resolution and `taskkill` run only on CI's Windows job and the outside run.

## Stop Condition

Stop if a scenario cannot be compared without editing a locked test.

## Out of Scope

- The facts gate's event row (T3).

## Verification Log
