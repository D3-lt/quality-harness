# Task ADR-074-T4: A step's human proof with no sign-off is advised on

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (adr-lint, adr-next, the test file)
**Owner:** unassigned
**Produces:** the unsigned-human-proof advice and note
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a human-proof step with no sign-off is advised on, and done is unchanged`

## Goal

When a task's Ordered Steps name `[proof: human: …]` and its Verification Log holds no `· human-observed ·` row, adr-lint advises and adr-next's note says so, naming the step. `done` keeps its rule: an exit-0 entry and a killed mutant still make a task done.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | the advice, beside the proof-map checks |
| `plugin/bin/adr-next` | edit | the note on a done task |
| `tests/human-proof-advice.test.mjs` | new | the human-proof cases |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the test: a done task with a human-proof step and no sign-off, the same task with a sign-off, and a task with no human-proof step. See it fail on the first (TDD red).
2. [S2] Add the advice to adr-lint and the note to adr-next; leave `done` as it is.
3. [S3] Record a mutant per reader with `adr-verify --mutant`: the advice silent, the note silent. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/human-proof-advice.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - a human-proof step with no sign-off is advised on, and done is unchanged'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a human-proof step with no sign-off is advised on, and done is unchanged` | `tests/human-proof-advice.test.mjs` | the advice and the note appear only without a sign-off; done is the same in all three | none | S1, S2 |

## Invariants

- No new refusal: every verdict and exit code is the same as before for the three cases.

## Risks

- A sign-off whose note is read as a stop (adr-next `human_outcome`) is still a sign-off for this advice; the advice asks only whether one exists.

## Stop Condition

Stop and ask if saying this needs anything adr-next's done rule does not already read.

## Out of Scope

- Blocking `done` (permanent: boundary: ADR-074 Out of Scope)

## Verification Log
- 2026-09-29 · f2f941d* · exit 1 · `set -o pipefail …` · acceptance-sha256:df414037dcb5e4e0778e3387e8c4bec52c26c0e261625ff2c3e5315be45ba8dd · ms:880 · test-lock-sha256:f1f7629f46b8d7143cb794ccb61203f57d0e4f2eae99e6c802b4bb250786a6c0 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2h1bWFuLXByb29mLWFkdmljZS50ZXN0Lm1qcwlhIGh1bWFuLXByb29mIHN0ZXAgd2l0aCBubyBzaWduLW9mZiBpcyBhZHZpc2VkIG9uLCBhbmQgZG9uZSBpcyB1bmNoYW5nZWQJYTIxZjk2MWUwZmIwNWZjNGM5MmM4NTZiOTY3OTI0ZGZkMzU5OGM1YWZmMDM5NDUwZWIwNzc1MjNhZTY4ZmI2MQ
  ```
  --- last 1 line(s) of stdout
  0
  --- last 10 line(s) of stderr (of 71 after folding 72 raw)
    ...
  1..1
  # tests 1
  # suites 0
  # pass 0
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 775.087792
  ```

## Mutation Log
