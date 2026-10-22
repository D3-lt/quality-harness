# Task ADR-122-T4: One channel per recipient

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** one channel per recipient for PreToolUse and Stop output
**Consumes:** the hook-output record shapes and the channel measurement (T1); `saidInContext` and the marker (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A skipped item sends neither its text nor its headline, and an item said in full keeps its headline: on 2.1.307 the model
reads `additionalContext` and the user reads `systemMessage` (T1's measurement), so the user's noise falls with the model's.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/hook-channel.test.mjs` | create | the channel rows (0 locks: new) |
| `plugin/scripts/lifecycle.mjs` | edit | the PreToolUse and Stop headlines (:109-125) follow the item's verdict: no headline for a skipped item; Stop's `audience` unchanged. Landed with T3's `deliver` routing (f62fd960); this task proves it |
| `core/hooks/lifecycle.go` | edit | the same (:276-283), landed with T3 likewise |
| `plugin/scripts/check-ledger.mjs` | read | `deliveredTo` (:587-589) already records what 2.1.307 measures: `both` for PreToolUse and a Stop that reaches the agent, `user` for every other event; unchanged |
| `core/hooks/ledger.go` | read | the same, Go; unchanged |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a skipped item sends no headline and no `additionalContext`; an item
   said in full sends both, once; a pending item (said earlier in the same turn) sends neither; a Stop finding keeps ADR-096's
   delivery and its `audience`; a refusal sends both on every attempt.
2. [S2] Implement it, Node and Go; record T1's measurement in the code comment by date and host version (2026-10-22, Claude
   Code 2.1.307: `systemMessage` reaches the user only; CLAUDE.md §3 stands, so no amendment is proposed).
3. [S3] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/hook-channel.test.mjs 2>&1) \
  && for n in "an item reaches each recipient on one channel" \
      "the first saying keeps its headline and a repeat has none"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an item reaches each recipient on one channel` | `tests/hook-channel.test.mjs` | Decision 4 | — | S1, S2 |
| `the first saying keeps its headline and a repeat has none` | `tests/hook-channel.test.mjs` | the user's headline twin | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the lifecycle emit path; its mutant |
| 3 — the caller can discover it | the hook output |
| 4 — it is used | T5 counts characters per channel |

## Mutation Log
- 2026-10-22 · 755d260a* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the user's channel carries the model's text instead of its headline · acceptance-sha256:aa003c336fa466beb291ed202fada5cd6df243a8c3e7806dca6bce01b35d03fe

## Invariants

- ADR-096's Stop delivery is unchanged unless T1 measured a duplicate.
- A refusal's text reaches both the agent and the user, as today.

## Risks

- A host version changes which channel reaches the context: the comment names the version measured.
- What the test doubles do not model: the host's rendering of a `systemMessage`; T1's S4 met the real one.

## Stop Condition

Stop if T1 recorded the channel measurement as could-not-measure: Decision 4 then keeps today's channels and the owner decides.

## Out of Scope

- The said-once rule itself (T2, T3).

## Verification Log
- 2026-10-22 · 755d260a* · exit 1 · `out=$(node --test --test-reporter=tap tests/hook-channel.test.mjs 2>&1) \ …` · acceptance-sha256:aa003c336fa466beb291ed202fada5cd6df243a8c3e7806dca6bce01b35d03fe · ms:519 · test-lock-sha256:8f675dd99be19ad3a06825fee95c5687bb0e8ac63948a262ddcd3c3ec9ae414e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvaG9vay1jaGFubmVsLnRlc3QubWpzCWFuIGl0ZW0gcmVhY2hlcyBlYWNoIHJlY2lwaWVudCBvbiBvbmUgY2hhbm5lbAk5YWE0ZjAxN2M0MWE3ZDUwYmQ0MjUyNTAwYWVlNWU1YzJlOTg4YWM5NzY5NzQ2NmNlZTI0ZTJjYTY0MjFlOWJmCmJvZHkJdGVzdHMvaG9vay1jaGFubmVsLnRlc3QubWpzCXRoZSBmaXJzdCBzYXlpbmcga2VlcHMgaXRzIGhlYWRsaW5lIGFuZCBhIHJlcGVhdCBoYXMgbm9uZQkyNmY4MDFlOWY4YzE5NjQ3ZGVmMTNiOWRhNDg4MjUzZmIxNjBlYmJjZDc0NTdlNWFhZTE3MDFmY2YzODU3ZDk1
  ```
  ```
- 2026-10-22 · 755d260a* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-channel.test.mjs 2>&1) \ …` · acceptance-sha256:aa003c336fa466beb291ed202fada5cd6df243a8c3e7806dca6bce01b35d03fe · ms:1207
- 2026-10-22 · 755d260a* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-channel.test.mjs 2>&1) \ …` · acceptance-sha256:aa003c336fa466beb291ed202fada5cd6df243a8c3e7806dca6bce01b35d03fe · ms:2960
