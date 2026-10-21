# Task ADR-120-T10: adr-verify runs a long fence in the background and records it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `adr-verify --background`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A task whose Acceptance runs for an hour is run once, by the tool, in the background, bounded by `fenceTimeout`, and its Verification Log row is written when the run ends, so evidence that took an hour is never re-typed or re-run.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/adr-verify-background.test.mjs` | create | the rows below (0 locks: new) |
| `tests/adr-verify-background-unobserved.test.mjs` | create | the unobserved-tree and left-running rows, beside the locked file (0 locks: new) |
| `tests/adr-verify-leftover.test.mjs` | create | the owner's 2026-10-21 decision: the foreground fence and a mutant run's clean fence that leave work running record no pass (0 locks: new) |
| `plugin/bin/adr-verify` | edit | `--background`: start the fence detached with its tree observation and lease, return at once naming the run; the child writes the row and its receipt on exit, exactly as a foreground run would |
| `plugin/skills/adr-execute/SKILL.md` | edit | when to use it, and that the session is told when the row lands |
| `tests/mutations/plugin/bin/adr-verify.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: `--background` on a fence that sleeps then exits 0 returns before the fence ends, and the row appears with exit 0, the fence digest and a receipt; a fence that exits 1 writes exit 1; a tree that changed during the run writes the row as UNPROVEN, not passed; a fence past `fenceTimeout` is killed and written as such; a second `--background` on the same task while one runs is refused with the running id.
2. [S2] Implement the detached child through the existing fence runner (`plugin/lib/fence.py`), reusing the foreground row writer.
3. [S3] Document it in the adr-execute skill. [proof: human: the skill wording, read in the round's review]
4. [S4] Record a killed mutant per mechanism, with catalogue entries, and run `node scripts/mutate.mjs --case 'ADR-120 T10' --no-cache`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs tests/adr-verify-background-unobserved.test.mjs tests/adr-verify-leftover.test.mjs 2>&1) \
  && for n in "a background fence run writes the row a foreground run would" \
      "a background run whose tree moved, timed out or overlaps is never recorded as passed" \
      "a background run whose tree git could not read is never recorded as passed" \
      "a background fence that leaves work running is never recorded as passed" \
      "a foreground fence that leaves work running is never recorded as passed" \
      "a mutant run's clean fence that leaves work running records no pass and applies no mutant"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a background fence run writes the row a foreground run would` | `tests/adr-verify-background.test.mjs` | exit, digest, receipt | — | S1, S2 |
| `a background run whose tree moved, timed out or overlaps is never recorded as passed` | `tests/adr-verify-background.test.mjs` | the twins | — | S1, S2 |
| `a background run refuses the modes that write another log or run no fence` | `tests/adr-verify-background.test.mjs` | `--background` refuses `--mutant`, `--human` and the like | — | S1, S2 |
| `a background row does not write away an edit made to the task while the fence ran` | `tests/adr-verify-background.test.mjs` | the row is appended to the task as it is at the end, not as it was read | — | S2 |
| `a finished background run leaves no lease behind` | `tests/adr-verify-background.test.mjs` | the per-task lease is released | — | S2 |
| `several tasks cannot be combined with --background` | `tests/adr-verify-background.test.mjs` | the multi-task refusal | — | S2 |
| `a background run whose tree git could not read is never recorded as passed` | `tests/adr-verify-background-unobserved.test.mjs` | a failed `git diff` is an unobserved tree, not an empty one; the clean twin passes | — | S1, S2 |
| `a background fence that leaves work running is never recorded as passed` | `tests/adr-verify-background-unobserved.test.mjs` | a fence that backgrounds work and exits 0 is UNPROVEN and the descendant is ended; `true` passes | — | S1, S2 |
| `a foreground fence that leaves work running is never recorded as passed` | `tests/adr-verify-leftover.test.mjs` | the owner, 2026-10-21: the same rule in the foreground; the twin without the child passes | — | S1, S2 |
| `a mutant run's clean fence that leaves work running records no pass and applies no mutant` | `tests/adr-verify-leftover.test.mjs` | isolated and `--in-place`: no exit-0 row and no Mutation Log row; the twins kill their mutant | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the call waits for the child, so it returns after the fence ended · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the child never writes the row · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb258* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a tree that moved during the run is never noticed · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb258* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a moved tree keeps the fence exit 0, so the row reads passed · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · an untracked scratch file counts as a moved tree · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a fence past its timeout leaves no row · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a timed-out fence is given exit 0 · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a live background run is taken for a stale lease, so a second one starts · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the lease is not created exclusively, so an existing one is opened · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the refusal does not name the running id · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant survived · exit 0 · `plugin/bin/adr-verify` · the lease is never released, so the task can never be run in the background again · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the modes a background run cannot be combined with are not refused · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · several tasks are accepted with --background · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant survived · exit 0 · `plugin/bin/adr-verify` · the row is appended to the task text read at the start, writing away an edit made during the run · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a finished run leaves its lease behind · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the row is appended to the task text read at the start, writing away an edit made during the run · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · several tasks are accepted with --background · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the modes a background run cannot be combined with are not refused · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · a5ac6999* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a failed git read hashes an empty diff, so two failed reads compare equal and a pass is written (review of 7a9107e8..dcc4693a, finding 2) · acceptance-sha256:35168186602545e4543919359fac0b332d66873a4f814677aa040f717eb75d81
- 2026-10-21 · d4f51888* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a foreground fence that leaves work running is recorded as passed (the owner, 2026-10-21) · acceptance-sha256:c87d86ee76f4bb67f453c18cf7c0758ec5e6854d04192758a9f8fed57d953371

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A detached child outlives the session: it holds a lease, is bounded by `fenceTimeout`, and SessionEnd does not wait on it.

