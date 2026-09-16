# Task ADR-058-T2: mrw read is a read

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the mrw read recognition in classifyCommand`, `mrw write keeping its classification`, `each named test actually running`, `the regression suites that pin the classifier`

## Goal

`classifyCommand` returns `neither` for an `mrw read …` or `mrw --root DIR read …` invocation that is the whole segment, so a turn that only read with `mrw` leaves no pending UNPROVEN write, while `mrw write` is judged as before.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | recognise the `read` subcommand of an `mrw` invocation in `classifyCommand`, through `commandInvocation` (line 517), beside `isMrwWriteCheckCommand` |

## Ordered Steps

1. [S1] Add the two tests with real assertions and see each fail on an assertion (TDD red).
2. [S2] Recognise `mrw [--root DIR|-C DIR|--json] read <specs>` as a read when it is the whole segment and `UNSAFE_SEGMENT` does not match.
3. [S3] Run the fence green and record mutants: widen the recognition to any `mrw` subcommand; drop it. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(mrw read is a read, not an unproven write|mrw write is still judged as a write)$' tests/advice-accuracy.test.mjs 2>&1) \
  && for name in 'mrw read is a read, not an unproven write' 'mrw write is still judged as a write'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/classify.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `mrw read is a read, not an unproven write` | `tests/advice-accuracy.test.mjs` | `mrw read a.md:1-5`, `mrw --root /x read a.md` classify as `neither`; through `analyzeTranscript`, a passing check followed by an `mrw read` leaves `unprovenWritePending()` false | — | S1, S2 |
| `mrw write is still judged as a write` | `tests/advice-accuracy.test.mjs` | `mrw write - <<'PLAN' … PLAN` and `mrw read a.md; rm b.md` are not `neither` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `analyzeTranscript` reads `classifyCommand`; S3's mutants remove or widen the recognition |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-058's Follow-up replay |

## Mutation Log

## Invariants

- ADR-047 holds: an unrecognised command is still UNPROVEN; only the `read` subcommand becomes recognised.
- The reviewer guard, which also reads `classifyCommand`, may now allow `mrw read` — a read.

## Risks

- A future `mrw read` flag that writes; the recognition names the subcommand, and the widening mutant must stay killed.

## Stop Condition

Stop and ask if `tests/reviewer-guard.test.mjs` goes red.

## Out of Scope

- `mrw iter`, `mrw seen`, `mrw stats` (not observed in the measured session)

## Verification Log
