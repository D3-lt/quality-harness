# Task ADR-113-T2: A broken config and an mrw write are seen by both refusals

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** see ADR-113's Inter-task Contracts
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A configuration that cannot be read is said, never read as no check, and mrw's MCP write is a write to every hook that watches writes (ADR-113, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/refusals-hold.test.mjs` | add | the task's tests, each with a planted twin that must fail |
| `plugin/scripts/check-command.mjs`, `core/hooks/checkcmd.go` | edit | an unreadable `.quality-harness.json` is origin `unreadable` where no rung could infer a check (a rung that answers still stands, as the locked `a project that declares its check is asked for that check` requires); `projectConfigProblem` ported to Go |
| `plugin/scripts/publish-verdict.mjs`, `core/hooks/publish.go` | edit | the verdict speaks and refuses over `unreadable`, naming the problem; `mcp__mrw__mrw_write` is a read-only editing tool |
| `plugin/scripts/completion-rules.mjs`, `core/hooks/turnend.go` | edit | `unreadable` is a check nobody can pass, so R1 runs and names the problem |
| `plugin/scripts/session-orientation.mjs`, `core/hooks/orientation.go` | edit | SessionStart says the problem |
| `plugin/scripts/hook-record.mjs`, `core/hooks/lifecycle.go` | edit | `MRW_WRITE` in the mutation tools; `mrwPlanPaths` records one write per path the plan names |
| `plugin/hooks/hooks.json`, `scripts/components.json` | edit | PreToolUse matches `mcp__mrw__mrw_write`, and a PostToolUse lifecycle group for it; the manifest declares both |
| `tests/hook-goldens.test.mjs`, `tests/hook-golden.mjs`, `tests/goldens/{checks,mrw-writes}.json`, `tests/goldens/go/checks.json` | edit, add | a golden for the mrw write; a Go run updates Go's own golden |
| `.github/workflows/selftest.yml` | edit | CI's `core` job runs `tests/refusals-hold.test.mjs` against the Go binary |

## Ordered Steps

1. [S1] Write the failing tests: a broken config beside a declared check keeps PreToolUse's refusal and says the problem; a read-only reviewer's mcp__mrw__mrw_write is refused; both on Node and Go. Record the red run.
2. [S2] Implement on the Node path and in the Go core where the rule is a hook's, keeping them in parity.
3. [S3] Record a killed mutant per decision point, and add catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/refusals-hold.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a broken config and an mrw write are seen by both refusals` | `tests/refusals-hold.test.mjs` | the config-problem origin and mrw's MCP write as a write, on both paths, each with its failing twin | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the finding's text, or the gate's output |
| 4 — it is used | every session and every gate run |

## Mutation Log
- 2026-10-19 · ba02e831* · mutant killed · exit 1 · `plugin/scripts/check-command.mjs` · a broken config reads as no declared check again · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848
- 2026-10-19 · ba02e831* · mutant killed · exit 1 · `plugin/scripts/publish-verdict.mjs` · the publish verdict says nothing over an unreadable declaration · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848
- 2026-10-19 · ba02e831* · mutant killed · exit 1 · `plugin/scripts/publish-verdict.mjs` · a read-only reviewer may write through mrw again · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848
- 2026-10-19 · ba02e831* · mutant killed · exit 1 · `plugin/scripts/hook-record.mjs` · an mrw write is recorded without its plan's paths · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848
- 2026-10-19 · ba02e831* · mutant killed · exit 1 · `plugin/hooks/hooks.json` · the host never calls PreToolUse for an mrw write · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848
- 2026-10-19 · ba02e831* · mutant survived · exit 0 · `plugin/scripts/completion-rules.mjs` · the turn end reads an unreadable declaration as no check · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-19 · ba02e831* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · the turn end reads an unreadable declaration as no check · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848

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
- 2026-10-19 · ba02e831* · exit 1 · `node --test tests/refusals-hold.test.mjs` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:574 · test-lock-sha256:3a468583f79bcccf72dde9caaa1f587c311219c437979b17027f118312ea7a22 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVmdXNhbHMtaG9sZC50ZXN0Lm1qcwlhIGJyb2tlbiBjb25maWcgYW5kIGFuIG1ydyB3cml0ZSBhcmUgc2VlbiBieSBib3RoIHJlZnVzYWxzCTRmMjU1YmFkNjg0NTAyNzc5ZWQ3M2Y3NWYzNzNjMTllNTNiOGNlYTUxMWMzMGM0MDg2ZjJlZWI3ZGNhMDY0OTg
  ```
  --- last 10 line(s) of stdout (of 32 after folding 32 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: undefined,
      expected: 'deny',
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-19 · ba02e831* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:0 · test-lock-sha256:a2da53fe22616c14b6b993b17bc64638a41454931f6a966b711d0e567028e25e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVmdXNhbHMtaG9sZC50ZXN0Lm1qcwlhIGJyb2tlbiBjb25maWcgYW5kIGFuIG1ydyB3cml0ZSBhcmUgc2VlbiBieSBib3RoIHJlZnVzYWxzCWJlZTJlOGU5MGU2YmZiZWZiMWZkNzI3OWViYTMyYWY0ZmY1ZDVkYzM1ZDU4ZDI4Mjg5Njc3ZTNiMWE1ODczNWY · test-lock-kind:replace
- 2026-10-19 · ba02e831* · exit 0 · `node --test tests/refusals-hold.test.mjs` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:1509
- 2026-10-19 · ba02e831* · exit 0 · `node --test tests/refusals-hold.test.mjs` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:1549
- 2026-10-19 · ba02e831* · exit 0 · `node --test tests/refusals-hold.test.mjs` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:1518
- 2026-10-19 · ba02e831* · exit 0 · `node --test tests/refusals-hold.test.mjs` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:1521
- 2026-10-19 · ba02e831* · exit 0 · `node --test tests/refusals-hold.test.mjs` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:1755
- 2026-10-19 · ba02e831* · exit 0 · `node --test tests/refusals-hold.test.mjs` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:1513
- 2026-10-19 · ba02e831* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:0 · test-lock-sha256:41de9d48ae6062657cb8b24552b789a42296f5fe160e817b884bb4c5f8f2885a · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVmdXNhbHMtaG9sZC50ZXN0Lm1qcwlhIGJyb2tlbiBjb25maWcgYW5kIGFuIG1ydyB3cml0ZSBhcmUgc2VlbiBieSBib3RoIHJlZnVzYWxzCTQ5MWE1ZTIwNzI5NzkwZTYwYTZmMzhhYWUxZWQ5ZTQ3NGU2NGY5ZjE4NGY1MzMwMmJlZDgyMzk2MDNhZGRjYmI · test-lock-kind:replace
- 2026-10-19 · ba02e831* · exit 0 · `node --test tests/refusals-hold.test.mjs` · acceptance-sha256:0f577834db0b0ad6880c8109cb43d2065c159194985f47d796ac80093cf50848 · ms:1926
