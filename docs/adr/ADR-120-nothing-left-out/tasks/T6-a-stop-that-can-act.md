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
