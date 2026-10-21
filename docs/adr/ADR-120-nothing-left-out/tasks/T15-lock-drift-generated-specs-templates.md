# Task ADR-120-T15: Lock drift named at commit; generated specs skipped; the template and skill lines

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** lock drift at the turn end; the spec gate's ignore rule; the template and skill lines
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

When a session's changes move a test body another task locks, the turn end names that task and the relock command; the spec gate skips paths git marks `linguist-generated` or the project lists in `"ignore"`; the task template asks what a test double does not model; the adr-retire skill states the `Archived:` receipt grammar.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/lock-drift-commit.test.mjs` | create | the lock rows (0 locks: new) |
| `tests/spec-ignore.test.mjs` | create | the ignore rows (0 locks: new) |
| `tests/lock-drift-scope.test.mjs` | create | the full check of 2026-10-21: the scan gates only a task whose Tests table names the file (0 locks: new) |
| `plugin/scripts/facts-gate-dispatch.sh` | edit | at the commit and turn-end boundaries (not per edit), for a changed non-Markdown path, find the tasks that name it (`git grep --untracked`) and gate them, printing each `locked test` line prefixed `lock drift:`; the dispatcher is the one place both the Node pass and the Go core call, so no record grammar loads in Node and Go needs no change (the executor's design, reviewed 2026-10-21); and skip a spec `spec-skip.mjs` marks generated or ignored |
| `plugin/scripts/spec-skip.mjs` | create | `git check-attr linguist-generated` and the project's `ignore` globs; without node or on any error the spec stays gated, and a refused declaration says UNPROVEN |
| `plugin/scripts/project-config.mjs` | edit | validate `ignore`, as `prose` is validated (:69-98) |
| `plugin/templates/task-template.md` | edit | Risks gains "What the test doubles do not model" |
| `plugin/skills/adr-retire/SKILL.md` | edit | the `Archived: [file](path)` line and what adr-debt reads from it (`plugin/bin/adr-debt:438-457`) |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a session that edits a test body a done task locks gets one advice line naming the task and `adr-verify --relock --replace-hashes`; an edit to an unlocked test says nothing; a spec under a `linguist-generated` path, or under a listed `ignore` glob, is not gated, and the same spec outside them still is.
2. [S2] Implement the lock-drift advice and the ignore rule.
3. [S3] Add the template line and the skill grammar. [proof: human: the wording, read in the round's review]
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs tests/lock-drift-scope.test.mjs 2>&1) \
  && for n in "an edit that moves another task's locked test names the task and the relock" \
      "a generated or ignored spec is not gated, and the same spec elsewhere still is" \
      "the lock-drift scan gates a task whose Tests table names the file, and not one that only lists it as affected"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an edit that moves another task's locked test names the task and the relock` | `tests/lock-drift-commit.test.mjs` | lock drift | — | S1, S2 |
| `a generated or ignored spec is not gated, and the same spec elsewhere still is` | `tests/spec-ignore.test.mjs` | the ignore rule | — | S1, S2 |
| `the lock-drift scan gates a task whose Tests table names the file, and not one that only lists it as affected` | `tests/lock-drift-scope.test.mjs` | the scan's scope (measured 2026-10-21: a boundary dispatch on plugin/bin/adr-next went from 90 s to 0.18 s) | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · the lock-drift call removed from the non-Markdown arm · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · lock drift also said per edit · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · the spec skip call disabled · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant survived · exit 0 · `plugin/scripts/facts-gate-dispatch.sh` · a refused ignore declaration is not said · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · lock drift advice on stdout, not the finding stream · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · an untracked task is not searched · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · a refused ignore declaration is not said (rerun on the tightened row) · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/spec-skip.mjs` · the linguist-generated skip disabled · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/spec-skip.mjs` · unset and false read as generated · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/spec-skip.mjs` · any listed path skips every spec · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/project-config.mjs` · an ignore declaration that could hide the whole tree is accepted · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · 0a54cb25* · mutant killed · exit 1 · `plugin/scripts/project-config.mjs` · ignore is never read · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · b76ac9e0* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · the lock-drift scan gates every task that names the file, so a boundary dispatch on plugin/bin/adr-next ran 25 task gates and took 90 s (the full check of 2026-10-21) · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a
- 2026-10-21 · 507fb18e* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · the lock-drift scan gates every task whose text names the file, so a boundary dispatch on plugin/bin/adr-next ran 25 task gates and took 90 s (the review of e3764d1a) · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a
- 2026-10-21 · 507fb18e* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · a task that names the file only outside its Tests section (an affected file) is gated, so a boundary dispatch on plugin/bin/adr-next runs 25 task gates (the review of e3764d1a) · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a
- 2026-10-21 · 42796035* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · an end-anchored Tests heading misses a CRLF task and a trailing non-breaking space, so a real lock goes unsaid (the review of 42796035) · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a
- 2026-10-21 · 82e1e203* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · a fenced log heading inside the Tests section ends it, so the table after it is not read and its lock goes unsaid (the review of 82e1e203) · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a
- 2026-10-21 · 82e1e203* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · headings read from the file itself rather than unfenced, so a fenced log heading inside the Tests section ends it and its lock goes unsaid (the review of 82e1e203) · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a
- 2026-10-21 · e3421b69* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · a Tests heading inside an HTML comment or a pre block is blanked, though record.py still reads it as a section, so its lock goes unsaid (the review of e3421b69) · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- The lock read on every turn end costs time on a large corpus: it runs only when a changed path is a test file a lock names.

## Stop Condition

Stop if reading the locks needs the record grammar loaded in Node: the artifact pass then calls the Python gate, bounded.

## Out of Scope

- An advisory acknowledgement mechanism (permanent: boundary: ADR-037 declined rationing advice that is true each time it fires; a repeated true line is fixed by grouping, as T5 does, or by its cause)

## Verification Log
- 2026-10-21 · 0a54cb25* · exit 1 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:1612 · test-lock-sha256:9b7a1df3df9bc03ff7e6ec38d9eda8aa4bf9663eb50aef78123eed4dba17f9e9 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbG9jay1kcmlmdC1jb21taXQudGVzdC5tanMJYW4gZWRpdCB0aGF0IG1vdmVzIGFub3RoZXIgdGFzaydzIGxvY2tlZCB0ZXN0IG5hbWVzIHRoZSB0YXNrIGFuZCB0aGUgcmVsb2NrCTdjNjMwNTBhMzIxMGNhMzFjNWU4YTNhMjg3MmU3NTljOTg5ZTYzNWJkMTU5ZjBjOThhMThmMWJlODY1MmVjZGUKYm9keQl0ZXN0cy9zcGVjLWlnbm9yZS50ZXN0Lm1qcwlhIGdlbmVyYXRlZCBvciBpZ25vcmVkIHNwZWMgaXMgbm90IGdhdGVkLCBhbmQgdGhlIHNhbWUgc3BlYyBlbHNld2hlcmUgc3RpbGwgaXMJYzMwZGVlNTk0ODJlYWFhNjMzYzZjNjVmZjlkMDFjZWYzNWJmZjNkM2MzMDQ4NmZkYjk0ZjA2ZDNiNWRjNGE4Zg
  ```
  ```
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:7692
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:7246
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:6339
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:14943
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:18444
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:30135
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:15957
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:13055
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:23232
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:12038
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:15761
- 2026-10-21 · 0a54cb25* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \ …` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:14283
- 2026-10-21 · 20df5a3c* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf · ms:0 · test-lock-sha256:d771e99094668dd24802c97418df03e417dae5278fc9fd58dfa41a3c765756b8 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbG9jay1kcmlmdC1jb21taXQudGVzdC5tanMJYW4gZWRpdCB0aGF0IG1vdmVzIGFub3RoZXIgdGFzaydzIGxvY2tlZCB0ZXN0IG5hbWVzIHRoZSB0YXNrIGFuZCB0aGUgcmVsb2NrCTdjNjMwNTBhMzIxMGNhMzFjNWU4YTNhMjg3MmU3NTljOTg5ZTYzNWJkMTU5ZjBjOThhMThmMWJlODY1MmVjZGUKYm9keQl0ZXN0cy9zcGVjLWlnbm9yZS50ZXN0Lm1qcwlhIGdlbmVyYXRlZCBvciBpZ25vcmVkIHNwZWMgaXMgbm90IGdhdGVkLCBhbmQgdGhlIHNhbWUgc3BlYyBlbHNld2hlcmUgc3RpbGwgaXMJOWUzYmUzNjkxODY1YTZmNTMwMWMyZThiODhhYzc4ZjRiNGViMWYyODU5NGU4YThjNDdkYzM3ZGJmZDg2YTQwYQ · test-lock-kind:replace
- 2026-10-21 · human-observed · observed by the coordinator at 4d2d6819: the task template's Risks asks what each test double does not model and which test or run meets the real one, and the adr-retire skill states the Archived receipt line and what adr-debt reads from it; the wording matches adr-debt · acceptance-sha256:f30291c346c53cf5edfdfedd94a5a9954b6c994ac6b6afbcccd4f8e3ce3f47bf
- 2026-10-21 · b76ac9e0* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs tests/lock-drift-scope.test.mjs 2>&1) \ …` · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a · ms:7773
- 2026-10-21 · 507fb18e* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs tests/lock-drift-scope.test.mjs 2>&1) \ …` · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a · ms:4347
- 2026-10-21 · 507fb18e* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs tests/lock-drift-scope.test.mjs 2>&1) \ …` · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a · ms:3203
- 2026-10-21 · 42796035* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs tests/lock-drift-scope.test.mjs 2>&1) \ …` · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a · ms:3493
- 2026-10-21 · 82e1e203* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs tests/lock-drift-scope.test.mjs 2>&1) \ …` · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a · ms:2828
- 2026-10-21 · 82e1e203* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs tests/lock-drift-scope.test.mjs 2>&1) \ …` · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a · ms:2951
- 2026-10-21 · e3421b69* · exit 0 · `out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs tests/lock-drift-scope.test.mjs 2>&1) \ …` · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a · ms:3923
- 2026-10-21 · 84c80605* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:ae27dae063f6946d020eee033c688ccd129369c7cf3ae4002673d16199be759a · ms:0 · test-lock-sha256:a652163af00b08af9eb8131d329329499b54debbec0b5fadd3d5a66ccfb4cf58 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbG9jay1kcmlmdC1jb21taXQudGVzdC5tanMJYW4gZWRpdCB0aGF0IG1vdmVzIGFub3RoZXIgdGFzaydzIGxvY2tlZCB0ZXN0IG5hbWVzIHRoZSB0YXNrIGFuZCB0aGUgcmVsb2NrCWVlYzEzMjVhNmY1NzkxN2UyMDg3OWJhZjZmYTU1OTQ2NTBmZjA0ZGU4NTM5Yzk4MjIxMWRhYTA0NjYxYTI2Y2QKYm9keQl0ZXN0cy9sb2NrLWRyaWZ0LXNjb3BlLnRlc3QubWpzCXRoZSBsb2NrLWRyaWZ0IHNjYW4gZ2F0ZXMgYSB0YXNrIHdob3NlIFRlc3RzIHRhYmxlIG5hbWVzIHRoZSBmaWxlLCBhbmQgbm90IG9uZSB0aGF0IG9ubHkgbGlzdHMgaXQgYXMgYWZmZWN0ZWQJYjZkNGM4ZjVmMGNiMjdkNWRlODkyMWMyMTBkYzg4NjZmNjRmODY1OGI2OGM2YjQ3NWJiZjllMDAzMzY3NzVjZgpib2R5CXRlc3RzL3NwZWMtaWdub3JlLnRlc3QubWpzCWEgZ2VuZXJhdGVkIG9yIGlnbm9yZWQgc3BlYyBpcyBub3QgZ2F0ZWQsIGFuZCB0aGUgc2FtZSBzcGVjIGVsc2V3aGVyZSBzdGlsbCBpcwk5ZTNiZTM2OTE4NjVhNmY1MzAxYzJlOGI4OGFjNzhmNGI0ZWIxZjI4NTk0ZThhOGM0N2RjMzdkYmZkODZhNDBh · test-lock-kind:replace
