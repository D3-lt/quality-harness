# Task ADR-076-T3: unasserted.mjs runs in a worktree

**Depends-on:** T1
**Covers:** F-9, F-10, F-13, UC2-S1, UC2-S2
**Estimated scope:** M (one tool, its exits, five tests)
**Owner:** unassigned
**Produces:** `unasserted.mjs --in-place`
**Consumes:** `build`, `remove`, `sweep` in `plugin/scripts/worktree.mjs` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the gate is neutered in the worktree`, `could not isolate is exit 2`, `every exit removes the tree`, `suites do not inherit NODE_TEST_CONTEXT`

## Goal

`scripts/unasserted.mjs` neuters and runs its suites in one worktree by default, removes it on every exit, exits 2 naming `--in-place` when it cannot build one, and never hands its runner's `NODE_TEST_CONTEXT` to a suite (ADR-076 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/unasserted.mjs` | edit | build, run and remove through T1's module; one cleanup boundary that every exit returns through; `--in-place`; the suites' environment |
| `tests/unasserted-isolation.test.mjs` | edit | remove `todo`; the fixture copies `plugin/scripts/worktree.mjs` and what it imports; the early-exit cleanup cases |
| `tests/mutations.json` | edit | this task's entries |

## Ordered Steps

1. [S1] Remove `todo` from the three tests, provision the fixture with T1's module, and record the red run (TDD red). [proof: acceptance]
2. [S2] Build a worktree through T1's module, and point `root`, the gate file and the suites at it.
3. [S3] Put everything after the build in one cleanup boundary. The dirty target, the enumeration failure, the failing baseline and the unreachable suite return an exit code through it instead of calling `process.exit`, so the tree is removed on every path.
4. [S4] A build that fails is exit 2, "could not isolate", naming `--in-place`; `--in-place` is today's behaviour.
5. [S5] Drop `NODE_TEST_CONTEXT` from the suites' environment, on both the named-suites and the whole-selftest branch, as `childEnv` does.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/unasserted-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (an unasserted run leaves the checkout byte-identical|an unasserted run that cannot isolate neuters nothing and names --in-place|an unasserted run started inside a test runner still reads its suite.s failures|a failing baseline removes the worktree|an unreachable suite removes the worktree)' "$T")" -eq 5
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an unasserted run leaves the checkout byte-identical` | `tests/unasserted-isolation.test.mjs` | the suite never sees a neutered checkout; the survivors report; nothing changed | F-9, UC2-S1 | S2 |
| `an unasserted run that cannot isolate neuters nothing and names --in-place` | `tests/unasserted-isolation.test.mjs` | exit 2, `--in-place` named, gate unchanged | F-10, UC2-S2 | S4 |
| `an unasserted run started inside a test runner still reads its suite's failures` | `tests/unasserted-isolation.test.mjs` | the runner's own `NODE_TEST_CONTEXT` is inherited, and the site still reads killed | F-13 | S5 |
| `a failing baseline removes the worktree` | `tests/unasserted-isolation.test.mjs` | exit 2, and git lists no worktree afterwards | — | S3 |
| `an unreachable suite removes the worktree` | `tests/unasserted-isolation.test.mjs` | exit 2, and git lists no worktree afterwards | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the isolated run and its tests |
| 2 — something selects it | every run without `--in-place` |
| 3 — the caller can discover it | its stdout, and the exit 2 line |
| 4 — it is used | maintainers auditing a gate |

## Mutation Log
- 2026-09-30 · 26d099f* · mutant killed · exit 1 · `scripts/unasserted.mjs` · the gate is neutered in the checkout instead of the worktree · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · covers:the gate is neutered in the worktree
- 2026-09-30 · 26d099f* · mutant killed · exit 1 · `scripts/unasserted.mjs` · a run that could not isolate reports success · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · covers:could not isolate is exit 2
- 2026-09-30 · 26d099f* · mutant killed · exit 1 · `scripts/unasserted.mjs` · the worktree is never removed, on any exit · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · covers:every exit removes the tree
- 2026-09-30 · 26d099f* · mutant killed · exit 1 · `scripts/unasserted.mjs` · the suites inherit the runner's NODE_TEST_CONTEXT, so a failing suite reads as passing · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · covers:suites do not inherit NODE_TEST_CONTEXT

## Invariants

