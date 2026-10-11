# Task ADR-095-T5: a hook event reads the working tree status once

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** M (one memo, its switch in the entry point, tests)
**Owner:** unassigned
**Produces:** `rememberStatus(lifetimeMs, now)` — a switch that makes `statusPaths` reuse one answer per repository for a bounded time within one process
**Consumes:** `scripts/hook-cost.mjs --json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a status answer is reused for its lifetime`, `an older answer or a failed one is asked again`, `the memo is off unless the entry point switches it on`

## Goal

Within one hook process, `git status --porcelain -z -uall` is asked once per repository and reused for at most two seconds, so a turn-end event pays for one status and not three; nothing outside a hook process, and nothing past two seconds, is remembered.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/tree-facts.mjs` | edit | `rememberStatus(lifetimeMs, now)` and the lookup in `statusPaths`; an answer is kept only when git answered, per repository, with the time it was obtained |
| `plugin/scripts/lifecycle.mjs` | edit | `main` switches the memo on for the life of the hook process (what selects it: a test run without the switch asks every time) |
| `tests/status-memo.test.mjs` | add | four tests |
| `tests/mutations/plugin/scripts/tree-facts.mjs.json` | edit | one entry per `Rests-on` name |
| `tests/mutations/plugin/scripts/lifecycle.mjs.json` | edit | one entry: the switch in `main` |

## Ordered Steps

1. [S1] Write the four tests of the Tests table and record the red run (TDD red).
2. [S2] Measure the turn-end event with T1 first and put the three `status -uall` calls and their milliseconds in the sign-off as the baseline (three outside runs: 125 to 400 ms on their repositories). [proof: human: the baseline is in the sign-off]
3. [S3] Add the memo to `statusPaths`, off by default; `main` in `lifecycle.mjs` switches it on with a two-second lifetime. Enumerate the callers of `statusPaths` with a command and put the command and the count in the sign-off [proof: acceptance]: `mrw read --grep statusPaths plugin/scripts`.
4. [S4] Measure again with T1: one `status` in the turn-end event; put the after figures in the sign-off. [proof: human: the turn-end event's `status --porcelain` count is 1]
5. [S5] Record one killed mutant per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/status-memo.test.mjs 2>&1) \
  && for t in 'a turn-end event asks git for the working tree status once' 'a status answer older than its lifetime is asked again, and one git could not give is never kept' 'the memo is off unless the entry point switches it on, and it is per repository'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a turn-end event asks git for the working tree status once` | `tests/status-memo.test.mjs` | the real hook program against a fixture repository: exactly one `status --porcelain` child | none | S1, S3 |
| `a status answer older than its lifetime is asked again, and one git could not give is never kept` | `tests/status-memo.test.mjs` | with an injected clock: a write made inside the lifetime is not seen until the lifetime has passed, then it is (the dirty twin); a status that failed is asked again | none | S1, S3 |
| `the memo is off unless the entry point switches it on, and it is per repository` | `tests/status-memo.test.mjs` | a fixture program that does not switch it on asks twice; one that does asks once per repository, for two repositories asks twice | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `main` in `lifecycle.mjs` switches the memo on; removing the call turns the first test red |
| 3 — the caller can discover it | n/a: internal |
| 4 — it is used | the turn-end measurement of S4, and the outside run |

## Mutation Log
- 2026-10-11 · 5caa68dc* · mutant killed · exit 1 · `plugin/scripts/tree-facts.mjs` · never reuses a status answer, so the tree is read three times again · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · covers:a status answer is reused for its lifetime
- 2026-10-11 · 5caa68dc* · mutant killed · exit 1 · `plugin/scripts/tree-facts.mjs` · serves an answer however old it is, so a write after the lifetime is never seen · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · covers:an older answer or a failed one is asked again
- 2026-10-11 · 5caa68dc* · mutant killed · exit 1 · `plugin/scripts/tree-facts.mjs` · switches the memo on in every process, so a caller that never asked for it is served an old answer · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · covers:the memo is off unless the entry point switches it on
- 2026-10-11 · 5caa68dc* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the entry point never switches the memo on, so the turn-end event asks three times · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · covers:a status answer is reused for its lifetime

## Invariants

- An answer older than the lifetime is never served (the clock is read at the lookup).
- Only an answer git gave is kept; a failure is asked again (CLAUDE.md §16).
- The memo is per process and per repository: a second process, and a test that does not switch it on, ask every time.

## Risks

- The tree changing inside the lifetime (a background process writing): the answer is at most two seconds old and the event it serves has already ended its turn; the advice it feeds is advisory (CLAUDE.md §3).

## Stop Condition

Stop and ask if any caller of `statusPaths` is a refusal (the publish verdict reads the observation, not this): a refusal on a two-second-old answer is not accepted.

## Out of Scope

- The two `write-tree` calls around `add -A` (permanent: boundary: they are the observation, not a repeat; the second follows a write to the temporary index)

