# Task ADR-114-T1: `qh mcp` serves the four resources

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `qh mcp`
**Consumes:** none
**Data dependency:** hermetic for the tests; Decision 3's registration needs an outside session's measured use
**Proof map:** v1

## Goal

`qh mcp` answers `resources/list` and `resources/read` for branch state, the latest check, the open turn-end findings and the baseline, each from its ledger (ADR-114, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/qh-mcp-resources.test.mjs` | add | the task's test, with a planted unreadable ledger that must answer UNRUN |
| `core/cmd/qh/main.go`, `core/hooks/mcp.go` | add | the subcommand and the server; in the hooks package, so it reads the ledgers through the same `stateDir`, `readEvents` and JSON helpers the hooks write them with |
| `.github/workflows/selftest.yml` | edit | the core job runs this task's test with Go required |
| `tests/qh-mcp-resources.test.mjs` | edit | found executing: the test took its baseline after the write, which qh-check rightly kept unbound, so the resource rightly said none was kept; the baseline now comes first, and the test is relocked |

## Ordered Steps

1. [S1] Write the failing test: each resource read after a scripted session says what the hook said, and an unreadable ledger answers UNRUN. Record the red run.
2. [S2] Build the server in the Go core, read-only.
3. [S3] Record a killed mutant per resource. [proof: mutation]

## Acceptance

```bash
node --test tests/qh-mcp-resources.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `each resource says what its ledger holds, and an unreadable one says so` | `tests/qh-mcp-resources.test.mjs` | the four resources against the hook's output, and UNRUN on a planted unreadable ledger | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the subcommand |
| 2 — something selects it | `plugin/.mcp.json`, only after Decision 3's measurement |
| 3 — the caller can discover it | `resources/list` |
| 4 — it is used | nothing until registered |

## Mutation Log
- 2026-10-19 · 2f70ffdd* · mutant killed · exit 1 · `core/hooks/mcp.go` · a ledger that cannot be read is served as one never written · acceptance-sha256:42a2fb6c0682b557ce8969965b4ae3bf510b9a25ba589d188bd75a8f863018f4
- 2026-10-19 · 2f70ffdd* · mutant killed · exit 1 · `core/hooks/mcp.go` · the findings of an earlier turn are served as the last turn · acceptance-sha256:42a2fb6c0682b557ce8969965b4ae3bf510b9a25ba589d188bd75a8f863018f4
- 2026-10-19 · 2f70ffdd* · mutant killed · exit 1 · `core/hooks/mcp.go` · a notification is answered · acceptance-sha256:42a2fb6c0682b557ce8969965b4ae3bf510b9a25ba589d188bd75a8f863018f4

## Invariants

- The resources read; nothing writes a ledger.
- A ledger that cannot be read is never answered as empty (ADR-005).

## Risks

- A resource that recomputes state instead of reading it drifts from the hook; the test compares the two on one session.

## Stop Condition

Stop if ADR-114 is not Accepted.

## Out of Scope

- Registering the server (deferred: docs/adr/ADR-114-the-core-serves-state-as-mcp-resources.md, Decision 3)

## Verification Log
- 2026-10-19 · 2f70ffdd* · exit 1 · `node --test tests/qh-mcp-resources.test.mjs` · acceptance-sha256:42a2fb6c0682b557ce8969965b4ae3bf510b9a25ba589d188bd75a8f863018f4 · ms:1109 · test-lock-sha256:a2610f651bbdf5666178146776c1618a28fe11b6c819aeeb131cdc081e097eb8 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcWgtbWNwLXJlc291cmNlcy50ZXN0Lm1qcwllYWNoIHJlc291cmNlIHNheXMgd2hhdCBpdHMgbGVkZ2VyIGhvbGRzLCBhbmQgYW4gdW5yZWFkYWJsZSBvbmUgc2F5cyBzbwljYTNlNWYyOWQ4YzQzZDVkOGExMGEyOGVlYmQ1ZjZlYTE3NjkxYjMxMmI1MDhkN2IxNDBmMGE2ZTMyZGNlOGRl
  ```
  --- last 10 line(s) of stdout (of 32 after folding 33 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 2,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-19 · 2f70ffdd* · exit 0 · `node --test tests/qh-mcp-resources.test.mjs` · acceptance-sha256:42a2fb6c0682b557ce8969965b4ae3bf510b9a25ba589d188bd75a8f863018f4 · ms:2145
- 2026-10-19 · 2f70ffdd* · exit 0 · `node --test tests/qh-mcp-resources.test.mjs` · acceptance-sha256:42a2fb6c0682b557ce8969965b4ae3bf510b9a25ba589d188bd75a8f863018f4 · ms:1973
- 2026-10-19 · 2f70ffdd* · exit 0 · `node --test tests/qh-mcp-resources.test.mjs` · acceptance-sha256:42a2fb6c0682b557ce8969965b4ae3bf510b9a25ba589d188bd75a8f863018f4 · ms:1963
- 2026-10-19 · b26ebd8a* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:42a2fb6c0682b557ce8969965b4ae3bf510b9a25ba589d188bd75a8f863018f4 · ms:0 · test-lock-sha256:d2b658058be030e1a13ef83eb448e060f3a3a2b20cb4fdc0629c03fc3ca965f3 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcWgtbWNwLXJlc291cmNlcy50ZXN0Lm1qcwllYWNoIHJlc291cmNlIHNheXMgd2hhdCBpdHMgbGVkZ2VyIGhvbGRzLCBhbmQgYW4gdW5yZWFkYWJsZSBvbmUgc2F5cyBzbwljZDk1MTA5NGE0OGU1MTQ3Zjc2MzgyNWE4ZDM4MzU5ODE4ODI4MWYxNjRkNTI5ZGJkZDlhMDczMjQyZjE0YzIz · test-lock-kind:replace