- The baseline and reachability controls run as today, in the worktree.

## Risks

- A suite that reads an ignored file fails its baseline in the worktree, and the tool says the suite already fails.

## Stop Condition

Stop and ask if a suite needs the checkout's path.

## Out of Scope

- None — the tool's other behaviour is unchanged

## Verification Log
- 2026-09-30 · 26d099f* · exit 1 · `set -o pipefail …` · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · ms:2491 · test-lock-sha256:26968efd25dfc2c12bdae99d2c008bd0e262b237bee80ef33c602e5df3f48443 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3VuYXNzZXJ0ZWQtaXNvbGF0aW9uLnRlc3QubWpzCWEgZmFpbGluZyBiYXNlbGluZSByZW1vdmVzIHRoZSB3b3JrdHJlZQkyN2E4ZGM0MDFlM2YwOGY0MDhkMDMzNjYxMDhhMWU3NzA2YWJmMjZhODY0NDg0NjdlODQ3OTM2MTM5NzI3ODQ4CmJvZHkJdGVzdHMvdW5hc3NlcnRlZC1pc29sYXRpb24udGVzdC5tanMJYSBuZWdhdGl2ZSB2YWx1ZSBpcyBhIGZpbmRpbmcJODc1NzA5ZDkzNmJmMjRiMTBmMTYwZGVmYTNjMTFiNzYzMmVhNzRlNGQ0ZTdkMmU1ZDk3ZGNmMGRlZWE2NDdlNgpib2R5CXRlc3RzL3VuYXNzZXJ0ZWQtaXNvbGF0aW9uLnRlc3QubWpzCWFuIHVuYXNzZXJ0ZWQgcnVuIGxlYXZlcyB0aGUgY2hlY2tvdXQgYnl0ZS1pZGVudGljYWwJOWRkYjJlZjM3NGU5MzcyZTVhOTNkOTVjZDdmZTQ1OTEzN2Q2ZmFlOTc1MzY0NDZmOTdlZjU5OTRjM2MwNTllZgpib2R5CXRlc3RzL3VuYXNzZXJ0ZWQtaXNvbGF0aW9uLnRlc3QubWpzCWFuIHVuYXNzZXJ0ZWQgcnVuIHN0YXJ0ZWQgaW5zaWRlIGEgdGVzdCBydW5uZXIgc3RpbGwgcmVhZHMgaXRzIHN1aXRlJ3MgZmFpbHVyZXMJMTI2Yzg2YjVjYjU1YzE5ZjllY2M0ZDYyNDAzM2ZlMmY2ZDRjYjEwN2ZiY2E2MmExMWQxNzgzOGIxZDNkZTQ5NApib2R5CXRlc3RzL3VuYXNzZXJ0ZWQtaXNvbGF0aW9uLnRlc3QubWpzCWFuIHVuYXNzZXJ0ZWQgcnVuIHRoYXQgY2Fubm90IGlzb2xhdGUgbmV1dGVycyBub3RoaW5nIGFuZCBuYW1lcyAtLWluLXBsYWNlCTNiNGViYWUwNDkyYTJkN2UxZGZiOWJkMDliMjJlMzZjNWNkZDU3ODNmZWIyMDhlNGNlMzAwODUzODIzNjYwMjQKYm9keQl0ZXN0cy91bmFzc2VydGVkLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiB1bnJlYWNoYWJsZSBzdWl0ZSByZW1vdmVzIHRoZSB3b3JrdHJlZQk2MmFkMTUzZmRiZjZmMjlmZGI0NzBiN2QwMGRlNGFjMjI1OGZlMjJhMzA0MDU1YWZlMjkyZjNkNDhkMGU3M2Nj
  ```
  --- last 10 line(s) of stdout (of 96 after folding 97 raw)
    ...
  1..5
  # tests 5
  # suites 0
  # pass 2
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 2382.139041
  ```
