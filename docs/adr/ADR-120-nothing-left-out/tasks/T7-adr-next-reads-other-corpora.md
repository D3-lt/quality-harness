# Task ADR-120-T7: adr-next reads another corpus's records and a sign-off's last verdict

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** a shared record-file rule in `plugin/lib/record.py`; `foreign_state` using it; `human_outcome` deciding on the last verdict word
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

adr-next evaluates a cross-record Depends-on in a corpus whose records are named `NNN-slug.md`, and reads a sign-off by its
last verdict word, so a note that describes a failure it observed and then approves is done, while one that approves and then
reports a failure stops.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/adr-next-foreign.test.mjs` | create | the glob and verdict rows with their twins (0 locks: new) |
| `plugin/lib/record.py` | edit | the record-file rule adr-lint carries at `plugin/bin/adr-lint:4388` onwards (`ADR-NNN-slug.md` or `NNN-slug.md`, with its date guard), moved here so both readers share it |
| `plugin/bin/adr-lint` | edit | reads the rule from `record.py`; its behaviour is unchanged |
| `plugin/bin/adr-next` | edit | `foreign_state` (:1027-1031) enumerates by the shared rule and finds the tasks directory beside the record; `human_outcome` (:408-449) decides on the last verdict word |
| `tests/adr-next.test.mjs` | read | its locks (ADR-119 T3 among them) stay byte-identical: `python3 scripts/test-locks.py tests/adr-next.test.mjs` first |
| `tests/mutations/plugin/bin/adr-next.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/adr-next.test.mjs`, then write the failing tests and record the red run. Glob: a corpus with `032-x.md` whose `tasks/T4-y.md` is done makes `033-z.md`'s T5 that depends on "ADR-032 T4" READY, and a not-done T4 makes it blocked; a dated file `2026-07-12-x.md` is no ADR-2026. Verdict, each through `human_outcome` and through adr-next on a task file: pass — "observed: an empty selection made 'no tests to run' trip the FAIL guard; approved", "observed: reranker stopped: fused order in 0.4 s; approved", "observed: the run printed [build failed]; approved"; stop — "approved, but the run failed", "not approved: it failed", "approved? it failed", "confirmed BLOCKED", "passed, but stop", "❌ observed"; and every row of ADR-119 T3's tests keeps its answer.
2. [S2] Move adr-lint's record-file rule into `record.py` and use it from adr-lint unchanged and from `foreign_state`.
3. [S3] In `human_outcome`, after the negator, question, taken-back and cross checks, find the verdict words in the note's own words (with `not_the_verdict` and the neutralised forms applied as today) and let the last one decide. A negative word counts wherever it sits; an affirmative counts as the last only when (a) it is outside quotes and (c) it opens a clause: the note's start, or after `;` `,` `.` `:` `—` ` - `, optionally then "and", "then" or "so". (b), not directly after "to ", needs no check of its own: a word after "to " opens no clause, so (c) already excludes it (its mutant survived for that reason, 2026-10-21).
4. [S4] Record a killed mutant per mechanism, with catalogue entries, and run `node scripts/mutate.mjs --case 'ADR-120 T7'`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \
  && for n in "a foreign record named NNN-slug is found, and a dated file is no record" \
      "a sign-off's last verdict word decides" \
      "a negator, a question, a taken-back verdict and a cross still stop wherever they sit"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a foreign record named NNN-slug is found, and a dated file is no record` | `tests/adr-next-foreign.test.mjs` | the shared rule in `foreign_state`, with the date guard | — | S1, S2 |
| `a sign-off's last verdict word decides` | `tests/adr-next-foreign.test.mjs` | the three observed-then-approved notes pass; approved-then-failed stops | — | S1, S3 |
| `a negator, a question, a taken-back verdict and a cross still stop wherever they sit` | `tests/adr-next-foreign.test.mjs` | the stops that do not depend on order | — | S1, S3 |
| `a verdict word inside quotes is not the closing verdict` | `tests/adr-next-foreign.test.mjs` | condition (a): a quoted "approved" after a negative does not pass the note | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `ready_state` calls `foreign_state`; `human_stop` calls `human_outcome` |
| 3 — the caller can discover it | adr-next's output and `--json` |
| 4 — it is used | every adr-next run on a corpus with cross-record dependencies or human sign-offs |

## Mutation Log
- 2026-10-21 · 1cf5fc02* · mutant killed · exit 1 · `plugin/bin/adr-next` · foreign_state enumerates only ADR-NNN-slug.md, so an NNN-slug.md record is never found · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967
- 2026-10-21 · 1cf5fc02* · mutant killed · exit 1 · `plugin/lib/record.py` · record_file_number loses the date guard, so 2026-07-12-x.md is ADR-2026 · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967
- 2026-10-21 · 1cf5fc02* · mutant killed · exit 1 · `plugin/bin/adr-next` · a negative word anywhere stops, so an observed failure followed by approval is not done · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967
- 2026-10-21 · 1cf5fc02* · mutant survived · exit 0 · `plugin/bin/adr-next` · an affirmative inside quotes counts as the closing verdict · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-21 · 1cf5fc02* · mutant survived · exit 0 · `plugin/bin/adr-next` · an affirmative after "to" (fail to pass) counts as the closing verdict · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-21 · 1cf5fc02* · mutant killed · exit 1 · `plugin/bin/adr-next` · an affirmative mid-clause counts as the closing verdict · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967
- 2026-10-21 · 1cf5fc02* · mutant killed · exit 1 · `plugin/bin/adr-next` · an affirmative inside quotes counts as the closing verdict · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967

## Invariants

