# Task ADR-128-T2: A session's own commit does not re-send the branch-state line

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (branch-state and its Go twin)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

When the only change since the last delivered branch-state line is HEAD moving by a commit this session's log records it
making, the line is not re-sent; any other change re-sends it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/branch-state.mjs` | edit | the compared text leaves HEAD out on an own commit |
| `tests/branch-state-own-commit.test.mjs` | add | the invariant and its twins |

## Ordered Steps

1. [S1] Write the test: a session commits twice; the brief is said once; a CI change, a fetch, a branch switch and a commit
   no hook run records each re-send it (red today). A dirty count alone stays unsaid, as ADR-122 T3 already decides.
2. [S2] Measure before: `node scripts/hook-footprint.mjs <a session transcript>` (2026-10-23: 32 firings, 13,981 chars).
   [proof: human: the before and after counts are in the commit message]
3. [S3] Implement from the event log's own commit record; a log that cannot say re-sends the line (ADR-005).

## Acceptance

```bash
node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a session's own commit does not re-send the line` | `tests/branch-state-own-commit.test.mjs` | the suppression | — | S1, S3 |
| `CI, a fetch, a branch switch or an unrecorded commit re-sends it` | `tests/branch-state-own-commit.test.mjs` | nothing else is suppressed | — | S3 |

## Mutation Log
- 2026-10-27 · b846bd03* · mutant killed · exit 1 · `plugin/scripts/branch-state.mjs` · a commit no hook run records is taken as the session's own, so its HEAD move goes unsaid · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3

## Invariants

- A red or unknown CI is said as ADR-094 and ADR-122 decide.

## Risks

- Telling "this session's commit" from "a commit that arrived" needs the log's record, not a sha guess.

## Stop Condition

The event log cannot tell a session's commit from a fetched one: stop and ask.

## Out of Scope

- Other emitters' wording (deferred: ADR-122-T5's after-measurement names the next largest).

## Verification Log
- 2026-10-27 · b846bd03* · exit 0 · `node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:4291
- 2026-10-27 · b846bd03* · exit 0 · `node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:4438
- 2026-10-27 · b846bd03* · exit 1 · `node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:6931 · test-lock-sha256:c88d101480770b1534de360a8721c04459e19ee4506c3d6e0f56972ddb92c7dd · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLW93bi1jb21taXQudGVzdC5tanMJQ0ksIGEgZmV0Y2gsIGEgYnJhbmNoIHN3aXRjaCBvciBhbiB1bnJlY29yZGVkIGNvbW1pdCByZS1zZW5kcyBpdAlkZjAzYzE4ZWQ4Zjc5ODIxNzcyMWIxZTY3ZGNjMmE3ZjAzMDRiOTBhNjRjMDZmZjllN2I4ZmNhOGM2MDcxNDJhCmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLW93bi1jb21taXQudGVzdC5tanMJYSBzZXNzaW9uJ3Mgb3duIGNvbW1pdCBkb2VzIG5vdCByZS1zZW5kIHRoZSBsaW5lCTQ2MzE1NTljZjdiMzdkNzQxMzg4MTMxMTcyMjExMTVmZDgzNDY0M2YzYjRjYWYxNDJlNDhhN2M2NjRjNDlkNWU
  ```
  --- last 10 line(s) of stdout (of 44 after folding 44 raw)
    ...
  1..2
  # tests 2
  # suites 0
  # pass 1
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6770.295875
  ```
- 2026-10-27 · b846bd03* · exit 0 · `node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:5436
- 2026-10-27 · c0d3d412* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:0 · test-lock-sha256:82892973f29ceccde969aab33bb0b7f9d9c8bfff1fb2faaf89f29d1ec739ac95 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLW93bi1jb21taXQudGVzdC5tanMJQ0ksIGEgZmV0Y2gsIGEgYnJhbmNoIHN3aXRjaCBvciBhbiB1bnJlY29yZGVkIGNvbW1pdCByZS1zZW5kcyBpdAkzNDg3MjFjNmNhZDEyYzhjZDEzNzczMjFiNWM0NzJmYTU0ZDYzMDRlZDY0MDQzMTY2OWUwMTJhMzMwM2U3OTAyCmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLW93bi1jb21taXQudGVzdC5tanMJYSBzZXNzaW9uJ3Mgb3duIGNvbW1pdCBkb2VzIG5vdCByZS1zZW5kIHRoZSBsaW5lCTQ2MzE1NTljZjdiMzdkNzQxMzg4MTMxMTcyMjExMTVmZDgzNDY0M2YzYjRjYWYxNDJlNDhhN2M2NjRjNDlkNWU · test-lock-kind:replace
- 2026-10-27 · c0d3d412* · exit 0 · `node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:5434
- 2026-10-27 · e7475968* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:0 · test-lock-sha256:ef9c951b743e43e740cd73f9c272515ba5ef1475dd79ad6ca069c20872512297 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLW93bi1jb21taXQudGVzdC5tanMJQ0ksIGEgZmV0Y2gsIGEgYnJhbmNoIHN3aXRjaCBvciBhbiB1bnJlY29yZGVkIGNvbW1pdCByZS1zZW5kcyBpdAk2ZGM0YjI3MTc5ZjgwZWVjYmI0NzllNjRkN2NjZjBjZDU3MzFjMDYxODU2NTQ4MWY4MDFhOWFhZTBhNjg3M2JkCmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLW93bi1jb21taXQudGVzdC5tanMJYSBzZXNzaW9uJ3Mgb3duIGNvbW1pdCBkb2VzIG5vdCByZS1zZW5kIHRoZSBsaW5lCTQ2MzE1NTljZjdiMzdkNzQxMzg4MTMxMTcyMjExMTVmZDgzNDY0M2YzYjRjYWYxNDJlNDhhN2M2NjRjNDlkNWU · test-lock-kind:replace
- 2026-10-27 · e7475968* · exit 0 · `node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:5604
- 2026-10-27 · 6d83be93* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:0 · test-lock-sha256:be6554d0e0332e87531e06dbde870242736332dd0f820c9686eed20ce93746e7 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLW93bi1jb21taXQudGVzdC5tanMJQ0ksIGEgZmV0Y2gsIGEgYnJhbmNoIHN3aXRjaCBvciBhbiB1bnJlY29yZGVkIGNvbW1pdCByZS1zZW5kcyBpdAk5MjgxNWE5ZDVjMmM0OGRlNDJkNjAzNjIxNGM3ZDZlM2JiY2ZmYTU0NmI5MzQxNmIzZjUzMjJiYmI1MzViYzY4CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLW93bi1jb21taXQudGVzdC5tanMJYSBzZXNzaW9uJ3Mgb3duIGNvbW1pdCBkb2VzIG5vdCByZS1zZW5kIHRoZSBsaW5lCTQ2MzE1NTljZjdiMzdkNzQxMzg4MTMxMTcyMjExMTVmZDgzNDY0M2YzYjRjYWYxNDJlNDhhN2M2NjRjNDlkNWU · test-lock-kind:replace
- 2026-10-27 · 6d83be93* · exit 0 · `node --test --test-reporter=tap tests/branch-state-own-commit.test.mjs` · acceptance-sha256:a25128cbdc0f47d5e2701b8bd046e98a9754264f647b09f33271b591537d98e3 · ms:5433
