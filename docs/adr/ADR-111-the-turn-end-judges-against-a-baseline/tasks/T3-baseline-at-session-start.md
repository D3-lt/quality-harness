# Task ADR-111-T3: The baseline is taken at session start and read at the turn end

**Depends-on:** T2, T4
**Covers:** none — no spec
**Estimated scope:** L (qh-check, the SessionStart hook, the turn-end judgement, the ledger readers)
**Owner:** Zy
**Produces:** `qh-check --baseline`; `baseline: true` rows in `checks.jsonl`; the two baseline sentences in R1
**Consumes:** the red-check lead in R1 (T2); the rules the Go core lacks, named in the parity tests (T4)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

SessionStart starts one detached `qh-check --baseline` on the session's starting tree, and the turn end names a regression
(baseline green, current red) and an inherited red (baseline red, current red) apart (ADR-111, Decisions 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-check.mjs` | edit | `--baseline <tree>`: runs the check in the repository, binds the result to `<tree>` only when the tree before and after the run are that tree, writes `baseline.jsonl`, takes the machine lease, never reads or writes `checks.jsonl` (ADR-111 Decision 1's correction) |
| `plugin/scripts/lifecycle.mjs` | edit | SessionStart `startup` starts it detached under the fence deadline, as the artifact pass is started |
| `plugin/scripts/completion-rules.mjs` | edit | the two baseline sentences |
| `plugin/scripts/check-ledger.mjs` | edit | the reader of `baseline.jsonl` for a tree; no reader of `checks.jsonl` changes |
| `tests/hook-golden.mjs` | edit | `QUALITY_HARNESS_BASELINE_RUNNER=off` in the sandbox environment, so the goldens and the parity test stay deterministic and a Go run is not compared with a Node-only child |
| `tests/baseline.test.mjs` | add | the mode, the start, the two sentences, the twins |
| `tests/mutations/plugin/scripts/*.json` | edit | a mutant per decision point |

## Ordered Steps

1. [S1] Write the failing tests: `qh-check --baseline` records `baseline: true` against the starting tree; SessionStart `startup` starts it and `resume`/`compact` do not; a SessionStart hook returns before the baseline finishes; baseline green and current red names the regression; baseline red and current red names the inherited red; no baseline record says neither; a baseline row never satisfies "a check passed on this tree" for the publish gate. Record the red run.
2. [S2] Implement the mode and the start, reusing the artifact pass's detach, deadline and lease.
3. [S3] Implement the two sentences beside T2's red-check lead.
4. [S4] Audit the class: every writer and reader of `checks.jsonl` (`mrw read --grep "checks\.jsonl|CHECKS_LEDGER" plugin/ core/`), with the command and its output in this task's sign-off; none may read `baseline.jsonl`, and a test shows a baseline pass on the starting tree leaves the same-tree skip and the publish verdict as they were.
5. [S5] Measure the adopter cost (§19) on a fresh repository and on a corpus: SessionStart wall time unchanged within noise, and the baseline run's wall time and load. [proof: human: the timings, the load, where they were measured]
6. [S6] Record a killed mutant per decision point. [proof: mutation]

## Acceptance

```bash
node --test tests/baseline.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `qh-check --baseline records against the starting tree and holds no git lock` | `tests/baseline.test.mjs` | the mode | — | S1, S2 |
| `only a startup SessionStart starts the baseline, and it waits for nothing` | `tests/baseline.test.mjs` | the start | — | S1, S2 |
| `a green baseline and a red current run name the regression; a red baseline names the inherited red` | `tests/baseline.test.mjs` | both sentences and the no-record twin | — | S1, S3 |
| `a baseline pass leaves the same-tree skip as it was` | `tests/baseline.test.mjs` | the class audit's discriminating reader (the publish verdict says nothing of a tree unchanged since the session began) | — | S1, S4 |
| `a session whose check was green at its start and is red after an edit is told the change broke it` | `tests/baseline.test.mjs` | the selection: SessionStart's default runner is qh-check, end to end | — | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `qh-check --baseline` |
| 2 — something selects it | SessionStart in `lifecycle.mjs`; the mutant that deletes the start |
| 3 — the caller can discover it | `qh-check --help`; the turn-end sentences |
| 4 — it is used | ADR-112's arms |

## Mutation Log
- 2026-10-18 · 93978b02* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a run whose tree is not the asked tree is bound to it · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 93978b02* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · a baseline is written to the ledger a pass is read from · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 93978b02* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a baseline is taken again on a tree that already has one · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 93978b02* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · an unbound row stands for a kept baseline · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 93978b02* · mutant killed · exit 1 · `plugin/scripts/on-session-start.mjs` · SessionStart no longer starts the baseline · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 93978b02* · mutant killed · exit 1 · `plugin/scripts/on-session-start.mjs` · a repository with no check starts a baseline · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 93978b02* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · a green baseline under a red run is not said as a regression · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 93978b02* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · the turn end never reads the baseline ledger · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 3c42f633* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · a red run of another command is said as this change's regression · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 3c42f633* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · a red run the tree moved under is said as this change's regression · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe
- 2026-10-18 · 3c42f633* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a baseline waits for its turn when the environment asks · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe

## Invariants

- No hook waits on the baseline (ADR-080).
- A baseline red is never said as a pass, and a baseline green never certifies the current tree.
- A baseline row is never a release check.

## Risks

- A slow suite's baseline finishes after the first turn end; that turn end says nothing new.
- Two sessions on one checkout run two baselines; the machine lease serialises them.

## Stop Condition

Stop if the baseline cannot run without a git lock, or if any hook would have to wait on it.

## Out of Scope

- Per-test comparison (deferred: docs/BACKLOG.md §383)

## Verification Log
- 2026-10-18 · 93978b02* · exit 1 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:6207 · test-lock-sha256:dde7fe11f6afa9887b25735e3908041d24ca3bf5f8ba65af7506430ec36900ff · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYmFzZWxpbmUudGVzdC5tanMJYSBiYXNlbGluZSBwYXNzIGxlYXZlcyB0aGUgc2FtZS10cmVlIHNraXAgYW5kIHRoZSBwdWJsaXNoIHZlcmRpY3QgYXMgdGhleSB3ZXJlCWZiN2E2NGQwNDkyMDdhYmEwN2MyNmJlNTYxYzlmOTQwYjgyYTBlNzQ4ZTQ2N2QwNTFkY2I3NmM3YTU5MzI0YWQKYm9keQl0ZXN0cy9iYXNlbGluZS50ZXN0Lm1qcwlhIGdyZWVuIGJhc2VsaW5lIGFuZCBhIHJlZCBjdXJyZW50IHJ1biBuYW1lIHRoZSByZWdyZXNzaW9uOyBhIHJlZCBiYXNlbGluZSBuYW1lcyB0aGUgaW5oZXJpdGVkIHJlZAkzMmJmMjBmMjEzZmEwZDUxZWY5ZDk5ZjRiN2MxZTIxNTJkZDI3MjdjNTcxMTI0MGM5NTkzNDhkZjZkYzEwOTNlCmJvZHkJdGVzdHMvYmFzZWxpbmUudGVzdC5tanMJb25seSBhIHN0YXJ0dXAgU2Vzc2lvblN0YXJ0IHN0YXJ0cyB0aGUgYmFzZWxpbmUsIGFuZCBpdCB3YWl0cyBmb3Igbm90aGluZwk2YWZiYjE3MDA4OTUxMWFiMTdhZTVjZDY0NzMwZmM1ODIxZTgyMWRhMWE1MTEyNGYwMjU2NzhkNGE2NWE4MGM2CmJvZHkJdGVzdHMvYmFzZWxpbmUudGVzdC5tanMJcWgtY2hlY2sgLS1iYXNlbGluZSByZWNvcmRzIGFnYWluc3QgdGhlIHN0YXJ0aW5nIHRyZWUgYW5kIGhvbGRzIG5vIGdpdCBsb2NrCTAxM2FkNzQ2MGU2NjcyNTBmYTNkYWJhMTczMWU5MDY3NGNlZDIyN2ZjMzA2OTdhN2I5YzJhNjhlMWVlYTM5NDY
  ```
  --- last 10 line(s) of stdout (of 82 after folding 82 raw)
  test at tests/baseline.test.mjs:82:1
  ✖ a baseline pass leaves the same-tree skip and the publish verdict as they were (378.47475ms)
    TypeError [Error]: Cannot read properties of undefined (reading 'verdict')
        at TestContext.<anonymous> (file://~/CursorProjects/quality-harness/tests/baseline.test.mjs:87:53)
        at Test.runInAsyncScope (node:async_hooks:226:14)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
  ```
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3464
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3457
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3600
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3436
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3470
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3528
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3433
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3492
- 2026-10-18 · 93978b02* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:0 · test-lock-sha256:faf17eab4836933c6f2c43b4f81ad25d95dad521830e34ab2da535d1ebc1ef8e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYmFzZWxpbmUudGVzdC5tanMJYSBiYXNlbGluZSBwYXNzIGxlYXZlcyB0aGUgc2FtZS10cmVlIHNraXAgYXMgaXQgd2FzCTllMjhmMmUxZWIzZmFmOGE5NTdiYjEzM2ViNDJiY2NjOWRkYjRkNzAxNDYwNzc0N2MxYTAzZTk4YTU2NGZlYWQKYm9keQl0ZXN0cy9iYXNlbGluZS50ZXN0Lm1qcwlhIGdyZWVuIGJhc2VsaW5lIGFuZCBhIHJlZCBjdXJyZW50IHJ1biBuYW1lIHRoZSByZWdyZXNzaW9uOyBhIHJlZCBiYXNlbGluZSBuYW1lcyB0aGUgaW5oZXJpdGVkIHJlZAkzMmJmMjBmMjEzZmEwZDUxZWY5ZDk5ZjRiN2MxZTIxNTJkZDI3MjdjNTcxMTI0MGM5NTkzNDhkZjZkYzEwOTNlCmJvZHkJdGVzdHMvYmFzZWxpbmUudGVzdC5tanMJYSBzZXNzaW9uIHdob3NlIGNoZWNrIHdhcyBncmVlbiBhdCBpdHMgc3RhcnQgYW5kIGlzIHJlZCBhZnRlciBhbiBlZGl0IGlzIHRvbGQgdGhlIGNoYW5nZSBicm9rZSBpdAlkZGQ5NjI0OTIyNjNkZjRlN2U1ZWZjODEyNmU5ZGM5MWZiNGM0NmQ2NWYyYzcxNTZkYWZhNTIzZDhhZDBkMjA0CmJvZHkJdGVzdHMvYmFzZWxpbmUudGVzdC5tanMJb25seSBhIHN0YXJ0dXAgU2Vzc2lvblN0YXJ0IHN0YXJ0cyB0aGUgYmFzZWxpbmUsIGFuZCBpdCB3YWl0cyBmb3Igbm90aGluZwk2YWZiYjE3MDA4OTUxMWFiMTdhZTVjZDY0NzMwZmM1ODIxZTgyMWRhMWE1MTEyNGYwMjU2NzhkNGE2NWE4MGM2CmJvZHkJdGVzdHMvYmFzZWxpbmUudGVzdC5tanMJcWgtY2hlY2sgLS1iYXNlbGluZSByZWNvcmRzIGFnYWluc3QgdGhlIHN0YXJ0aW5nIHRyZWUgYW5kIGhvbGRzIG5vIGdpdCBsb2NrCTRmOTExOTBkMjU5MDNhNTUxYTEzMDVmNjUxNzFmNGI3OGQwNzc0OGZiMzI2YjIxYTBjZmMwNzZhYThhMzUwYWI · test-lock-kind:replace
- 2026-10-18 · 93978b02* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3420
- 2026-10-18 · human-observed · observed and signed off by the Claude session mac-quality-harness-main-dev on 2026-10-18. S4: mrw read --grep 'checks\.jsonl|baseline\.jsonl' plugin/scripts/ core/ names baseline.jsonl in two places only, check-record.mjs recordBaseline (the writer) and check-ledger.mjs baselineFor (the reader), and baselineFor has two callers, completionFacts and qh-check's once-per-tree test; no reader of checks.jsonl in Node or the Go core reads it. S5, macOS at load 2.5 on 10 cores: SessionStart median over 7 runs 102 ms before T3, 101 ms with the baseline off, 104 ms with it on; the baseline run itself took 1057 ms for a one-second check, bound and passed. On a corpus the run costs what its check costs: in this repository the check is scripts/selftest.sh, measured today at about 210 s, so each startup session here runs it once, detached and under the machine lease. Every catalogue mutant on the five changed sources ran, 187 RED.
- 2026-10-18 · 3c42f633* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:0 · test-lock-sha256:c6ef7dae6eb94893b4bbbe0c6a37aa4e4d442b3f2e74b57029d3b35073434e24 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYmFzZWxpbmUudGVzdC5tanMJYSBiYXNlbGluZSBuZXZlciB3YWl0cyBmb3IgaXRzIHR1cm4sIHdoYXRldmVyIHRoZSBlbnZpcm9ubWVudCBhc2tzCTdiZTczOGU1NzIwMTM1MTdkNmQ0YzAwMjRjNWNhMmE5ODFlZmUxYjEyOGI5NTFlN2Q2N2ViYzIyNTlmY2U5OTAKYm9keQl0ZXN0cy9iYXNlbGluZS50ZXN0Lm1qcwlhIGJhc2VsaW5lIHBhc3MgbGVhdmVzIHRoZSBzYW1lLXRyZWUgc2tpcCBhcyBpdCB3YXMJOWUyOGYyZTFlYjNmYWY4YTk1N2JiMTMzZWI0MmJjY2M5ZGRiNGQ3MDE0NjA3NzQ3YzFhMDNlOThhNTY0ZmVhZApib2R5CXRlc3RzL2Jhc2VsaW5lLnRlc3QubWpzCWEgZ3JlZW4gYmFzZWxpbmUgYW5kIGEgcmVkIGN1cnJlbnQgcnVuIG5hbWUgdGhlIHJlZ3Jlc3Npb247IGEgcmVkIGJhc2VsaW5lIG5hbWVzIHRoZSBpbmhlcml0ZWQgcmVkCTMwOTNhMWM3Njg0NjM2NDk1YTRhMjViOGQ0ODI3OTM1NmUzOWEzZmQxNWQzZWRjZTQ2OGUxY2Q4Y2IxMzA4MTcKYm9keQl0ZXN0cy9iYXNlbGluZS50ZXN0Lm1qcwlhIHNlc3Npb24gd2hvc2UgY2hlY2sgd2FzIGdyZWVuIGF0IGl0cyBzdGFydCBhbmQgaXMgcmVkIGFmdGVyIGFuIGVkaXQgaXMgdG9sZCB0aGUgY2hhbmdlIGJyb2tlIGl0CWRkZDk2MjQ5MjI2M2RmNGU3ZTVlZmM4MTI2ZTlkYzkxZmI0YzQ2ZDY1ZjJjNzE1NmRhZmE1MjNkOGFkMGQyMDQKYm9keQl0ZXN0cy9iYXNlbGluZS50ZXN0Lm1qcwlvbmx5IGEgc3RhcnR1cCBTZXNzaW9uU3RhcnQgc3RhcnRzIHRoZSBiYXNlbGluZSwgYW5kIGl0IHdhaXRzIGZvciBub3RoaW5nCTZhZmJiMTcwMDg5NTExYWIxN2FlNWNkNjQ3MzBmYzU4MjFlODIxZGExYTUxMTI0ZjAyNTY3OGQ0YTY1YTgwYzYKYm9keQl0ZXN0cy9iYXNlbGluZS50ZXN0Lm1qcwlxaC1jaGVjayAtLWJhc2VsaW5lIHJlY29yZHMgYWdhaW5zdCB0aGUgc3RhcnRpbmcgdHJlZSBhbmQgaG9sZHMgbm8gZ2l0IGxvY2sJNGY5MTE5MGQyNTkwM2E1NTFhMTMwNWY2NTE3MWY0Yjc4ZDA3NzQ4ZmIzMjZiMjFhMGNmYzA3NmFhOGEzNTBhYg · test-lock-kind:replace
- 2026-10-18 · 3c42f633* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3656
- 2026-10-18 · 3c42f633* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3647
- 2026-10-18 · 3c42f633* · exit 0 · `node --test tests/baseline.test.mjs` · acceptance-sha256:69ab4ef07f342b7786d28e49fe97fafbbaec4a9b49ee63f3dc365a454a6bf5fe · ms:3617
