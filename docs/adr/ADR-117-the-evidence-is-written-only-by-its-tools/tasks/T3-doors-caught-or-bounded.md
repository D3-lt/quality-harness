# Task ADR-117-T3: The forge's protection of main is said, and every door is caught or named where it closes

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the forge read and the `boundary` state
**Consumes:** `receipts.jsonl` and the receipt rule (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

release-evidence says whether `main`'s rules require status checks, could-not-look where gh cannot answer; side-doors.json gains `boundary`, and the three open doors move (ADR-117, Decisions 3 and 4).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/door-states.test.mjs` | add | the task's test, with a planted twin that must fail |
| `scripts/release-evidence.mjs` | edit | the forge read |
| `scripts/side-doors.json`, `scripts/side-door-sweep.mjs` | edit | the boundary state and the doors moved |
| `docs/adr/ADR-113-the-go-core-takes-the-rules-and-side-doors-are-enumerated.md` | edit | its open doors named as moved |

## Ordered Steps

1. [S1] Write the failing test, with the twins that must pass. Record the red run.
2. [S2] Add the forge read with an injectable gh, the state, and move the doors.
3. [S3] Record a killed mutant per decision point, with catalogue entries for Node and Python sources; Go mutants through adr-verify with a fence that builds `qh`. [proof: mutation]

## Acceptance

```bash
node --test tests/door-states.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the forge protection of main is said, and no door is open` | `tests/door-states.test.mjs` | protected, unprotected and could-not-look from an injected gh; the sweep counting caught, boundary and open, and failing a door with no state | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the refusal's or the finding's text |
| 4 — it is used | every session and every gate run |

## Mutation Log

## Invariants

- Gates advise and the sanctioned refusals are the only refusals (CLAUDE.md §3); this task adds only what ADR-117 sanctions.
- Node and the Go core say the same thing at each commit.

## Risks

- The forge read is network; it is bounded and could-not-look is said.

## Stop Condition

Stop if gh cannot read a ruleset at all; the door then stays boundary, said as unobserved.

## Out of Scope

- A program that writes a ledger itself (permanent: boundary: a hook sees tool calls and command text, not what a program does)

## Verification Log