- 2026-09-30 · 26d099f* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · ms:3212
- 2026-09-30 · 26d099f* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · ms:3106
- 2026-09-30 · 26d099f* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · ms:3240
- 2026-09-30 · 26d099f* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · ms:3200
- 2026-09-30 · 4535501* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:6ffe5edb0073d39a67f1a70824af5cf75e2dfa0ba9a8d499078d5cbd0e6ad040 · ms:0 · test-lock-sha256:45464009dbfea1027596fed8996a8f220b33811e759308c6e4296725dc80357f · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3VuYXNzZXJ0ZWQtaXNvbGF0aW9uLnRlc3QubWpzCWEgZmFpbGluZyBiYXNlbGluZSByZW1vdmVzIHRoZSB3b3JrdHJlZQkyN2E4ZGM0MDFlM2YwOGY0MDhkMDMzNjYxMDhhMWU3NzA2YWJmMjZhODY0NDg0NjdlODQ3OTM2MTM5NzI3ODQ4CmJvZHkJdGVzdHMvdW5hc3NlcnRlZC1pc29sYXRpb24udGVzdC5tanMJYSBuZWdhdGl2ZSB2YWx1ZSBpcyBhIGZpbmRpbmcJNDgyOGEwZWEwY2NjYTA0MmNiNWNhNGExNDc1MTk4ZTlkYzEzOWMzYmM5NjBjZDdmN2Y1MzUxZTAwMWE3Mjk4MApib2R5CXRlc3RzL3VuYXNzZXJ0ZWQtaXNvbGF0aW9uLnRlc3QubWpzCWEgdGFyZ2V0IHRoYXQgcmVzb2x2ZXMgb3V0c2lkZSB0aGUgd29ya3RyZWUgaXMgbm90IG5ldXRlcmVkIHRoZXJlCTdkZjBiZTcyYzM1NDExZGM4YmRhYjJkMThhNjA5MDQ0ZGRjZjljODIwYjA5MWI3NjdhOGY4MTM2NmMwYjE2MjYKYm9keQl0ZXN0cy91bmFzc2VydGVkLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiB1bmFzc2VydGVkIHJ1biBsZWF2ZXMgdGhlIGNoZWNrb3V0IGJ5dGUtaWRlbnRpY2FsCTlkZGIyZWYzNzRlOTM3MmU1YTkzZDk1Y2Q3ZmU0NTkxMzdkNmZhZTk3NTM2NDQ2Zjk3ZWY1OTk0YzNjMDU5ZWYKYm9keQl0ZXN0cy91bmFzc2VydGVkLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiB1bmFzc2VydGVkIHJ1biByZWNvcmRzIGl0cyBwcm9jZXNzIGdyb3VwIGJlZm9yZSBpdHMgc3VpdGVzIHJ1bgkzNGI0ZWE3MjQwMWMwNGEzNmI3ZWE1ZTYzNGFmMDE3NjlhMGVlMjhiMzhmYTAyOGMwYzA5NzUwNzg0Nzk3MTg4CmJvZHkJdGVzdHMvdW5hc3NlcnRlZC1pc29sYXRpb24udGVzdC5tanMJYW4gdW5hc3NlcnRlZCBydW4gc3RhcnRlZCBpbnNpZGUgYSB0ZXN0IHJ1bm5lciBzdGlsbCByZWFkcyBpdHMgc3VpdGUncyBmYWlsdXJlcwkxMjZjODZiNWNiNTVjMTlmOWVjYzRkNjI0MDMzZmUyZjZkNGNiMTA3ZmJjYTYyYTExZDE3ODM4YjFkM2RlNDk0CmJvZHkJdGVzdHMvdW5hc3NlcnRlZC1pc29sYXRpb24udGVzdC5tanMJYW4gdW5hc3NlcnRlZCBydW4gdGhhdCBjYW5ub3QgaXNvbGF0ZSBuZXV0ZXJzIG5vdGhpbmcgYW5kIG5hbWVzIC0taW4tcGxhY2UJM2I0ZWJhZTA0OTJhMmQ3ZTFkZmI5YmQwOWIyMmUzNmM1Y2RkNTc4M2ZlYjIwOGU0Y2UzMDA4NTM4MjM2NjAyNApib2R5CXRlc3RzL3VuYXNzZXJ0ZWQtaXNvbGF0aW9uLnRlc3QubWpzCWFuIHVucmVhY2hhYmxlIHN1aXRlIHJlbW92ZXMgdGhlIHdvcmt0cmVlCTYyYWQxNTNmZGJmNmYyOWZkYjQ3MGI3ZDAwZGU0YWMyMjU4ZmUyMmEzMDQwNTVhZmUyOTJmM2Q0OGQwZTczY2M · test-lock-kind:replace