## Stop Condition

Stop if the receipt cannot be written from a detached child without weakening ADR-117's writer rule.

## Out of Scope

- Attaching a log produced outside the tool (permanent: boundary: CLAUDE.md §4: evidence is tool-written; a transcribed log is a claim the gate cannot tell from a typed one)

## Verification Log
- 2026-10-21 · 0a54cb25* · exit 1 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:9927 · steps:S1 · test-lock-sha256:cea23892425719b96de44baa73922ce3f1e3d7b302d131ffa859cc4bbb478da1 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1iYWNrZ3JvdW5kLnRlc3QubWpzCWEgYmFja2dyb3VuZCBmZW5jZSBydW4gd3JpdGVzIHRoZSByb3cgYSBmb3JlZ3JvdW5kIHJ1biB3b3VsZAlkYzcwYjQxZmQ0NmI5OTk1ZWRmNzdjNmM1NGRmMWFkY2E4ZjIzMDg2MmEwMDcwOWY5MzhlNDU3NDlhMzA2M2QyCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1iYWNrZ3JvdW5kLnRlc3QubWpzCWEgYmFja2dyb3VuZCBydW4gcmVmdXNlcyB0aGUgbW9kZXMgdGhhdCB3cml0ZSBhbm90aGVyIGxvZyBvciBydW4gbm8gZmVuY2UJMzE4YTFkZGE1YzVjYTc5NzdlZGUzYTFmNjA3NWVlZWQ2ZTU1YTI3OWMxOWI1YThlN2VkMWMyMTBmMTJmNGZmZQpib2R5CXRlc3RzL2Fkci12ZXJpZnktYmFja2dyb3VuZC50ZXN0Lm1qcwlhIGJhY2tncm91bmQgcnVuIHdob3NlIHRyZWUgbW92ZWQsIHRpbWVkIG91dCBvciBvdmVybGFwcyBpcyBuZXZlciByZWNvcmRlZCBhcyBwYXNzZWQJOTA5MGI4OGE3NDc0ZDM2ZDI1OGUzYTk3NGQyZThhNjk1YmUwOWQ2OTQ1YzZlZDRjNmQ2ZDMzN2Y1MWFmNGYwOQ
  ```
  ```
