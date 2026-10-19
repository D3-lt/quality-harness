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
| `scripts/release-evidence.mjs` | edit | `mainProtection`, the forge read, said on every run whose run came from gh |
| `scripts/side-doors.json`, `scripts/side-door-sweep.mjs` | edit | `doorStates` and the `boundary` state; the doors moved; `receipts.jsonl` a ledger, and a Python `open()` with a call inside its arguments read as a write, so `plugin/lib/record.py` is a listed writer |
| `docs/adr/ADR-113-the-go-core-takes-the-rules-and-side-doors-are-enumerated.md` | edit | a Follow-up naming its open doors as moved; the record is not rewritten (CLAUDE.md §10) |
| `tests/evidence-chain.test.mjs` | edit | `markDone`, a helper the locked tests call, moves the receipt with the date it moves (T2) |
| `tests/mutations/scripts/*.json` | edit | catalogue entries, and ADR-113 T3's exit entry repointed at the new exit line |

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
- 2026-10-19 · b26c8c29* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · an open door fails the sweep · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1
- 2026-10-19 · b26c8c29* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · a boundary names where it closes · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1
- 2026-10-19 · b26c8c29* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · a door problem fails the exit · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1
- 2026-10-19 · b26c8c29* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · the receipts file is a ledger · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1
- 2026-10-19 · b26c8c29* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · a call inside open() is read through · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1
- 2026-10-19 · b26c8c29* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · required checks are protection · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1
- 2026-10-19 · b26c8c29* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · an answer that is not rules is could-not-look · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1
- 2026-10-19 · b26c8c29* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · release-evidence says the forge line · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1

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
- 2026-10-19 · b26c8c29* · exit 1 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:282 · test-lock-sha256:09e63b2e5a8e6819369af21377b61e6908455d067585b0814cee83a74a7c8b31 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZG9vci1zdGF0ZXMudGVzdC5tanMJdGhlIGZvcmdlIHByb3RlY3Rpb24gb2YgbWFpbiBpcyBzYWlkLCBhbmQgbm8gZG9vciBpcyBvcGVuCWFkMjUxMDY3ZjUzMmVkMTkzMjQ5ZmY2MzljYmI4MTIyNDk2ZjQxYzY5NzI0N2JkYjQyZTE5NDA1YjBlZjMyNzY
  ```
  --- last 10 line(s) of stdout (of 25 after folding 25 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 123.054208

  ✖ failing tests:

  test at tests/door-states.test.mjs:1:1
  ✖ tests/door-states.test.mjs (118.184ms)
    'test failed'
  ```
- 2026-10-19 · b26c8c29* · exit 0 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:627
- 2026-10-19 · b26c8c29* · exit 0 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:575
- 2026-10-19 · b26c8c29* · exit 0 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:540
- 2026-10-19 · b26c8c29* · exit 0 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:667
- 2026-10-19 · b26c8c29* · exit 0 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:605
- 2026-10-19 · b26c8c29* · exit 0 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:692
- 2026-10-19 · b26c8c29* · exit 0 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:343
- 2026-10-19 · b26c8c29* · exit 0 · `node --test tests/door-states.test.mjs` · acceptance-sha256:e16c036eae234a30ac377771752b9c695a471f3524bcc281e3edf8a3dc12e8f1 · ms:344
