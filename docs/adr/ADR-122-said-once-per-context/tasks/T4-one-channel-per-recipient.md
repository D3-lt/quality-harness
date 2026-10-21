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

No firing sends the same item to the model's context twice, and the user keeps the first headline of each item.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/hook-channel.test.mjs` | create | the channel rows (0 locks: new) |
| `plugin/scripts/lifecycle.mjs` | edit | the PreToolUse headline (:109-114) on an item's first saying only, if T1 measured that it reaches the context; Stop through `audience` (:115-125) only if T1 found a duplicate there |
| `core/hooks/lifecycle.go` | edit | the same (:276-283) |
| `plugin/scripts/check-ledger.mjs` | edit | `deliveredTo` (:587-589) names what T1 measured |
| `CLAUDE.md` | edit | §3's sentence on `systemMessage`, only if T1 contradicts it (the owner's amendment) |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: on T1's measured branch, a repeat or a skip sends no headline and a
   first saying sends one; a PreToolUse firing never carries the same item in both channels to a recipient that reads both;
   an ADR-096 Stop finding keeps its delivery unless T1 found it doubled.
2. [S2] Implement the branch T1 measured, Node and Go; record the measurement's sign-off in the code comment by date and host
   version.
3. [S3] If T1 contradicts CLAUDE.md §3's "a `systemMessage` reaches the user only", propose the amendment to the owner. [proof: human: the owner reads the T1 sign-off and accepts or declines the sentence]
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

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