- adr-lint's record enumeration answers exactly as before on this corpus and on a `NNN-slug.md` corpus.
- Every locked adr-next test keeps its answer.

## Risks

- A note whose last word is affirmative but which reports an unresolved failure passes: the twins "approved, but the run failed" and "approved? it failed" stay stops, and the sign-off grammar in the adr-execute skill already asks for the verdict last.

## Stop Condition

Stop if a locked ADR-119 T3 row changes its answer under the last-word rule: that row is the owner's narrow decision, and the
conflict goes back to the owner.

## Out of Scope

- adr-lint's own reading of a sign-off (permanent: boundary: adr-lint reads done through adr-next's rule; no second reader exists, measured with `mrw read --grep 'def human_outcome' plugin/` on 2026-10-21)

## Verification Log
- 2026-10-21 · 1cf5fc02* · exit 1 · `out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \ …` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:36245 · test-lock-sha256:ef64f0b558f9bfa61ea85f578f1f4be1f8d18a6f043aa0398270f8b7742b7f68 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLW5leHQtZm9yZWlnbi50ZXN0Lm1qcwlhIGZvcmVpZ24gcmVjb3JkIG5hbWVkIE5OTi1zbHVnIGlzIGZvdW5kLCBhbmQgYSBkYXRlZCBmaWxlIGlzIG5vIHJlY29yZAlmOTdmN2QzMjk2Y2FiZTA4ZTM3MDUxYjU5YzFlOTY4M2UyZGVjOTFlZjcxYzVjMDRlMzViYjVjMGFmYjQ3MzUzCmJvZHkJdGVzdHMvYWRyLW5leHQtZm9yZWlnbi50ZXN0Lm1qcwlhIG5lZ2F0b3IsIGEgcXVlc3Rpb24sIGEgdGFrZW4tYmFjayB2ZXJkaWN0IGFuZCBhIGNyb3NzIHN0aWxsIHN0b3Agd2hlcmV2ZXIgdGhleSBzaXQJMTlmOTI2MjFmNTliZjdlMzQ5N2Q4OTVhZTUyZDI4ZDc5NjU0ZjhiNmU5MWVlNzBkZDhkYjcyYzNjNTI5NTBiYgpib2R5CXRlc3RzL2Fkci1uZXh0LWZvcmVpZ24udGVzdC5tanMJYSBzaWduLW9mZidzIGxhc3QgdmVyZGljdCB3b3JkIGRlY2lkZXMJZTA0Mzg3OTg2ZjY5ODVjOWZiYWY4OGQxYjJkNzEyZTdkOWM1NTlmZDI1ZDhlMzcxN2U2NTE1ZDAwNTEzZTA3Nw
  ```
  ```
- 2026-10-21 · 1cf5fc02* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \ …` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:46102
- 2026-10-21 · 1cf5fc02* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \ …` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:22765
- 2026-10-21 · 1cf5fc02* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \ …` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:22456
- 2026-10-21 · 1cf5fc02* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \ …` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:24266
- 2026-10-21 · 1cf5fc02* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \ …` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:40950
- 2026-10-21 · 1cf5fc02* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \ …` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:80033
- 2026-10-21 · 1cf5fc02* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-next-foreign.test.mjs tests/adr-next.test.mjs 2>&1) \ …` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:36851
- 2026-10-21 · 73a3dd98* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:e7010e18c8878aff575c600f79e2d743a15b6260435e0120835f671905810967 · ms:0 · test-lock-sha256:fb5e7c4052cfa7182a98d630bc36e2fef5f70a4289244e87dead726804cc9efc · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLW5leHQtZm9yZWlnbi50ZXN0Lm1qcwlhIGZvcmVpZ24gcmVjb3JkIG5hbWVkIE5OTi1zbHVnIGlzIGZvdW5kLCBhbmQgYSBkYXRlZCBmaWxlIGlzIG5vIHJlY29yZAlmOTdmN2QzMjk2Y2FiZTA4ZTM3MDUxYjU5YzFlOTY4M2UyZGVjOTFlZjcxYzVjMDRlMzViYjVjMGFmYjQ3MzUzCmJvZHkJdGVzdHMvYWRyLW5leHQtZm9yZWlnbi50ZXN0Lm1qcwlhIG5lZ2F0b3IsIGEgcXVlc3Rpb24sIGEgdGFrZW4tYmFjayB2ZXJkaWN0IGFuZCBhIGNyb3NzIHN0aWxsIHN0b3Agd2hlcmV2ZXIgdGhleSBzaXQJMTlmOTI2MjFmNTliZjdlMzQ5N2Q4OTVhZTUyZDI4ZDc5NjU0ZjhiNmU5MWVlNzBkZDhkYjcyYzNjNTI5NTBiYgpib2R5CXRlc3RzL2Fkci1uZXh0LWZvcmVpZ24udGVzdC5tanMJYSBzaWduLW9mZidzIGxhc3QgdmVyZGljdCB3b3JkIGRlY2lkZXMJZTA0Mzg3OTg2ZjY5ODVjOWZiYWY4OGQxYjJkNzEyZTdkOWM1NTlmZDI1ZDhlMzcxN2U2NTE1ZDAwNTEzZTA3Nwpib2R5CXRlc3RzL2Fkci1uZXh0LWZvcmVpZ24udGVzdC5tanMJYSB2ZXJkaWN0IHdvcmQgaW5zaWRlIHF1b3RlcyBpcyBub3QgdGhlIGNsb3NpbmcgdmVyZGljdAlhZmE3MWIzNmE4ODJjMGZmZTA2OWVlZDkyMTg1MzYzZjNiZDk4ZjgyOWY5ODg0YjAwNDZjMWE4NGNiODUzNDdh · test-lock-kind:replace
