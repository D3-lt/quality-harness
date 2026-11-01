# Task ADR-136-T1: The core's shell-hook helpers answer as Node's do

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `shellhook.go` helpers
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Go versions of `normalizeHookPayload`, `hookFilePathFromPayload`, `hookArguments`, `resolveBashExecutable` (with its platform,
environment and existence seams), `shellHookTimeoutMs`, `shellRuntimeCrashed`, `persistedEventPath` and
`relativePathIsUninteresting` give the Node functions' answers on every corpus row.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/shellhook.go` | add | The helpers |
| `core/hooks/shellhook_parity_test.go` | add | Answers the corpus rows (`QH_SHELL_HOOK_CORPUS`) |
| `tests/shell-hook-parity.test.mjs` | add | Builds rows from the Node exports and runs the Go test |
| `tests/mutations/core/hooks/shellhook.go.json` | add | A changed helper is noticed |

## Ordered Steps

1. [S1] Write `tests/shell-hook-parity.test.mjs` on the pattern of tests/branch-state-parity.test.mjs: rows from the Node exports over both platforms (`win32` and `linux`/`darwin` passed as the parameter), Windows drive and UNC paths, payloads with and without `cwd`/`file_path`/`notebook_path`/`tool_response.filePath`, malformed JSON, bash candidates including the System32 and WindowsApps stubs and `CLAUDE_CODE_GIT_BASH_PATH`, timeout settings at and outside 100..110000, crash banners and look-alikes, relative paths with `..` and either separator. Require "N rows compared, 0 disagreements". Confirm it fails first.
2. [S2] Port the helpers into `core/hooks/shellhook.go` with the same seams, and answer the rows in `shellhook_parity_test.go`.
3. [S3] Add catalogue mutants (the stub filter, the timeout bounds, the crash banner, the Windows path rewrite) and record two killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/shell-hook-parity.test.mjs 2>&1 | tee "$out" && grep -q '✔ the core answers every shell-hook row as the Node functions do' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the core answers every shell-hook row as the Node functions do` | `tests/shell-hook-parity.test.mjs` | Row-for-row parity, and that rows were compared | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `core/hooks/shellhook.go` |
| 2 — selected | T2 |
| 3 — discoverable | T4 |
| 4 — used | T4 |

## Mutation Log
- 2026-11-01 · 3708502d* · mutant killed · exit 1 · `core/hooks/shellhook.go` · mutate.mjs --case ADR-136 T1 measured RED: the parity test failed once the PATH scan stopped skipping System32/WindowsApps · acceptance-sha256:0de33d836d0c7930005df25d070bbf0648e7df6c38f973444d3ed10d5db71865
- 2026-11-01 · 3708502d* · mutant killed · exit 1 · `core/hooks/shellhook.go` · mutate.mjs --case ADR-136 T1 measured RED: the parity test failed once a win32 UNC path value was left unrewritten · acceptance-sha256:0de33d836d0c7930005df25d070bbf0648e7df6c38f973444d3ed10d5db71865

## Invariants

run-shell-hook.mjs and every locked test are unchanged.

## Risks

A corpus that omits a shape proves nothing about it; the rows follow the Node tests' inputs.

## Stop Condition

Stop if a helper depends on state a row cannot carry; name it in the record.

## Out of Scope

- Running the child (T2).

## Verification Log
- 2026-11-01 · 3708502d* · exit 1 · `set -o pipefail …` · acceptance-sha256:0de33d836d0c7930005df25d070bbf0648e7df6c38f973444d3ed10d5db71865 · ms:353 · test-lock-sha256:4598831dcb22a42f7b650ce6420da50a5869ca5ac4850afa34d240ae1527459a · test-lock-file:docs/adr/locks/4598831dcb22a42f7b650ce6420da50a5869ca5ac4850afa34d240ae1527459a.lock
  ```
  --- last 10 line(s) of stdout (of 33 after folding 33 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: 'testing: warning: no tests to run\nPASS\nok  \tgithub.com/D3-lt/quality-harness/core/hooks\t0.005s [no tests to run]\n\n',
      expected: /1629 rows compared, 0 disagreements/,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-11-01 · 3708502d* · exit 0 · `set -o pipefail …` · acceptance-sha256:0de33d836d0c7930005df25d070bbf0648e7df6c38f973444d3ed10d5db71865 · ms:353
- 2026-11-01 · 3708502d* · exit 0 · `set -o pipefail …` · acceptance-sha256:0de33d836d0c7930005df25d070bbf0648e7df6c38f973444d3ed10d5db71865 · ms:790
- 2026-11-01 · 3708502d* · exit 0 · `set -o pipefail …` · acceptance-sha256:0de33d836d0c7930005df25d070bbf0648e7df6c38f973444d3ed10d5db71865 · ms:807