- 2026-10-21 · 0a54cb25* · exit 1 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:41213
  ```
  ```
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:56283 · steps:S1,S2
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:45004
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:52153
- 2026-10-21 · 0a54cb258* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:34046
- 2026-10-21 · 0a54cb258* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:39049
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:30897
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:41813
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:30387
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:30215
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:36225
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:37354
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:33312
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:32646
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:31117
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:36760
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:41511
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:32853
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:34413
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:33317
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs 2>&1) \ …` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:32716 · steps:S1,S2
- 2026-10-21 · e5d16161* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60 · ms:0 · test-lock-sha256:0f4a67b4fc80a07d010e887f6bbe5531f707860404f1897a28cce6d898a66687 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1iYWNrZ3JvdW5kLnRlc3QubWpzCWEgYmFja2dyb3VuZCBmZW5jZSBydW4gd3JpdGVzIHRoZSByb3cgYSBmb3JlZ3JvdW5kIHJ1biB3b3VsZAkyZDQ5OWIxNjdjMzVkOTdjZTUxZGQ0NjQ0OTdjMjU1OGU5MTZhMmYxMTEyOTNlMmY1YmU5MDk0NjY3YjY0N2MxCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1iYWNrZ3JvdW5kLnRlc3QubWpzCWEgYmFja2dyb3VuZCByb3cgZG9lcyBub3Qgd3JpdGUgYXdheSBhbiBlZGl0IG1hZGUgdG8gdGhlIHRhc2sgd2hpbGUgdGhlIGZlbmNlIHJhbgk3MTE3MDEyZGM3NGQ1ZjU2ZTkxYTgyOGQ0MWMwMzc5YThlZWFlMGQ4MWI3ODMxOWQzYzEwM2NmNzYxZDMxZmQwCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1iYWNrZ3JvdW5kLnRlc3QubWpzCWEgYmFja2dyb3VuZCBydW4gcmVmdXNlcyB0aGUgbW9kZXMgdGhhdCB3cml0ZSBhbm90aGVyIGxvZyBvciBydW4gbm8gZmVuY2UJMzE4YTFkZGE1YzVjYTc5NzdlZGUzYTFmNjA3NWVlZWQ2ZTU1YTI3OWMxOWI1YThlN2VkMWMyMTBmMTJmNGZmZQpib2R5CXRlc3RzL2Fkci12ZXJpZnktYmFja2dyb3VuZC50ZXN0Lm1qcwlhIGJhY2tncm91bmQgcnVuIHdob3NlIHRyZWUgbW92ZWQsIHRpbWVkIG91dCBvciBvdmVybGFwcyBpcyBuZXZlciByZWNvcmRlZCBhcyBwYXNzZWQJOTA5MGI4OGE3NDc0ZDM2ZDI1OGUzYTk3NGQyZThhNjk1YmUwOWQ2OTQ1YzZlZDRjNmQ2ZDMzN2Y1MWFmNGYwOQpib2R5CXRlc3RzL2Fkci12ZXJpZnktYmFja2dyb3VuZC50ZXN0Lm1qcwlhIGZpbmlzaGVkIGJhY2tncm91bmQgcnVuIGxlYXZlcyBubyBsZWFzZSBiZWhpbmQJZGIwODA0OTA4MzA2YzY0ODljNmNhNjgzYzM5NzgwNmJjNmFjYTdjODc4NTBiNTBkZDk4YmQ1M2E3Nzc4ZTUyNgpib2R5CXRlc3RzL2Fkci12ZXJpZnktYmFja2dyb3VuZC50ZXN0Lm1qcwlzZXZlcmFsIHRhc2tzIGNhbm5vdCBiZSBjb21iaW5lZCB3aXRoIC0tYmFja2dyb3VuZAkzYmVhZDU1YTY2MzRhOTU4ZjdkNmIwNThmZDdjOWE4MWJkNDliY2FhZTk2ZmJiNGNjOTFlNTgzZTExMWNmMmZm · test-lock-kind:replace
- 2026-10-21 · human-observed · observed by the coordinator: the adr-execute skill's paragraph on this task's behaviour matches adr-verify; approved · acceptance-sha256:f96e21ffe2fe0110b905374c5e0dd40a0e42922d7c9ca2ae4a802bd828c35f60
- 2026-10-21 · a5ac6999* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs tests/adr-verify-background-unobserved.test.mjs 2>&1) \ …` · acceptance-sha256:35168186602545e4543919359fac0b332d66873a4f814677aa040f717eb75d81 · ms:31922
- 2026-10-21 · d4f51888* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-verify-background.test.mjs tests/adr-verify-background-unobserved.test.mjs tests/adr-verify-leftover.test.mjs 2>&1) \ …` · acceptance-sha256:c87d86ee76f4bb67f453c18cf7c0758ec5e6854d04192758a9f8fed57d953371 · ms:30748
