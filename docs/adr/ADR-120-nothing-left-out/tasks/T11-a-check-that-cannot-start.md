# Task ADR-120-T11: A check that cannot start here continues no turn

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** a startability probe in the turn end
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A declared check whose program cannot be found on this machine's PATH (or whose script file is absent) continues no turn; its finding reaches the user once, naming the program. `"turnEnd": "continue"` in `.quality-harness.json` restores the pre-3.8.51 behaviour, a continuation on an inferred or unstartable check (T6 and this task), so a benchmark can run the old and the new behaviour at one tag with the setting as the only difference (the bench peer's ADR-163 Q arm, 2026-10-21).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/turn-end-declared.test.mjs` | edit | new tests beside T6's (0 locks on the new ones; T6's are locked by its own task and stay byte-identical) |
| `tests/carry-and-probe-fixes.test.mjs` | create | the review's P2 here and P1 of T9, Node and Go (0 locks: new); `core/hooks/carry_review_test.go` is its Go half |
| `plugin/scripts/completion-rules.mjs` | edit | R1 and R2 read whether the declared check's first program resolves (`command -v`-equivalent over PATH, or the named script file exists); one that does not routes to the user, as T6 does for an inferred check. The class, from `mrw read --grep 'unstarted|could not start|validationVerdict|checkEventName' plugin/scripts/ core/hooks/`: `check-record.mjs:18-25` and `check-ledger.mjs:165-183` classify a run's outcome after it ran and are retained; `completion-rules.mjs:208-243` and `:544-546` say a run that did not start and are retained; only the turn end's decision to continue changes |
| `core/hooks/turnend.go` | edit | the same |
| `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a declared `bash scripts/missing.sh` (file absent) and a declared `nosuchtool test` do not continue the turn and tell the user once; a declared `node --test` continues as today; a declared `npm test` with `npm` on PATH continues; with `"turnEnd": "continue"`, the unstartable check and an inferred check (T6) continue the turn as before 3.8.51, and `"turnEnd": "notify"` keeps everything user-only as today.
2. [S2] Probe once per session and tree, without running the check; reuse T6's user routing.
3. [S3] Port to Go.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \
  && for n in "a declared check that cannot start continues no turn and is said to the user once" \
      "a declared check that can start continues as before"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && out=$(node --test --test-reporter=tap tests/carry-and-probe-fixes.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "a declared check with a command-local assignment can start, and a plain missing program cannot")" = 1 \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a declared check that cannot start continues no turn and is said to the user once` | `tests/turn-end-declared.test.mjs` | the probe | — | S1, S2, S3 |
| `a declared check that can start continues as before` | `tests/turn-end-declared.test.mjs` | the twin | — | S1, S2 |
| `a declared check with a command-local assignment can start, and a plain missing program cannot` | `tests/carry-and-probe-fixes.test.mjs` | the probe reads `PATH=/bin sh -c ...` as startable and `nosuchprogram-xyz` as not (review of 7a9107e8..dcc4693a, P2); its Go twin is `TestCheckCanStartReadsAssignments` | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log
- 2026-10-21 · 543e0bc9* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · the probe is never asked · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce
- 2026-10-21 · 543e0bc9* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · an unstartable check is not marked user-only · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce
- 2026-10-21 · 543e0bc9* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · a program on no PATH directory can start · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce
- 2026-10-21 · 543e0bc9* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · an absent script can start · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce
- 2026-10-21 · 543e0bc9* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · no program on PATH can start · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce
- 2026-10-21 · 543e0bc9* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · turnEnd continue is ignored by the rules · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce
- 2026-10-21 · 543e0bc9* · mutant killed · exit 1 · `plugin/scripts/project-config.mjs` · turnEnd continue is not read · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce
- 2026-10-21 · a5ac6999* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · a command-local assignment read as no PATH change makes a runnable check unstartable (review of 7a9107e8..dcc4693a, finding 5) · acceptance-sha256:ee247173c6880060a80c2503acbad4befee3fded422a432ab61a1ee9b683d077

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A program present but broken still continues once: the probe proves only that it can start.

## Stop Condition

Stop if resolving the program needs to run the project's shell setup (an `nvm`-style PATH): the probe would then be a guess.

## Out of Scope

- Probing whether the tests' own dependencies are installed (permanent: boundary: that is the check's run, not its start; only running it can say)

