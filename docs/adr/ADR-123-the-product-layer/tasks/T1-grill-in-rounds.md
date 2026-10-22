# Task ADR-123-T1: spec-write grills in frontier rounds over the whole checklist

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the grill's round shape and checklist
**Consumes:** none
**Data dependency:** hermetic; the behaviour a model shows is observed in T8
**Proof map:** v1

## Goal

spec-write asks, in numbered rounds, every decision whose prerequisites are settled, each a proposed fact with a test sketch and a
recommended answer; it looks up what the repository can answer; and its coverage checklist includes the four risks and the
twelve product concerns.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/spec-write-rounds.test.mjs` | create | the skill's rules, read as rules (0 locks: new) |
| `plugin/skills/spec-write/SKILL.md` | edit | Stage 1 (:70-96): rounds of the frontier replace "one question per message" (:74); the dependency rule (:86) becomes the frontier rule; the checklist (:87-89) gains the four risks and twelve concerns |

## Ordered Steps

1. [S1] Write the failing test and record the red run: the skill names rounds of the frontier, a cap of seven, a dependent question
   waiting for a later round, a proposed fact with a test sketch and a recommendation per question, a repository fact looked up
   and shown for veto, the empty frontier as the stop, and the four risks and twelve concerns in the checklist; and it no longer
   says "one question per message".
2. [S2] Rewrite Stage 1, keeping every proposed-fact rule (`:75-85`).

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/spec-write-rounds.test.mjs 2>&1) \
  && for n in "the grill asks the frontier in numbered rounds, each a proposed fact with a recommendation" \
      "a fact the repository answers is looked up, never asked" \
      "the coverage checklist holds the four risks and the twelve concerns"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the grill asks the frontier in numbered rounds, each a proposed fact with a recommendation` | `tests/spec-write-rounds.test.mjs` | the round, the cap, a dependent question waiting, the stop | — | S1, S2 |
| `a fact the repository answers is looked up, never asked` | `tests/spec-write-rounds.test.mjs` | the scout rule | — | S1, S2 |
| `the coverage checklist holds the four risks and the twelve concerns` | `tests/spec-write-rounds.test.mjs` | the checklist | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `/quality-harness:spec-write` loads the skill |
| 3 — the caller can discover it | the skill's description |
| 4 — it is used | T8 observes it |

## Mutation Log

## Invariants

- Every question stays a proposed fact with a test sketch.
- Nothing discoverable is asked.

## Risks

- What the test doubles do not model: a test over skill text checks the rule is stated, not that a model follows it; T8 is that check, and T6 consumes it.

## Stop Condition

Stop if the skill cannot state the frontier rule without contradicting a proposed-fact rule it keeps (`:75-85`).

## Out of Scope

- The map mode (T6).

## Verification Log
