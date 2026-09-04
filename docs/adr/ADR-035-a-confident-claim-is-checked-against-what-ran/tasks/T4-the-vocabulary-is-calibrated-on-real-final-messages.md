# Task ADR-035-T4: The vocabulary is calibrated on this machine's real final messages

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** the labelled sample and its precision, recorded in this task's sign-off
**Consumes:** `completionClaim()` (T1)
**Data dependency:** needs real Claude Code transcripts on the machine that runs it (`~/.claude/projects/*/*.jsonl`)
**Proof map:** v1

## Goal

The ADR's pre-registered criterion is measured: over at least thirty real final messages, at most
three classified `asserted` carry no completion assertion a reader would recognise — or the
`asserted` arm is withdrawn in the same commit.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/claims-calibrate.mjs` | add | repository tooling, never ships: reads the newest N transcripts the way `scripts/session-profile.mjs` does, prints each final message with its classification, for a human to label |
| this task file | sign-off | the measurement lives here, dated, with the sample size |

## Ordered Steps

<`adr-lint` advises that step 1 must establish a failing test, and that advice stands unclosed here
on purpose: this task adds no behaviour, so there is nothing a test could be red about. Its output
is a MEASUREMENT taken by a human against real transcripts, and the thing that can fail is the
criterion — precision below 0.90 withdraws T1's `asserted` arm. Inventing a test to satisfy the
step would be the decoration this corpus refuses everywhere else.>

1. [S1] Write the reader: for the newest thirty sessions under the Claude projects directory, print
   the last assistant message's first two hundred characters and `completionClaim()`'s answer, one
   per line, numbered. `[proof: human: the operator runs it and reads every line]`
2. [S2] Label each `asserted` row by hand: does the message assert completion? Count the misses.
   `[proof: human: the operator's labels are the measurement]`
3. [S3] Record the sign-off with `adr-verify --human`: date, sample size, `asserted` count, false
   positives, precision, and — if precision < 0.90 — the commit that withdrew the arm.
   `[proof: human: the sign-off is the record]`

## Acceptance

Acceptance is human-observed: the operator runs `node scripts/claims-calibrate.mjs`, labels every
`asserted` row, and records `adr-verify <this-file> --human "<date> · n=<N> · asserted=<A> ·
false positives=<F> · precision=<P> · <kept|withdrawn in <sha>>"`.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no test: the measurement is a human labelling exercise, and the reader is repository tooling with no shipped consumer | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the sign-off names the sample |
| 2 — something selects it | the ADR's criterion; nothing mechanical |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | the criterion decides whether T1's arm survives |

## Mutation Log

## Invariants

- The sample is real final messages from this machine, never fixtures written to pass.
- The precision is computed from the labels, and the labels are the operator's, not the tool's.

## Risks

- Thirty messages from one machine over one week are one person's writing habits. The ADR says
  so and scopes the criterion accordingly.

## Stop Condition

If fewer than thirty sessions with a final message exist on the machine, stop and say how many
there were; do not pad the sample.

## Out of Scope

- Measuring recall as a gate — it is recorded as a number in the same sign-off, never a threshold.

## Verification Log
