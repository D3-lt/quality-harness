# Task ADR-081-T1: qh-check skips a tree whose latest check passed, and says how long a run took

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, F-5, F-6, F-7, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5, UC1-S6, UC1-S7
**Estimated scope:** M (qh-check's start and result line, seven tests)
**Owner:** unassigned
**Produces:** `qh-check`'s option parsing
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the latest record decides`, `--again runs it`, `an unseen write runs it`, `the skip precedes the lease`

## Goal

Before taking the lease, `qh-check` skips a tree whose latest same-command record passed, unless `--again`, a torn ledger, a failed observation or an unseen write says otherwise; every run says its duration (ADR-081 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-check.mjs` | edit | the pre-lease observation and ledger read; `--again`; the duration; the usage |
| `plugin/bin/qh-check` | edit | its usage names `--again` |
| `tests/qh-check-reads-the-ledger.test.mjs` | edit | remove `todo` from this task's seven tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the seven tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Before the lease, observe the tree and read `checks.jsonl` whole; take the latest record, by position, for the same command and that tree; skip only when it grades `check.passed`.
3. [S3] Parse `--again`, which skips step S2; a torn ledger, a failed observation and no git run the check.
4. [S4] When any session's log of this repository holds an unobservable write recorded after the pass started, run the check; `QUALITY_HARNESS_CHECK_AGAIN=1` runs every time, and the suites that vary the check's outcome without changing the tree select it in their helpers.
5. [S5] Name the duration in the result line and the pass's time and duration in the skip line; keep the post-wait observation for a run.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/qh-check-reads-the-ledger.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a tree whose latest check passed is not checked again, and says when and how long|--again runs a tree that already passed|a changed tree, a torn ledger or a failed run checks again|a pass followed by a failure on the same tree checks again|a write git cannot see, after the pass, checks again|a skip waits for no lease|every run says how long it took)' "$T")" -eq 7
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a tree whose latest check passed is not checked again, and says when and how long` | `tests/qh-check-reads-the-ledger.test.mjs` | one run; the skip line's time and duration; no second record | F-1, UC1-S1 | S2, S5 |
| `--again runs a tree that already passed` | `tests/qh-check-reads-the-ledger.test.mjs` | two runs | F-2, UC1-S2 | S3 |
| `a changed tree, a torn ledger or a failed run checks again` | `tests/qh-check-reads-the-ledger.test.mjs` | held: each case runs | F-3, UC1-S3 | S3 |
| `a pass followed by a failure on the same tree checks again` | `tests/qh-check-reads-the-ledger.test.mjs` | the latest record decides | F-4, UC1-S4 | S2 |
| `a write git cannot see, after the pass, checks again` | `tests/qh-check-reads-the-ledger.test.mjs` | held: the check runs | F-5, UC1-S5 | S4 |
| `a skip waits for no lease` | `tests/qh-check-reads-the-ledger.test.mjs` | a skip under a live lease returns at once | F-6, UC1-S6 | S2 |
| `every run says how long it took` | `tests/qh-check-reads-the-ledger.test.mjs` | `passed in <n>s` | F-7, UC1-S7 | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seven tests |
| 2 — something selects it | `runCheck`, before the lease is taken |
| 3 — the caller can discover it | the skip line and the usage text |
| 4 — it is used | every `qh-check` an adopter runs |

## Mutation Log
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · the latest record decides: the first record on the tree is taken instead · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · covers:the latest record decides
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · --again runs it: the flag is ignored · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · covers:--again runs it
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · an unseen write runs it: writes git cannot see are ignored · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · covers:an unseen write runs it
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · the skip precedes the lease: under --wait the skip falls through to the lease and its wait · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · covers:the skip precedes the lease

## Invariants

- No record is written for a run that did not happen.
- A torn ledger never skips (ADR-005).

## Risks

- Two observations per run that misses: the cost is one `observe()`, measured before shipping.

## Stop Condition

Stop and ask if skipping needs a change to the record format.

## Out of Scope

- `--fast` — T2.

## Verification Log
- 2026-10-01 · ab59864* · exit 1 · `set -o pipefail …` · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · ms:26450 · test-lock-sha256:ef2aa9d6fd7b2778e41ff171e83e2094650d44d550d71611ac74fccec3c9dff7 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwktLWFnYWluIHJ1bnMgYSB0cmVlIHRoYXQgYWxyZWFkeSBwYXNzZWQJOGI4ZWZlM2U2OTlhZTU3OGNhZWQ4ZmU5NWM3ZmI0NzcwMWM0NzEwNmRiYmU4NjMxNGMzMjhmNTFkZTAxZThiMQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJLS1mYXN0IHdpdGggbm8gZmFzdENoZWNrIGRlY2xhcmVkIGlzIHNhaWQsIGFuZCBydW5zIG5vdGhpbmcJZTVmNTg1OWQyYjM0YWRlMTM4NjM5NzY4OGI4MzA3NmIyNjhiNWE4OWJiNDAzNGFiYWI2MDc2ZDIwODJhNTY3Ngpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBjaGFuZ2VkIHRyZWUsIGEgdG9ybiBsZWRnZXIgb3IgYSBmYWlsZWQgcnVuIGNoZWNrcyBhZ2FpbgljOTEyMWU2MDdlMTc1MjRjOWUyMDk0NjcwNDhkZGViZmFmNjEwZjg0ZDQyNjA4ZWYwMGM5ZGI3ODk3MTQ2MGJiCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIGNvbW1pdCByZWZ1c2VkIGJlZm9yZSBhIGZhc3QgcGFzcyBpcyB0b2xkIGFmdGVyIGl0CTZhZGM1MjYwNjU4ZTk2ZDE0NTEwNzAyYjllNzM1OTE5OTBmYzY1MzE4OGUyMTNlYjUxZDBjZjZhZjg2MjI3ZDgKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgY29tbWl0IHdpdGggbm8gZmFzdCBwYXNzLCBvciBhIGZhaWxlZCBvbmUsIGlzIHN0aWxsIHJlZnVzZWQJNjYxMzZiODZkYTIwYjNlMWY1MDc5YjAxZDNhYTA1MjI0NDExMmMyY2RmNzg1MzlkOTUyMGY1Zjc4NThhNTY0OQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBjb21taXQtb25seSBjb21tYW5kIG9uIGEgZmFzdC1wYXNzZWQgdHJlZSBpcyB0b2xkLCBub3QgcmVmdXNlZAlmY2UyYjEyMTUzOTQyMGYzNTU5NjBiMTNjYTRmYjdkMzVmMTAyMzE5Nzc5ZTY1MTcxZTM2OGZkZWFjYTYwYWM3CmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIGZhc3QgY2hlY2sgaXMgcmVjb3JkZWQgYXBhcnQsIHdoZXJlIG5vIGZ1bGwtY2hlY2sgcmVhZGVyIGxvb2tzCTViNDdkYzI3ZDhmM2IzNTA1ZWI1YTViOTY2MWM0Y2IxMTI0ZDE2MTc0YmI5ZjgzYTM4NWZmOWYxMzcyNDU0MTYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgcGFzcyBmb2xsb3dlZCBieSBhIGZhaWx1cmUgb24gdGhlIHNhbWUgdHJlZSBjaGVja3MgYWdhaW4JMzYxMjkyOTAxZTI1MjBiZWVjNWI0NzQ2NDNhNDkyOWE5NjI5ZjY1YTE2ZTg1Mjk1NDY2MDVjNjdkOTVhNzNkNQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBwdXNoLCBvciBhIGNvbW1pdCB0aGF0IGFsc28gcHVzaGVzLCBpcyByZWZ1c2VkIG9uIGEgZmFzdC1wYXNzZWQgdHJlZQliZWRjZGExNTJkNTI1ZGI3ODY2ZDk0YmFjZTlkYjhlYWRjZDYyN2RkMjhlMGUxMDVhYWJmMGQ5Mjc5ZTJjNWIwCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIHNraXAgd2FpdHMgZm9yIG5vIGxlYXNlCTEyNTUzZTRjZjViYjMxNzEzYmVjMDVjODE4Nzk5YjZhMGI5NzJmYjAxNTU1OWMxMDVjM2VkNjc0YjAxZTRlZmYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgdHJlZSB3aG9zZSBsYXRlc3QgY2hlY2sgcGFzc2VkIGlzIG5vdCBjaGVja2VkIGFnYWluLCBhbmQgc2F5cyB3aGVuIGFuZCBob3cgbG9uZwk4YzlkZGIxMDI4MzhiNmI0ZWZiYWU1ZGQ1YTg0YTIxMTI1ZTZiYTRjYjRhMDAzOTMxNDAxNDYwODc4ZmQ2YTAzCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIHdyaXRlIGdpdCBjYW5ub3Qgc2VlLCBhZnRlciB0aGUgcGFzcywgY2hlY2tzIGFnYWluCTEyODM0Mzk4OWU5Mjc5ZjA0ZTY4ZGEyNjdkYTkxN2VkYmY0NDZmOWFkZjY4NGFlOTQwZjVkYjVlOThkYzE0ZDYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWV2ZXJ5IHJ1biBzYXlzIGhvdyBsb25nIGl0IHRvb2sJYjA3NGQ3YjJiMjYzYTJlZjRmNTNmMzFmNDQ4ZTkyNDJmOTQ4YzE2OGQ4MDdiZDkxNzllNjA5ZmI2MDc1ZjA0MApib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJZ2l0J3Mgb3duIGhvb2tzIGxldCBhIGNvbW1pdCB0aHJvdWdoIHdpdGggdGhlIHdhcm5pbmcgYW5kIHJlZnVzZSBhIHB1c2gJZDVjMWQxNmIyODgxZTYwYjZlNzczZTY1ZDc1YWRmNzYyYTY5NTEyNzU2YzI2MGM4MmI1NzU2MmYzOWU5ZGJmZA
  ```
  --- last 10 line(s) of stdout (of 359 after folding 364 raw)
    ...
  1..14
  # tests 14
  # suites 0
  # pass 2
  # fail 5
  # cancelled 0
  # skipped 0
  # todo 7
  # duration_ms 26283.013
  ```
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · ms:5199
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · ms:5846
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · ms:5561
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · ms:5803
- 2026-10-01 · ab59864* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:98fddffc8b5453fee4ed516ee5a57ac851ab671877e30df9383a5691bb38af8a · ms:0 · test-lock-sha256:9250cfc9a3aa63a6e5b416c47ab14998a8f27ae7f4778d5e380eb45aca7f16ba · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwktLWFnYWluIHJ1bnMgYSB0cmVlIHRoYXQgYWxyZWFkeSBwYXNzZWQJOGI4ZWZlM2U2OTlhZTU3OGNhZWQ4ZmU5NWM3ZmI0NzcwMWM0NzEwNmRiYmU4NjMxNGMzMjhmNTFkZTAxZThiMQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJLS1mYXN0IHdpdGggbm8gZmFzdENoZWNrIGRlY2xhcmVkIGlzIHNhaWQsIGFuZCBydW5zIG5vdGhpbmcJZTVmNTg1OWQyYjM0YWRlMTM4NjM5NzY4OGI4MzA3NmIyNjhiNWE4OWJiNDAzNGFiYWI2MDc2ZDIwODJhNTY3Ngpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBjaGFuZ2VkIHRyZWUsIGEgdG9ybiBsZWRnZXIgb3IgYSBmYWlsZWQgcnVuIGNoZWNrcyBhZ2FpbgljOTEyMWU2MDdlMTc1MjRjOWUyMDk0NjcwNDhkZGViZmFmNjEwZjg0ZDQyNjA4ZWYwMGM5ZGI3ODk3MTQ2MGJiCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIGNvbW1pdCByZWZ1c2VkIGJlZm9yZSBhIGZhc3QgcGFzcyBpcyB0b2xkIGFmdGVyIGl0CTZhZGM1MjYwNjU4ZTk2ZDE0NTEwNzAyYjllNzM1OTE5OTBmYzY1MzE4OGUyMTNlYjUxZDBjZjZhZjg2MjI3ZDgKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgY29tbWl0IHdpdGggbm8gZmFzdCBwYXNzLCBvciBhIGZhaWxlZCBvbmUsIGlzIHN0aWxsIHJlZnVzZWQJNjYxMzZiODZkYTIwYjNlMWY1MDc5YjAxZDNhYTA1MjI0NDExMmMyY2RmNzg1MzlkOTUyMGY1Zjc4NThhNTY0OQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBjb21taXQtb25seSBjb21tYW5kIG9uIGEgZmFzdC1wYXNzZWQgdHJlZSBpcyB0b2xkLCBub3QgcmVmdXNlZAlmY2UyYjEyMTUzOTQyMGYzNTU5NjBiMTNjYTRmYjdkMzVmMTAyMzE5Nzc5ZTY1MTcxZTM2OGZkZWFjYTYwYWM3CmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIGZhc3QgY2hlY2sgaXMgcmVjb3JkZWQgYXBhcnQsIHdoZXJlIG5vIGZ1bGwtY2hlY2sgcmVhZGVyIGxvb2tzCTViNDdkYzI3ZDhmM2IzNTA1ZWI1YTViOTY2MWM0Y2IxMTI0ZDE2MTc0YmI5ZjgzYTM4NWZmOWYxMzcyNDU0MTYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgcGFzcyBmb2xsb3dlZCBieSBhIGZhaWx1cmUgb24gdGhlIHNhbWUgdHJlZSBjaGVja3MgYWdhaW4JMzYxMjkyOTAxZTI1MjBiZWVjNWI0NzQ2NDNhNDkyOWE5NjI5ZjY1YTE2ZTg1Mjk1NDY2MDVjNjdkOTVhNzNkNQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBwdXNoLCBvciBhIGNvbW1pdCB0aGF0IGFsc28gcHVzaGVzLCBpcyByZWZ1c2VkIG9uIGEgZmFzdC1wYXNzZWQgdHJlZQliZWRjZGExNTJkNTI1ZGI3ODY2ZDk0YmFjZTlkYjhlYWRjZDYyN2RkMjhlMGUxMDVhYWJmMGQ5Mjc5ZTJjNWIwCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIHNraXAgd2FpdHMgZm9yIG5vIGxlYXNlCTEyNTUzZTRjZjViYjMxNzEzYmVjMDVjODE4Nzk5YjZhMGI5NzJmYjAxNTU1OWMxMDVjM2VkNjc0YjAxZTRlZmYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgdHJlZSB3aG9zZSBsYXRlc3QgY2hlY2sgcGFzc2VkIGlzIG5vdCBjaGVja2VkIGFnYWluLCBhbmQgc2F5cyB3aGVuIGFuZCBob3cgbG9uZwk4YzlkZGIxMDI4MzhiNmI0ZWZiYWU1ZGQ1YTg0YTIxMTI1ZTZiYTRjYjRhMDAzOTMxNDAxNDYwODc4ZmQ2YTAzCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIHdyaXRlIGdpdCBjYW5ub3Qgc2VlLCBhZnRlciB0aGUgcGFzcywgY2hlY2tzIGFnYWluCTEyODM0Mzk4OWU5Mjc5ZjA0ZTY4ZGEyNjdkYTkxN2VkYmY0NDZmOWFkZjY4NGFlOTQwZjVkYjVlOThkYzE0ZDYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWV2ZXJ5IHJ1biBzYXlzIGhvdyBsb25nIGl0IHRvb2sJYjA3NGQ3YjJiMjYzYTJlZjRmNTNmMzFmNDQ4ZTkyNDJmOTQ4YzE2OGQ4MDdiZDkxNzllNjA5ZmI2MDc1ZjA0MApib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJZ2l0J3Mgb3duIGhvb2tzIGxldCBhIGNvbW1pdCB0aHJvdWdoIHdpdGggdGhlIHdhcm5pbmcgYW5kIHJlZnVzZSBhIHB1c2gJMzkyMjc5MTQzMWU3YWZkODE4Yzc5ZjQ1ZjAzZjM4MzJkOWZiNzEyYjNlZWFkZDMyMjViZTUwYTY1ZGFjM2Y0Mw · test-lock-kind:replace
