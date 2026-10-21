# Task ADR-120-T6: A Stop continues a turn to run the check only when it is declared

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the check's origin carried into the turn-end rules; R1 and R2 on an inferred check as a user-only `systemMessage`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The two Stop rules that tell the agent to run the check (R1, an unchecked tree; R2, unchecked commits) continue the turn only
when the project declared its check. On a check the plugin inferred they are said to the user once, and the agent is not
charged a turn it may have no way to act on. Every other rule and origin keeps its delivery.

## Delivery, per origin and rule

| Origin | R1, R2 | R4, R5, A, W, N |
|--------|--------|-----------------|
| `declared` | agent (continues), as ADR-096 | unchanged |
| `inferred` | user only, once per key | unchanged |
| `none`, `refused`, `unreadable`, `unproven` | unchanged (R1 and R2 need a check; R5 speaks for `none`, ADR-111) | unchanged |

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/turn-end-declared.test.mjs` | create | the table above, row by row (0 locks: new) |
| `tests/turn-end-delivery.test.mjs` | read | 36 locks (ADR-096 T1–T3); S2 names every locked row that asserts R1 or R2 on an inferred check, and only those are relocked |
| `plugin/scripts/completion-rules.mjs` | edit | carry the origin (:663); R1 and R2 (:729-751) set their audience from it; the dedupe key keeps the audience actually delivered (:710) |
| `plugin/scripts/check-ledger.mjs` | edit | `emittedFor` (:537-555) records a user-only delivery as such, so a later Stop neither repeats it to the user nor hands it to the agent |
| `core/hooks/turnend.go` | edit | the same (:198-203, :472-509) |
| `plugin/scripts/lifecycle.mjs`, `core/hooks/lifecycle.go` | edit | route a user-audience finding to `systemMessage` (`lifecycle.mjs:115-132`, `lifecycle.go:127-129,278-280`) |
| `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run, one per table row: a declared check with unchecked work continues the turn; the same with only an inferred check (a `package.json` test script, no `.quality-harness.json`) gets a `systemMessage` and no `additionalContext`; a second Stop on the same tree says nothing to either; an artifact finding (A) and a no-check finding (R5) still reach the agent; `turnEnd: notify` keeps everything user-only, as today.
2. [S2] Run `python3 scripts/test-locks.py tests/turn-end-delivery.test.mjs` and read each locked fixture: name every row that asserts R1 or R2 on an inferred check. Rows on another rule or origin (`:123`'s artifact finding with an unreadable configuration among them) are not touched.
3. [S3] Carry the origin into R1 and R2 in Node and Go; set the audience; record the delivered audience in the dedupe.
4. [S4] Relock only the rows S2 named, with the reason "R1 and R2 continue the turn only on a declared check (ADR-120 T6)". [proof: acceptance]
5. [S5] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \
  && for n in "a declared check with unchecked work continues the turn" \
      "an inferred check with unchecked work is said to the user once and does not continue the turn" \
      "the artifact and no-check findings still reach the agent" \
      "a Stop with unchecked work gives the agent the finding and the user a headline"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a declared check with unchecked work continues the turn` | `tests/turn-end-declared.test.mjs` | ADR-096's act, kept | — | S1, S3 |
| `an inferred check with unchecked work is said to the user once and does not continue the turn` | `tests/turn-end-declared.test.mjs` | the change, and the dedupe across two Stops | — | S1, S3 |
| `the artifact and no-check findings still reach the agent` | `tests/turn-end-declared.test.mjs` | A and R5 unchanged | — | S1, S3 |
| `a Stop with unchecked work gives the agent the finding and the user a headline` | `tests/turn-end-delivery.test.mjs` | ADR-096's locked row still passes | — | S2, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `onTurnEnd` on every Stop |
| 3 — the caller can discover it | the Stop hook in `hooks.json` |
| 4 — it is used | every adopter session whose check is inferred |

## Mutation Log
- 2026-10-21 · 86282d97* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · the check's origin is not carried into the turn-end rules, so an inferred check continues the turn · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4
- 2026-10-21 · 86282d97* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · R1 and R2 on an inferred check are not marked user-only, so they continue the turn · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4
- 2026-10-21 · 86282d97* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · R1 on an inferred check is judged against the agent audience, so a user-only delivery is repeated to the user · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4
- 2026-10-21 · 86282d97* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · R2 on an inferred check is judged against the agent audience, so a user-only delivery is repeated to the user · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4
- 2026-10-21 · 86282d97* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a user-only finding is put into the agent's context at Stop, so it continues the turn · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4
- 2026-10-21 · 86282d97* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a user-only delivery is recorded as reaching the agent too, so a later ask of the agent is skipped · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4

## Invariants

- A declared check's continuation, `stop_hook_active`, and `turnEnd: notify` behave as ADR-096 defined.
- No finding is dropped: an inferred one still reaches the user, with how to declare the check.
- A, W, N, R4 and R5 deliver exactly as before, for every origin.

## Risks

- An adopter who relied on the nudge without declaring a check loses the continuation: the user-facing line says how to declare one.

## Stop Condition

Stop if a locked ADR-096 row must change its asserted output for a declared check, or for any rule other than R1 and R2: that
is a regression, not this task.

## Out of Scope

- The bench's figures (permanent: boundary: CLAUDE.md §6; cited by the peer repository's branch and path only)

## Verification Log
- 2026-10-21 · 86282d97* · exit 1 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4 · ms:69032 · test-lock-sha256:cc7def09f71091db2b8977b4054ff8eaed1907a9fa09adda9e2d7af17dab245c · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVjbGFyZWQudGVzdC5tanMJYSBkZWNsYXJlZCBjaGVjayB3aXRoIHVuY2hlY2tlZCB3b3JrIGNvbnRpbnVlcyB0aGUgdHVybgk5YzJlMWZlMGQwNzIxNDcyYTBmZTg5OTE0YTU4NGMzNzcyNjk1NjNhOTJkNzUyZTNmMmIxN2I0NDYyMzIzNzhkCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVjbGFyZWQudGVzdC5tanMJYW4gaW5mZXJyZWQgY2hlY2sga2VlcHMgdHVybkVuZCBub3RpZnkgdXNlci1vbmx5LCBhcyBiZWZvcmUJMDg1ZTA0ZmQ4MDkwM2NkOWUyMmIxMDY5N2ZmYzE4NmM1NDUzMjlkMjI4NjZhOGQ4MDFmN2YxNGM4NDQyYjQ1Mwpib2R5CXRlc3RzL3R1cm4tZW5kLWRlY2xhcmVkLnRlc3QubWpzCWFuIGluZmVycmVkIGNoZWNrIHdpdGggdW5jaGVja2VkIHdvcmsgaXMgc2FpZCB0byB0aGUgdXNlciBvbmNlIGFuZCBkb2VzIG5vdCBjb250aW51ZSB0aGUgdHVybgkxOGMyMTFiM2ZjNTM3MTU0ZWM5YjA3YTY2MWM3ZjQ3YzgwN2ZkYmJiMjViZjU3Yzc4MzAyZGMwMTkyNjQ0ZTBiCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVjbGFyZWQudGVzdC5tanMJdGhlIGFydGlmYWN0IGFuZCBuby1jaGVjayBmaW5kaW5ncyBzdGlsbCByZWFjaCB0aGUgYWdlbnQJNWQ4YzI0MjhiNTc2ZmNiZGQwOGM0MTBhYjI4ZDhhM2YzMzc2NzcxNDNkZjk4ZWQ2NjA1MzBiYTY5OTU3MzQyNApib2R5CXRlc3RzL3R1cm4tZW5kLWRlbGl2ZXJ5LnRlc3QubWpzCUNMQVVERS5tZCBzZWN0aW9uIDMgbmFtZXMgYSB0dXJuIHRoYXQgY29udGludWVzIGFzIGFuIGFjdCwgbm90IGEgcmVmdXNhbAkwOTZiZDA2NGYxMzcwOGU5OWM5NDY5ZTNjYzYxMDI0Mzg5MDk3OWM2Njc0NTk5ZGNjYjUxNjE0NjNmYmY3Y2ZmCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJU3ViYWdlbnRTdG9wIG91dHB1dCBpcyB1bmNoYW5nZWQJMDdmZjkzODRhM2ZhOWEyNDc2ZWYyZDE2MDJkZjFjMmRjY2FiNTVhNDcyYjAwYWUyYTJhZDlkMGUzZjc0YjZiNwpib2R5CXRlc3RzL3R1cm4tZW5kLWRlbGl2ZXJ5LnRlc3QubWpzCWEgU3RvcCB0aGF0IGhhcyBhbHJlYWR5IGNvbnRpbnVlZCBpdHMgdHVybiBhZGRzIG5vdGhpbmcsIGV2ZW4gZm9yIGEgZmluZGluZyB0aGF0IGFycml2ZWQgc2luY2UJMDgxOGM2Nzc3ODE5ODhiODg5NjRhMWJiZDFhNDE5OTE2NWJkOGJlNjllOThmOWQzMmFiZmQwNmU1OTFiZDhkNgpib2R5CXRlc3RzL3R1cm4tZW5kLWRlbGl2ZXJ5LnRlc3QubWpzCWEgU3RvcCB3aXRoIHVuY2hlY2tlZCB3b3JrIGdpdmVzIHRoZSBhZ2VudCB0aGUgZmluZGluZyBhbmQgdGhlIHVzZXIgYSBoZWFkbGluZQkyZDUyZTE3OTQ2Y2EyYzY3ODYzMmEyZDYzZGYwMzJlNzI0ZDFkMDM1N2ZjNjM5YjZlNmJjNTBiMWVhOTliODg2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBmaW5kaW5nIGRlbGl2ZXJlZCB0byB0aGUgYWdlbnQgZm9yIHRoaXMgdHJlZSBpcyBub3QgZGVsaXZlcmVkIGFnYWluLCBhbmQgYSBjaGFuZ2VkIHRyZWUgaXMgc2FpZCBhZ2Fpbgk5MDIwMGJkOGMwMGQwMDkyMDE3NDI0YjQyMGExY2E1NmQyNzE4MmZmNTVlYmEzNGViNDQ2ODEzZDFhNTNkMWVjCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBmaW5kaW5nIGhhbmRlZCB0byBhIHN1YmFnZW50IGlzIHN0aWxsIHRoZSBtYWluIGFnZW50J3MgdG8gaGVhcgk3MDUxYTA1OWE4NzFmYTU5YTdiN2Q4YjJiYWU1N2UxNjc1ZThmNzg0ZjFkZDk4ZTg0OTlhMmJjMmRlOWJiYTNkCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYSBzZWNvbmQgU3RvcCBpbiB0aGUgc2FtZSB0dXJuIGFkZHMgbm90aGluZwlkM2Y3OTJiMGIwZjFkOGM5NDY4YTNkNzAzNDE1OGU0OTNhZmFhOTIzM2NiOTVkNDkxZjE0YTg4MmE4MmZmYzMwCmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYW4gYXJ0aWZhY3QgZmluZGluZyBpbXBvcnRlZCBvbiBhbiBldmVudCB0aGF0IGNhbm5vdCByZWFjaCB0aGUgYWdlbnQgc3RheXMgcGVuZGluZyBmb3IgdGhlIG5leHQgU3RvcAk2MDYyOGJlMDM2MjQ2NDkxZDk3ZWUxOTgxM2EzYmM5YWNkNDgyNjIwMTI5MGQxMzE2MDBjNjc4NTI1ZjY5MGI2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJYW4gdW5yZWFkYWJsZSBwcm9qZWN0IGNvbmZpZ3VyYXRpb24gbWVhbnMgdGhlIGRlZmF1bHQsIHNhaWQgYXMgc3VjaAk2Yzc5OWFhMjkzYzM3YjBhNDhiZTNmODI2YjdjOGUwMzc1ZTNkMDU3NTFjNDI3MzA0YTA3MmMyNTVmYzI0ZjY4CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJdGhlIHRhc2stZXZpZGVuY2UgbnVkZ2UgaGFzIGFuIGlkZW50aXR5IGFuZCBpcyBzYWlkIG9uY2UgcGVyIHRyZWUJYzg5YTBiMjc2YWJlNmU2OTViYzE2MmY5MjliODZiYjQ4Yzc4Zjk5ODFhNWViY2JiMjRmYjMwMzFmMmU1N2ExYQpib2R5CXRlc3RzL3R1cm4tZW5kLWRlbGl2ZXJ5LnRlc3QubWpzCXR1cm5FbmQgbm90aWZ5IGhvbGRzIHdoZW4gdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGhhcyBiZWVuIGRlbGV0ZWQJZjE4NTc1NWZiNDAzZjAzZTU5M2ZjYzg4NGMzYzYzOGE1YzVhZTRkMWM2NjNjNTkzYzA4MzkxZmEwYWFjNWIxNQpib2R5CXRlc3RzL3R1cm4tZW5kLWRlbGl2ZXJ5LnRlc3QubWpzCXR1cm5FbmQgbm90aWZ5IGtlZXBzIGEgZmluZGluZyB1c2VyLW9ubHksIGFuZCBhbnkgb3RoZXIgdmFsdWUgbWVhbnMgYWdlbnQJZGNlMWM2MjJkNjU0ZGJlZjZiNDlhOWVhMjgyODg0YzhiNGQ5OTkzNTBiNzNiMjRlYzk1YmE3YjMwY2U1ZTVmNA
  ```
  ```
- 2026-10-21 · 86282d97* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4 · ms:17973
- 2026-10-21 · 86282d97* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4 · ms:38466
- 2026-10-21 · 86282d97* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4 · ms:17087
- 2026-10-21 · 86282d97* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4 · ms:13726
- 2026-10-21 · 86282d97* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4 · ms:26038
- 2026-10-21 · 86282d97* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4 · ms:18616
- 2026-10-21 · 86282d97* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:0575c27292533e54c77dda13081d710185374065e0bf9109add46c7ccc1818b4 · ms:28094