## Verification Log
- 2026-10-11 · 5caa68dc* · exit 1 · `out=$(node --test --test-reporter=tap tests/status-memo.test.mjs 2>&1) \ …` · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · ms:1883 · test-lock-sha256:3db1abd035d9224c3a26eca3d85f4445688a364396b51ae2fef94084e063e1ca · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc3RhdHVzLW1lbW8udGVzdC5tanMJYSBzdGF0dXMgYW5zd2VyIG9sZGVyIHRoYW4gaXRzIGxpZmV0aW1lIGlzIGFza2VkIGFnYWluLCBhbmQgb25lIGdpdCBjb3VsZCBub3QgZ2l2ZSBpcyBuZXZlciBrZXB0CWQ5Mzk2N2ExYjQwN2EyMWQwYTQxNmQxMWRiOGFlMDlkNTY1NTg3MGRjNzBmZmQ5NjY4MGFhNzU2OGJjYzE1OWMKYm9keQl0ZXN0cy9zdGF0dXMtbWVtby50ZXN0Lm1qcwlhIHR1cm4tZW5kIGV2ZW50IGFza3MgZ2l0IGZvciB0aGUgd29ya2luZyB0cmVlIHN0YXR1cyBvbmNlCWNmM2I1ZDI0ZjljYWFjNWNiYzFhYTk3YTU5NDFjOTEyN2MzZTkxNGU5MDU0Njc4YjA5ZjAwMjU5MDAwN2E3NDgKYm9keQl0ZXN0cy9zdGF0dXMtbWVtby50ZXN0Lm1qcwl0aGUgbWVtbyBpcyBvZmYgdW5sZXNzIHRoZSBlbnRyeSBwb2ludCBzd2l0Y2hlcyBpdCBvbiwgYW5kIGl0IGlzIHBlciByZXBvc2l0b3J5CTRhM2QxMTU2MGM3NWRmYzQxNjA3ZWRjZTYyOGYxZGY3ZTEwMmMwZTUxNDkzY2YxOWMwNzdiZjI2MGE5N2NiOGQ
  ```
  ```
- 2026-10-11 · 5caa68dc* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-memo.test.mjs 2>&1) \ …` · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · ms:2336
- 2026-10-11 · 5caa68dc* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-memo.test.mjs 2>&1) \ …` · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · ms:2341
- 2026-10-11 · 5caa68dc* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-memo.test.mjs 2>&1) \ …` · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · ms:2270
- 2026-10-11 · 5caa68dc* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-memo.test.mjs 2>&1) \ …` · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · ms:2315
- 2026-10-11 · human-observed · observed by the executing session on macOS, 2026-10-11: S2 baseline from three outside runs (two macOS corpora and one Windows corpus) and this session, the turn-end event asks git status -uall 3 times (125 to 400 ms on those repositories, one call 248 ms and the others 36 ms on Windows); S3 callers of statusPaths enumerated with mrw read --grep statusPaths plugin/scripts: 3 call sites in 3 files (the late-baseline check in tree-facts via observedClean, the completion facts, the artifact rule), all advisory readers, none a refusal (the publish verdict reads its own observation); S4 scripts/hook-cost.mjs after the change on a clone of this repository: the turn-end event asks status once, 9 children against 16 at the start of ADR-095 (11 after T3), with the answer reused for at most two seconds, per repository, only where lifecycle.mjs main switched it on; a fixture that does not switch it on asks every time; approved
- 2026-10-11 · 5caa68dc* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:eccf98bcc9925b770d88fee8d1b664e67d412b8a3b4624f1b6a527cd43ffcb6d · ms:0 · test-lock-sha256:6c0eaec9ee1f14cb88b21093a5117b94f5d699f4751d6d2401d5608f2b0159dc · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc3RhdHVzLW1lbW8udGVzdC5tanMJYSBzdGF0dXMgYW5zd2VyIG9sZGVyIHRoYW4gaXRzIGxpZmV0aW1lIGlzIGFza2VkIGFnYWluLCBhbmQgb25lIGdpdCBjb3VsZCBub3QgZ2l2ZSBpcyBuZXZlciBrZXB0CWYxZDNlNWFhOTdlYjFmYzk1NzcxNGQxMTJhMmVlZjM5NmQ1YTgzZjY3YjIzM2JiMDJhMzI2OWE3MTNkNjNmOGEKYm9keQl0ZXN0cy9zdGF0dXMtbWVtby50ZXN0Lm1qcwlhIHR1cm4tZW5kIGV2ZW50IGFza3MgZ2l0IGZvciB0aGUgd29ya2luZyB0cmVlIHN0YXR1cyBvbmNlCWNmM2I1ZDI0ZjljYWFjNWNiYzFhYTk3YTU5NDFjOTEyN2MzZTkxNGU5MDU0Njc4YjA5ZjAwMjU5MDAwN2E3NDgKYm9keQl0ZXN0cy9zdGF0dXMtbWVtby50ZXN0Lm1qcwl0aGUgbWVtbyBpcyBvZmYgdW5sZXNzIHRoZSBlbnRyeSBwb2ludCBzd2l0Y2hlcyBpdCBvbiwgYW5kIGl0IGlzIHBlciByZXBvc2l0b3J5CTRhM2QxMTU2MGM3NWRmYzQxNjA3ZWRjZTYyOGYxZGY3ZTEwMmMwZTUxNDkzY2YxOWMwNzdiZjI2MGE5N2NiOGQ · test-lock-kind:replace
