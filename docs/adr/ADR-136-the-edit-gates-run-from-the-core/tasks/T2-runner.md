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
| `core/hooks/shellhook_kill_unix.go` | add | The Unix process group and its kill at the deadline (added to this table after the first run) |
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
- 2026-11-01 · fe982baf* · mutant killed · exit 1 · `core/hooks/shellhook_run.go` · mutate.mjs --case ADR-136 T2 measured RED: with the gate left in qh's own process group the timeout scenario (hang) failed, the grandchild outliving the deadline · acceptance-sha256:378900aa416332584068a9f0e6704e4e730a8a626aee543a15e9ae5f92e0cbb0
- 2026-11-01 · fe982baf* · mutant killed · exit 1 · `core/hooks/shellhook_run.go` · mutate.mjs --case ADR-136 T2 measured RED: wrapping a non-zero exit's stdout as additionalContext failed the non-zero-exit and signal scenarios against Node's bytes · acceptance-sha256:378900aa416332584068a9f0e6704e4e730a8a626aee543a15e9ae5f92e0cbb0

## Invariants

Exit 0 on every path but an unknown script; stdout bytes match Node's (CLAUDE.md §19).

## Risks

Windows bash resolution and `taskkill` run only on CI's Windows job and the outside run.

## Stop Condition

Stop if a scenario cannot be compared without editing a locked test.

## Out of Scope

- The facts gate's event row (T3).

## Verification Log
- 2026-11-01 · fe982baf* · exit 1 · `set -o pipefail …` · acceptance-sha256:378900aa416332584068a9f0e6704e4e730a8a626aee543a15e9ae5f92e0cbb0 · ms:2118 · test-lock-sha256:472d37f4bec55198340688a2994d20776fd953f9c51b3c9268e265b023282420 · test-lock-file:docs/adr/locks/472d37f4bec55198340688a2994d20776fd953f9c51b3c9268e265b023282420.lock
  ```
  --- last 10 line(s) of stdout (of 278 after folding 278 raw)
        at TestContext.<anonymous> (file://~/CursorProjects/qh-adr136/tests/shell-hook-native.test.mjs:205:11)
        at async Test.run (node:internal/test_runner/test:1409:7)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: { status: 1, stdout: '', stderr: 'qh: could not run the hook CLI: exec: "node": executable file not found in $PATH\n' },
      expected: { status: 0, stdout: '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"partial"}}', stderr: '      2 [main] bash (46688) C:\\Program Files\\Git\\bin\\bash.exe: *** fatal error - add_item ("\\??\\C:\\Program Files\\Git", "/", ...) failed, errno 1\nquality-harness: the shell running post-edit-check.sh aborted before the gate could report, so treat this edit as unchecked rather than clean. Nothing is blocked.\n' },
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-01 · fe982baf* · exit 0 · `set -o pipefail …` · acceptance-sha256:378900aa416332584068a9f0e6704e4e730a8a626aee543a15e9ae5f92e0cbb0 · ms:3214
- 2026-11-01 · fe982baf* · exit 0 · `set -o pipefail …` · acceptance-sha256:378900aa416332584068a9f0e6704e4e730a8a626aee543a15e9ae5f92e0cbb0 · ms:3346
- 2026-11-01 · fe982baf* · exit 0 · `set -o pipefail …` · acceptance-sha256:378900aa416332584068a9f0e6704e4e730a8a626aee543a15e9ae5f92e0cbb0 · ms:3359
- 2026-11-01 · 5ee65f96f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:378900aa416332584068a9f0e6704e4e730a8a626aee543a15e9ae5f92e0cbb0 · ms:0 · test-lock-sha256:5b28993f078bd05a9cab9210426040c8ee6390f7fa39015ac937c6e25fc07d83 · test-lock-file:docs/adr/locks/5b28993f078bd05a9cab9210426040c8ee6390f7fa39015ac937c6e25fc07d83.lock · test-lock-kind:replace
- 2026-11-01 · c5a296af3* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:378900aa416332584068a9f0e6704e4e730a8a626aee543a15e9ae5f92e0cbb0 · ms:0 · test-lock-sha256:60d411faeb03afb91bf693b3cd577f353fca4ed61b1c0253d346ee7992628ce2 · test-lock-file:docs/adr/locks/60d411faeb03afb91bf693b3cd577f353fca4ed61b1c0253d346ee7992628ce2.lock · test-lock-kind:replace
