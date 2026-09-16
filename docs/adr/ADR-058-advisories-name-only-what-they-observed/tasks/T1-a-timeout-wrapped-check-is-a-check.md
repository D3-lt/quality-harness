# Task ADR-058-T1: A timeout-wrapped check is a check

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `tests/advice-accuracy.test.mjs` (file exists)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the timeout-wrapper strip before validation patterns`, `UNSAFE_SEGMENT still seeing the whole segment`, `each named test actually running`, `the regression suites that pin the classifier`

## Goal

`isValidationCommand` recognises a check run under one leading `timeout` or `gtimeout` invocation, and the commit advisory stays silent after such a check passes, while a timeout-wrapped mutation stays a mutation.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | add | the three tests below; new file, harness shaped like `tests/unread-advice.test.mjs` |
| `plugin/scripts/lifecycle.mjs` | edit | a `TIMEOUT_PREFIX` strip beside `ASSIGNMENT_PREFIX` in `isValidationCommand` (the segment test at line 1100) |

`isValidationCommand` is the selecting line: `classifyCommand` and `analyzeTranscript` read it.

## Ordered Steps

1. [S1] Write the three tests with real assertions and see each fail on an assertion (TDD red); confirm with `record.extract_test_body` that every body hashes before the first `adr-verify`.
2. [S2] Add the strip: one leading `timeout|gtimeout`, options `-k N|--kill-after=N|-s SIG|--signal=SIG|--preserve-status|--foreground|-v`, and one duration (`\d+(?:\.\d+)?[smhd]?`), applied to the segment only after `UNSAFE_SEGMENT` has been tested on the whole segment.
3. [S3] Run the fence green and record mutants: drop the strip; let it strip a second wrapper; test the stripped text against `UNSAFE_SEGMENT` instead of the whole segment. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a timeout-wrapped check is a check|a timeout wrapper does not launder a mutation|the commit gate is silent after a passing timeout-wrapped check)$' tests/advice-accuracy.test.mjs 2>&1) \
  && for name in 'a timeout-wrapped check is a check' 'a timeout wrapper does not launder a mutation' 'the commit gate is silent after a passing timeout-wrapped check'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/classify.test.mjs tests/unread-advice.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a timeout-wrapped check is a check` | `tests/advice-accuracy.test.mjs` | `gtimeout 590 bash scripts/selftest.sh`, `timeout --kill-after=30 1800 npm test`, `gtimeout -k 2 5 pytest -q` are validation; the bare forms still are | — | S1, S2 |
| `a timeout wrapper does not launder a mutation` | `tests/advice-accuracy.test.mjs` | `gtimeout 5 rm -rf build`, `timeout 60 npm test > out.txt`, `gtimeout 5 gtimeout 5 npm test` are not validation | — | S1, S2 |
| `the commit gate is silent after a passing timeout-wrapped check` | `tests/advice-accuracy.test.mjs` | through `handleHook`: an Edit, then a passing `gtimeout 590 bash scripts/selftest.sh`, then PreToolUse `git commit` emits no "Nothing has verified" advisory; the same transcript with a failing check still advises | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `analyzeTranscript` reads `classifyCommand`; the handleHook test drives it; S3's mutants delete the strip |
| 3 — the caller can discover it | n/a: no declared interface; the advisory text is what a session reads |
| 4 — it is used | ADR-058's Follow-up replays the measured session's hook points before and after |

## Mutation Log

## Invariants

- `UNSAFE_SEGMENT` is tested on the whole segment before anything is stripped.
- A timeout wrapper around anything that is not a check changes nothing.

## Risks

- A duration pattern too loose could take a command word as a duration; the test with a nested wrapper and the mutation case guard it.

## Stop Condition

Stop and ask if a locked test in `tests/classify.test.mjs` or `tests/unread-advice.test.mjs` goes red.

## Out of Scope

- `PUBLISH_WRAPPER` (ADR-054's list for publishes)
- Compound or redirected checks (ADR-058 Out of Scope)

## Verification Log
