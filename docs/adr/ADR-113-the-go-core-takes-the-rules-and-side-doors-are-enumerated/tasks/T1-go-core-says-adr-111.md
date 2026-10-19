# Task ADR-113-T1: The Go core says everything ADR-111 added

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** see ADR-113's Inter-task Contracts
**Consumes:** the config-problem origin (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Port ADR-111's five rules to the Go core and empty GO_LACKS and GO_GOLDENS (ADR-113, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/go-core-parity-adr-111.test.mjs` | add | the task's tests, each with a planted twin that must fail |
| `core/hooks/checkcmd.go`, `core/cmd/qh/main.go` | edit | the pytest-section rungs and their TOML lexer; `qh check-command <dir>`, the Go half of the inference comparison |
| `core/hooks/turnend.go`, `core/hooks/ledger.go` | edit | R5, the red-check opening, the baseline attribution (`baselineFor`), the tree-moved opening |
| `core/hooks/orientation.go` | edit | `startBaseline` at a startup SessionStart, detached |
| `core/hooks/lifecycle.go` | edit | gofmt only: an import order and a blank line T2 left |
| `tests/hook-golden.mjs`, `tests/goldens/checks.json`, `tests/goldens/go/checks.json` | edit, delete | `GO_LACKS` and `GO_GOLDENS` emptied; a parse error's detail is each JSON parser's own words, so the normaliser masks it, which is all the Go golden held |
| `tests/hook-goldens.test.mjs`, `docs/adr/ADR-111-the-turn-end-judges-against-a-baseline/tasks/T2-red-is-red-and-no-check-is-said.md` | edit | found executing: the Go-golden test pinned `checks` to the Go list, which Decision 1 empties; it now plants a list, and ADR-111 T2 is relocked |
| `.github/workflows/selftest.yml` | edit | the core job runs this task's tests against Go on every platform |

## Ordered Steps

1. [S1] Write the failing tests: the Go core speaks R5, the red-check opening, the baseline sentences, the tree-moved advice and the pytest sections as Node does; GO_LACKS and GO_GOLDENS are empty. Record the red run.
2. [S2] Implement on the Node path and in the Go core where the rule is a hook's, keeping them in parity.
3. [S3] Record a killed mutant per decision point, and add catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the Go core says what the Node path says about ADR-111's rules` | `tests/go-core-parity-adr-111.test.mjs` | R5, the red-check opening, the baseline sentences, the tree-moved advice and the pytest sections on both paths; GO_LACKS and GO_GOLDENS empty | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the finding's text, or the gate's output |
| 4 — it is used | every session and every gate run |

## Mutation Log
- 2026-10-19 · a9344016* · mutant killed · exit 1 · `core/hooks/checkcmd.go` · the Go core infers no pytest from a manifest section · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0
- 2026-10-19 · a9344016* · mutant killed · exit 1 · `core/hooks/checkcmd.go` · an escaped quote closes a multi-line basic string again · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0
- 2026-10-19 · a9344016* · mutant killed · exit 1 · `core/hooks/turnend.go` · the Go turn end never says R5 · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0
- 2026-10-19 · a9344016* · mutant killed · exit 1 · `core/hooks/turnend.go` · a red check is said as no check passed again · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0
- 2026-10-19 · a9344016* · mutant killed · exit 1 · `core/hooks/turnend.go` · the baseline verdict never reaches the opening · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0
- 2026-10-19 · a9344016* · mutant killed · exit 1 · `core/hooks/turnend.go` · a run the tree moved under is said as could-not-start · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0
- 2026-10-19 · a9344016* · mutant killed · exit 1 · `core/hooks/orientation.go` · SessionStart never starts the baseline · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0
- 2026-10-19 · a9344016* · mutant survived · exit 0 · `core/hooks/ledger.go` · an unbound baseline row is read as a baseline · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-19 · a9344016* · mutant killed · exit 1 · `core/hooks/ledger.go` · an unbound baseline row is read as a baseline · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0

## Invariants

- Gates advise and two refusals are sanctioned (CLAUDE.md §3); nothing here adds a refusal outside them.
- The Node path and the Go core say the same thing at each commit.

## Risks

- A planted twin that does not fail proves nothing; each is shown failing in the same test.

## Stop Condition

Stop if a change would add a refusal outside the two sanctioned ones, or if parity cannot be kept without a design decision.

## Out of Scope

- ADR-110 T3's cutover (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
- 2026-10-19 · a9344016* · exit 1 · `QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:032115ccdea3b45cc2d84dd5e55c4d9c43282e20f89269f2b5dec0f867cceed9 · ms:17647 · test-lock-sha256:4d892ec762e5bc2d7aa6013bb7b715d5d10e6b91791d103a400c1a89ecd357ad · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZ28tY29yZS1wYXJpdHktYWRyLTExMS50ZXN0Lm1qcwl0aGUgR28gY29yZSBzYXlzIHdoYXQgdGhlIE5vZGUgcGF0aCBzYXlzIGFib3V0IEFEUi0xMTEncyBydWxlcwllZjJhMTJkMmQxZTczNzIxZTNjNWY3YTVkODAzYTBlNDUyMGM5NjNmNjZlNGY1MDJlMGZjZTAwN2I1YTNjNjQ3
  ```
  --- last 10 line(s) of stdout (of 141 after folding 141 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: [ 'a red check then done, and a changed tree with no check then done, are said at the turn end' ],
      expected: [],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:11962
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:11629
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:11307
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:11070
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:10904
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:11334
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:11034
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:11431
- 2026-10-19 · a9344016* · exit 0 · `go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/go-core-parity-adr-111.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/baseline.test.mjs tests/adr-108.test.mjs` · acceptance-sha256:9979da93fc00994306e95c005f3701847c87765bf5e999ac868e022a9639b4a0 · ms:11628
