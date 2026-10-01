# Task ADR-081-T2: A declared fast check lets a commit through and never a push

**Depends-on:** T1
**Covers:** F-8, F-9, F-10, F-11, F-12, F-13, F-14, UC2-S1, UC2-S2, UC2-S3, UC2-S4, UC2-S5, UC2-S6, UC2-S7
**Estimated scope:** M (qh-check, the publish verdict, git's hook, seven tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** `qh-check`'s option parsing (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a fast record is kept apart`, `only a proven commit is exempt`, `the latest fast record decides`, `git's hook says the advisory`, `the key carries the fast state`

## Goal

`qh-check --fast` records a declared `fastCheck` in `fast-checks.jsonl`; `publishVerdict` advises rather than refuses a command proven to be one commit on a tree whose latest fast record passed, git's commit hook says so, and everything else is refused as before (ADR-081 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-check.mjs` | edit | `--fast`; the fast record's file; exit 2 when none is declared |
| `plugin/scripts/lifecycle.mjs` | edit | `fastCheck` resolution; the fast-pass reading; the commit-only proof; the exemption and its key in `publishVerdict` |
| `plugin/scripts/publish-hook.mjs` | edit | return the advisory's text with code 0 |
| `plugin/bin/qh-check` | edit | its usage names `--fast` |
| `CLAUDE.md` | edit | §3's description of ADR-061's refusal gains the commit exemption |
| `tests/qh-check-reads-the-ledger.test.mjs` | edit | remove `todo` from this task's seven tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the seven tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Resolve `fastCheck` as `check` is resolved; `--fast` with none says so and exits 2; a fast run appends to `fast-checks.jsonl` only.
3. [S3] Read the latest fast record for the tree, graded by `checkEventName`; prove a command is one commit (one simple git command, subcommand commit, nothing beside it); git's `prepare-commit-msg` is one commit by construction.
4. [S4] In `publishVerdict`, when the tree has no full pass, its latest fast record passed and the command is proven one commit, return the advisory instead of the refusal; carry the fast record count in its key.
5. [S5] `runPublishHook` returns the advisory's text with code 0; update CLAUDE.md §3 and the usage text.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/qh-check-reads-the-ledger.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE "ok [0-9]+ - (a fast check is recorded apart, where no full-check reader looks|a commit-only command on a fast-passed tree is told, not refused|a commit with no fast pass, or a failed one, is still refused|a push, or a commit that also pushes, is refused on a fast-passed tree|git's own hooks let a commit through with the warning and refuse a push|a commit refused before a fast pass is told after it|--fast with no fastCheck declared is said, and runs nothing)" "$T")" -eq 7
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a fast check is recorded apart, where no full-check reader looks` | `tests/qh-check-reads-the-ledger.test.mjs` | `fast-checks.jsonl` holds it; `checks.jsonl` does not exist | F-8, UC2-S1 | S2 |
| `a commit-only command on a fast-passed tree is told, not refused` | `tests/qh-check-reads-the-ledger.test.mjs` | no deny; the full check named | F-9, UC2-S2 | S4 |
| `a commit with no fast pass, or a failed one, is still refused` | `tests/qh-check-reads-the-ledger.test.mjs` | deny twice | F-10, UC2-S3 | S3, S4 |
| `a push, or a commit that also pushes, is refused on a fast-passed tree` | `tests/qh-check-reads-the-ledger.test.mjs` | deny twice | F-11, UC2-S4 | S3 |
| `git's own hooks let a commit through with the warning and refuse a push` | `tests/qh-check-reads-the-ledger.test.mjs` | code 0 with the advisory; code 1 | F-12, UC2-S5 | S5 |
| `a commit refused before a fast pass is told after it` | `tests/qh-check-reads-the-ledger.test.mjs` | deny, then the advisory | F-13, UC2-S6 | S4 |
| `--fast with no fastCheck declared is said, and runs nothing` | `tests/qh-check-reads-the-ledger.test.mjs` | exit 2, nothing ran | F-14, UC2-S7 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seven tests |
| 2 — something selects it | `qh-check --fast`, `publishVerdict`, `runPublishHook` |
| 3 — the caller can discover it | the usage text and the commit advisory |
| 4 — it is used | a project that declares `fastCheck` |

## Mutation Log
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a fast record is kept apart: it is written to checks.jsonl · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · covers:a fast record is kept apart
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · only a proven commit is exempt: a commit followed by a push is taken as a commit · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · covers:only a proven commit is exempt
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the latest fast record decides: a failed fast record exempts the commit · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · covers:the latest fast record decides
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · git's hook says the advisory: the commit passes in silence · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · covers:git's hook says the advisory
- 2026-10-01 · ab59864* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the key carries the fast state: the advisory reuses the refused key and is deduplicated away · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · covers:the key carries the fast state

## Invariants

- No reader of `checks.jsonl` or of `check.*` events sees a fast record.
- A push, any unproven form, and every reader of a full pass read as before.

## Risks

- The commit-only proof refuses more than it must (a commit spelled through an alias); that is the safe direction for a relaxation, and the refusal says why.

## Stop Condition

Stop and ask if a fast pass would have to count anywhere but a proven commit.

## Out of Scope

- `checkInputs` reuse (BACKLOG §331).

## Verification Log
- 2026-10-01 · ab59864* · exit 1 · `set -o pipefail …` · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · ms:4508 · test-lock-sha256:ef2aa9d6fd7b2778e41ff171e83e2094650d44d550d71611ac74fccec3c9dff7 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwktLWFnYWluIHJ1bnMgYSB0cmVlIHRoYXQgYWxyZWFkeSBwYXNzZWQJOGI4ZWZlM2U2OTlhZTU3OGNhZWQ4ZmU5NWM3ZmI0NzcwMWM0NzEwNmRiYmU4NjMxNGMzMjhmNTFkZTAxZThiMQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJLS1mYXN0IHdpdGggbm8gZmFzdENoZWNrIGRlY2xhcmVkIGlzIHNhaWQsIGFuZCBydW5zIG5vdGhpbmcJZTVmNTg1OWQyYjM0YWRlMTM4NjM5NzY4OGI4MzA3NmIyNjhiNWE4OWJiNDAzNGFiYWI2MDc2ZDIwODJhNTY3Ngpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBjaGFuZ2VkIHRyZWUsIGEgdG9ybiBsZWRnZXIgb3IgYSBmYWlsZWQgcnVuIGNoZWNrcyBhZ2FpbgljOTEyMWU2MDdlMTc1MjRjOWUyMDk0NjcwNDhkZGViZmFmNjEwZjg0ZDQyNjA4ZWYwMGM5ZGI3ODk3MTQ2MGJiCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIGNvbW1pdCByZWZ1c2VkIGJlZm9yZSBhIGZhc3QgcGFzcyBpcyB0b2xkIGFmdGVyIGl0CTZhZGM1MjYwNjU4ZTk2ZDE0NTEwNzAyYjllNzM1OTE5OTBmYzY1MzE4OGUyMTNlYjUxZDBjZjZhZjg2MjI3ZDgKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgY29tbWl0IHdpdGggbm8gZmFzdCBwYXNzLCBvciBhIGZhaWxlZCBvbmUsIGlzIHN0aWxsIHJlZnVzZWQJNjYxMzZiODZkYTIwYjNlMWY1MDc5YjAxZDNhYTA1MjI0NDExMmMyY2RmNzg1MzlkOTUyMGY1Zjc4NThhNTY0OQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBjb21taXQtb25seSBjb21tYW5kIG9uIGEgZmFzdC1wYXNzZWQgdHJlZSBpcyB0b2xkLCBub3QgcmVmdXNlZAlmY2UyYjEyMTUzOTQyMGYzNTU5NjBiMTNjYTRmYjdkMzVmMTAyMzE5Nzc5ZTY1MTcxZTM2OGZkZWFjYTYwYWM3CmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIGZhc3QgY2hlY2sgaXMgcmVjb3JkZWQgYXBhcnQsIHdoZXJlIG5vIGZ1bGwtY2hlY2sgcmVhZGVyIGxvb2tzCTViNDdkYzI3ZDhmM2IzNTA1ZWI1YTViOTY2MWM0Y2IxMTI0ZDE2MTc0YmI5ZjgzYTM4NWZmOWYxMzcyNDU0MTYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgcGFzcyBmb2xsb3dlZCBieSBhIGZhaWx1cmUgb24gdGhlIHNhbWUgdHJlZSBjaGVja3MgYWdhaW4JMzYxMjkyOTAxZTI1MjBiZWVjNWI0NzQ2NDNhNDkyOWE5NjI5ZjY1YTE2ZTg1Mjk1NDY2MDVjNjdkOTVhNzNkNQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBwdXNoLCBvciBhIGNvbW1pdCB0aGF0IGFsc28gcHVzaGVzLCBpcyByZWZ1c2VkIG9uIGEgZmFzdC1wYXNzZWQgdHJlZQliZWRjZGExNTJkNTI1ZGI3ODY2ZDk0YmFjZTlkYjhlYWRjZDYyN2RkMjhlMGUxMDVhYWJmMGQ5Mjc5ZTJjNWIwCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIHNraXAgd2FpdHMgZm9yIG5vIGxlYXNlCTEyNTUzZTRjZjViYjMxNzEzYmVjMDVjODE4Nzk5YjZhMGI5NzJmYjAxNTU1OWMxMDVjM2VkNjc0YjAxZTRlZmYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgdHJlZSB3aG9zZSBsYXRlc3QgY2hlY2sgcGFzc2VkIGlzIG5vdCBjaGVja2VkIGFnYWluLCBhbmQgc2F5cyB3aGVuIGFuZCBob3cgbG9uZwk4YzlkZGIxMDI4MzhiNmI0ZWZiYWU1ZGQ1YTg0YTIxMTI1ZTZiYTRjYjRhMDAzOTMxNDAxNDYwODc4ZmQ2YTAzCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIHdyaXRlIGdpdCBjYW5ub3Qgc2VlLCBhZnRlciB0aGUgcGFzcywgY2hlY2tzIGFnYWluCTEyODM0Mzk4OWU5Mjc5ZjA0ZTY4ZGEyNjdkYTkxN2VkYmY0NDZmOWFkZjY4NGFlOTQwZjVkYjVlOThkYzE0ZDYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWV2ZXJ5IHJ1biBzYXlzIGhvdyBsb25nIGl0IHRvb2sJYjA3NGQ3YjJiMjYzYTJlZjRmNTNmMzFmNDQ4ZTkyNDJmOTQ4YzE2OGQ4MDdiZDkxNzllNjA5ZmI2MDc1ZjA0MApib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJZ2l0J3Mgb3duIGhvb2tzIGxldCBhIGNvbW1pdCB0aHJvdWdoIHdpdGggdGhlIHdhcm5pbmcgYW5kIHJlZnVzZSBhIHB1c2gJZDVjMWQxNmIyODgxZTYwYjZlNzczZTY1ZDc1YWRmNzYyYTY5NTEyNzU2YzI2MGM4MmI1NzU2MmYzOWU5ZGJmZA
  ```
  --- last 10 line(s) of stdout (of 247 after folding 252 raw)
    ...
  1..14
  # tests 14
  # suites 0
  # pass 7
  # fail 7
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 4402.837334
  ```
- 2026-10-01 · ab59864* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · ms:0 · test-lock-sha256:9250cfc9a3aa63a6e5b416c47ab14998a8f27ae7f4778d5e380eb45aca7f16ba · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwktLWFnYWluIHJ1bnMgYSB0cmVlIHRoYXQgYWxyZWFkeSBwYXNzZWQJOGI4ZWZlM2U2OTlhZTU3OGNhZWQ4ZmU5NWM3ZmI0NzcwMWM0NzEwNmRiYmU4NjMxNGMzMjhmNTFkZTAxZThiMQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJLS1mYXN0IHdpdGggbm8gZmFzdENoZWNrIGRlY2xhcmVkIGlzIHNhaWQsIGFuZCBydW5zIG5vdGhpbmcJZTVmNTg1OWQyYjM0YWRlMTM4NjM5NzY4OGI4MzA3NmIyNjhiNWE4OWJiNDAzNGFiYWI2MDc2ZDIwODJhNTY3Ngpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBjaGFuZ2VkIHRyZWUsIGEgdG9ybiBsZWRnZXIgb3IgYSBmYWlsZWQgcnVuIGNoZWNrcyBhZ2FpbgljOTEyMWU2MDdlMTc1MjRjOWUyMDk0NjcwNDhkZGViZmFmNjEwZjg0ZDQyNjA4ZWYwMGM5ZGI3ODk3MTQ2MGJiCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIGNvbW1pdCByZWZ1c2VkIGJlZm9yZSBhIGZhc3QgcGFzcyBpcyB0b2xkIGFmdGVyIGl0CTZhZGM1MjYwNjU4ZTk2ZDE0NTEwNzAyYjllNzM1OTE5OTBmYzY1MzE4OGUyMTNlYjUxZDBjZjZhZjg2MjI3ZDgKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgY29tbWl0IHdpdGggbm8gZmFzdCBwYXNzLCBvciBhIGZhaWxlZCBvbmUsIGlzIHN0aWxsIHJlZnVzZWQJNjYxMzZiODZkYTIwYjNlMWY1MDc5YjAxZDNhYTA1MjI0NDExMmMyY2RmNzg1MzlkOTUyMGY1Zjc4NThhNTY0OQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBjb21taXQtb25seSBjb21tYW5kIG9uIGEgZmFzdC1wYXNzZWQgdHJlZSBpcyB0b2xkLCBub3QgcmVmdXNlZAlmY2UyYjEyMTUzOTQyMGYzNTU5NjBiMTNjYTRmYjdkMzVmMTAyMzE5Nzc5ZTY1MTcxZTM2OGZkZWFjYTYwYWM3CmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIGZhc3QgY2hlY2sgaXMgcmVjb3JkZWQgYXBhcnQsIHdoZXJlIG5vIGZ1bGwtY2hlY2sgcmVhZGVyIGxvb2tzCTViNDdkYzI3ZDhmM2IzNTA1ZWI1YTViOTY2MWM0Y2IxMTI0ZDE2MTc0YmI5ZjgzYTM4NWZmOWYxMzcyNDU0MTYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgcGFzcyBmb2xsb3dlZCBieSBhIGZhaWx1cmUgb24gdGhlIHNhbWUgdHJlZSBjaGVja3MgYWdhaW4JMzYxMjkyOTAxZTI1MjBiZWVjNWI0NzQ2NDNhNDkyOWE5NjI5ZjY1YTE2ZTg1Mjk1NDY2MDVjNjdkOTVhNzNkNQpib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJYSBwdXNoLCBvciBhIGNvbW1pdCB0aGF0IGFsc28gcHVzaGVzLCBpcyByZWZ1c2VkIG9uIGEgZmFzdC1wYXNzZWQgdHJlZQliZWRjZGExNTJkNTI1ZGI3ODY2ZDk0YmFjZTlkYjhlYWRjZDYyN2RkMjhlMGUxMDVhYWJmMGQ5Mjc5ZTJjNWIwCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIHNraXAgd2FpdHMgZm9yIG5vIGxlYXNlCTEyNTUzZTRjZjViYjMxNzEzYmVjMDVjODE4Nzk5YjZhMGI5NzJmYjAxNTU1OWMxMDVjM2VkNjc0YjAxZTRlZmYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWEgdHJlZSB3aG9zZSBsYXRlc3QgY2hlY2sgcGFzc2VkIGlzIG5vdCBjaGVja2VkIGFnYWluLCBhbmQgc2F5cyB3aGVuIGFuZCBob3cgbG9uZwk4YzlkZGIxMDI4MzhiNmI0ZWZiYWU1ZGQ1YTg0YTIxMTI1ZTZiYTRjYjRhMDAzOTMxNDAxNDYwODc4ZmQ2YTAzCmJvZHkJdGVzdHMvcWgtY2hlY2stcmVhZHMtdGhlLWxlZGdlci50ZXN0Lm1qcwlhIHdyaXRlIGdpdCBjYW5ub3Qgc2VlLCBhZnRlciB0aGUgcGFzcywgY2hlY2tzIGFnYWluCTEyODM0Mzk4OWU5Mjc5ZjA0ZTY4ZGEyNjdkYTkxN2VkYmY0NDZmOWFkZjY4NGFlOTQwZjVkYjVlOThkYzE0ZDYKYm9keQl0ZXN0cy9xaC1jaGVjay1yZWFkcy10aGUtbGVkZ2VyLnRlc3QubWpzCWV2ZXJ5IHJ1biBzYXlzIGhvdyBsb25nIGl0IHRvb2sJYjA3NGQ3YjJiMjYzYTJlZjRmNTNmMzFmNDQ4ZTkyNDJmOTQ4YzE2OGQ4MDdiZDkxNzllNjA5ZmI2MDc1ZjA0MApib2R5CXRlc3RzL3FoLWNoZWNrLXJlYWRzLXRoZS1sZWRnZXIudGVzdC5tanMJZ2l0J3Mgb3duIGhvb2tzIGxldCBhIGNvbW1pdCB0aHJvdWdoIHdpdGggdGhlIHdhcm5pbmcgYW5kIHJlZnVzZSBhIHB1c2gJMzkyMjc5MTQzMWU3YWZkODE4Yzc5ZjQ1ZjAzZjM4MzJkOWZiNzEyYjNlZWFkZDMyMjViZTUwYTY1ZGFjM2Y0Mw · test-lock-kind:replace
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · ms:7483
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · ms:6904
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · ms:6304
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · ms:6211
- 2026-10-01 · ab59864* · exit 0 · `set -o pipefail …` · acceptance-sha256:fef5f9ed73955eca95ab3d4c040de912466a9080afac0c298b7f6cc393dd6e33 · ms:6198
