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
- 2026-11-01 · 9fedc933* · mutant killed · exit 1 · `core/hooks/shellhook_run.go` · Sending the registered gates back to the Node runner makes the registration fail where node is not on PATH; the no-node test fails. · acceptance-sha256:09a4154dbdb7c3602580c18a8d121d94cd2fe3d33c94b2b17051f2658ccc8456

## Invariants

hooks.json is unchanged; `--batch` still reaches Node.

## Risks

A Windows-only difference shows only on CI's Windows job and the outside run.

## Stop Condition

Stop if the outside run or a CI platform disagrees with the native output.

## Out of Scope

- The rest of BACKLOG §438.

## Verification Log
- 2026-11-01 · 9fedc933* · exit 1 · `set -o pipefail …` · acceptance-sha256:09a4154dbdb7c3602580c18a8d121d94cd2fe3d33c94b2b17051f2658ccc8456 · ms:4028 · test-lock-sha256:ba80df441dc39ed8087627474778195f8ae9b0c95f5378352c73c2dc14bbf003 · test-lock-file:docs/adr/locks/ba80df441dc39ed8087627474778195f8ae9b0c95f5378352c73c2dc14bbf003.lock
  ```
  --- last 10 line(s) of stdout (of 58 after folding 59 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 1,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-01 · 9fedc933* · exit 0 · `set -o pipefail …` · acceptance-sha256:09a4154dbdb7c3602580c18a8d121d94cd2fe3d33c94b2b17051f2658ccc8456 · ms:4088
- 2026-11-01 · 9fedc933* · exit 0 · `set -o pipefail …` · acceptance-sha256:09a4154dbdb7c3602580c18a8d121d94cd2fe3d33c94b2b17051f2658ccc8456 · ms:4206
- 2026-11-01 · 5ee65f96f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:09a4154dbdb7c3602580c18a8d121d94cd2fe3d33c94b2b17051f2658ccc8456 · ms:0 · test-lock-sha256:5b28993f078bd05a9cab9210426040c8ee6390f7fa39015ac937c6e25fc07d83 · test-lock-file:docs/adr/locks/5b28993f078bd05a9cab9210426040c8ee6390f7fa39015ac937c6e25fc07d83.lock · test-lock-kind:replace
- 2026-11-01 · c5a296af3* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:09a4154dbdb7c3602580c18a8d121d94cd2fe3d33c94b2b17051f2658ccc8456 · ms:0 · test-lock-sha256:60d411faeb03afb91bf693b3cd577f353fca4ed61b1c0253d346ee7992628ce2 · test-lock-file:docs/adr/locks/60d411faeb03afb91bf693b3cd577f353fca4ed61b1c0253d346ee7992628ce2.lock · test-lock-kind:replace