## Verification Log
- 2026-10-21 · 543e0bc9* · exit 1 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce · ms:22127 · test-lock-sha256:8a4f38eb435e9137c6078f83a53cf97fb3bf83b36529c9d0647434bcb3f5262f · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVjbGFyZWQudGVzdC5tanMJYSBkZWNsYXJlZCBjaGVjayB0aGF0IGNhbiBzdGFydCBjb250aW51ZXMgYXMgYmVmb3JlCTNlMGEzNGI1MWY2MGNmNTMyN2ZjOWY1ZDk1ZWU4NzVjMmQyZTg5OGZiZmM2NmQyMWUwM2E3OTg2NmMxNzc0MmQKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWNsYXJlZC50ZXN0Lm1qcwlhIGRlY2xhcmVkIGNoZWNrIHRoYXQgY2Fubm90IHN0YXJ0IGNvbnRpbnVlcyBubyB0dXJuIGFuZCBpcyBzYWlkIHRvIHRoZSB1c2VyIG9uY2UJMjk3Yzc1ZDYwYmYyYjEzOWE3NDU1MzY3ZDc3MTJkNTA1NzNmOGQwY2MzNThhNDQ0ZTQxYWY3YTk1NWFiZGFkMgpib2R5CXRlc3RzL3R1cm4tZW5kLWRlY2xhcmVkLnRlc3QubWpzCWEgZGVjbGFyZWQgY2hlY2sgd2l0aCB1bmNoZWNrZWQgd29yayBjb250aW51ZXMgdGhlIHR1cm4JOWMyZTFmZTBkMDcyMTQ3MmEwZmU4OTkxNGE1ODRjMzc3MjY5NTYzYTkyZDc1MmUzZjJiMTdiNDQ2MjMyMzc4ZApib2R5CXRlc3RzL3R1cm4tZW5kLWRlY2xhcmVkLnRlc3QubWpzCWFuIGluZmVycmVkIGNoZWNrIGtlZXBzIHR1cm5FbmQgbm90aWZ5IHVzZXItb25seSwgYXMgYmVmb3JlCTA4NWUwNGZkODA5MDNjZDllMjJiMTA2OTdmZmMxODZjNTQ1MzI5ZDIyODY2YThkODAxZjdmMTRjODQ0MmI0NTMKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWNsYXJlZC50ZXN0Lm1qcwlhbiBpbmZlcnJlZCBjaGVjayB3aXRoIHVuY2hlY2tlZCB3b3JrIGlzIHNhaWQgdG8gdGhlIHVzZXIgb25jZSBhbmQgZG9lcyBub3QgY29udGludWUgdGhlIHR1cm4JMThjMjExYjNmYzUzNzE1NGVjOWIwN2E2NjFjN2Y0N2M4MDdmZGJiYjI1YmY1N2M3ODMwMmRjMDE5MjY0NGUwYgpib2R5CXRlc3RzL3R1cm4tZW5kLWRlY2xhcmVkLnRlc3QubWpzCWFuIGluZmVycmVkIGZpbmRpbmcgaXMgcmVjb3JkZWQgYXMgZGVsaXZlcmVkIHRvIHRoZSB1c2VyIGFsb25lLCBhIGRlY2xhcmVkIG9uZSB0byBib3RoCTQ5ZmQ5N2FiYjkyZDNhMTU5NTVjM2RiNTQyOGQzMGFjZTFkNTY4NmRjODFmNGZkOThjNDI5MGNhYWFiOGUyYjUKYm9keQl0ZXN0cy90dXJuLWVuZC1kZWNsYXJlZC50ZXN0Lm1qcwl0aGUgYXJ0aWZhY3QgYW5kIG5vLWNoZWNrIGZpbmRpbmdzIHN0aWxsIHJlYWNoIHRoZSBhZ2VudAk1ZDhjMjQyOGI1NzZmY2JkZDA4YzQxMGFiMjhkOGEzZjMzNzY3NzE0M2RmOThlZDY2MDUzMGJhNjk5NTczNDI0CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVjbGFyZWQudGVzdC5tanMJdHVybkVuZCBjb250aW51ZSByZXN0b3JlcyB0aGUgY29udGludWF0aW9uIG9uIGFuIGluZmVycmVkIGFuZCBvbiBhbiB1bnN0YXJ0YWJsZSBjaGVjawk2MWEzNDg4NDg1YTFjNmM0MTkzNTljZWIxNmNkMWM3NGJkNzc0YTk5YjFlMWVjNDZhOTFkNjliZjU4MDFhODlkCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVjbGFyZWQudGVzdC5tanMJdHVybkVuZCBub3RpZnkga2VlcHMgYW4gdW5zdGFydGFibGUgY2hlY2sgdXNlci1vbmx5LCBhbmQgY29udGludWUgY2hhbmdlcyBub3RoaW5nIGZvciBhIGRlY2xhcmVkIG9uZSB0aGF0IHN0YXJ0cwljYWY1ZTE4ZTVjMGM5OGUzNDFiNWUyNmZiYmE4YThmNmUzNDNjMmRlYjEzZTZjMGQ3OGVlYWY2M2NlZmEzZjY5
  ```
  ```
- 2026-10-21 · 543e0bc9* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce · ms:28190
- 2026-10-21 · 543e0bc9* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce · ms:24253
- 2026-10-21 · 543e0bc9* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce · ms:26652
- 2026-10-21 · 543e0bc9* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce · ms:19568
- 2026-10-21 · 543e0bc9* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce · ms:29202
- 2026-10-21 · 543e0bc9* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce · ms:35457
- 2026-10-21 · 543e0bc9* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:50c87d6950ad4db9df6ed2cbe3e1e019015696ba15544dfaa4857136e7c96fce · ms:88709
- 2026-10-21 · a5ac6999* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \ …` · acceptance-sha256:ee247173c6880060a80c2503acbad4befee3fded422a432ab61a1ee9b683d077 · ms:20538
