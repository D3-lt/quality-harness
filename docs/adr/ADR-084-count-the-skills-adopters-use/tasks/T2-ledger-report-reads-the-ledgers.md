# Task ADR-084-T2: ledger-report reads the ledgers

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one new read-only script)
**Owner:** unassigned
**Produces:** `plugin/scripts/ledger-report.mjs`
**Consumes:** `skill.invoked` event in the session log (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `skills are counted`, `skips are summed`, `a torn log is UNPROVEN`, `the skill names the reader`

## Goal

`node plugin/scripts/ledger-report.mjs [--json] [<repo>]` prints skill invocations by name and session,
same-tree skips with summed `savedMs` (an estimate), and checks with verdict counts and durations, and
says UNPROVEN for any ledger it could not read whole (ADR-084 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/ledger-report.mjs` | create | the reader |
| `plugin/skills/operating/SKILL.md` | edit | names the reader where adopters are told how to report back — what makes it discoverable |
| `tests/ledger-report.test.mjs` | create | the two tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name a test can see; `the skill names the reader` is the fence's own grep, so its mutant lives in the Mutation Log only |

## Ordered Steps

1. [S1] Write the two tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Read every session log through `readEvents`, `skips.jsonl` and `checks.jsonl` under the checkout's state directory; count and sum; a log with `complete: false`, or a ledger that could not be read, is UNPROVEN in both outputs.
3. [S3] Print text and `--json`; no session content, no path outside the checkout; exit 0 whatever it finds.
4. [S4] Name the reader in the operating skill; the Acceptance fence greps for it, so a skill that stops naming it fails the task. [proof: acceptance]
5. [S5] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
T=$(mktemp)
node --test --test-reporter=tap tests/ledger-report.test.mjs > "$T" 2>&1 \
  && for t in 'ledger-report counts skills and sums skips from the ledgers' 'ledger-report says UNPROVEN for a ledger it could not read whole'; do test "$(grep -cxE "ok [0-9]+ - $t" "$T")" = 1 || exit 1; done \
  && grep -q 'scripts/ledger-report.mjs' plugin/skills/operating/SKILL.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `ledger-report counts skills and sums skips from the ledgers` | `tests/ledger-report.test.mjs` | counts by name and session; skips and savedMs; checks | none | S2, S3 |
| `ledger-report says UNPROVEN for a ledger it could not read whole` | `tests/ledger-report.test.mjs` | a torn session log and an unreadable ledger are UNPROVEN, never zero | none | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | its CLI |
| 3 — the caller can discover it | the operating skill names it |
| 4 — it is used | the ADR-081 measurement on or after 2026-10-08 [proof: human: an adopter runs it] |

## Mutation Log
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/scripts/ledger-report.mjs` · invocations are not counted · acceptance-sha256:4ea6e6491472b4be0cdcd019627c2a66c7f254341bc6c0c7e019cc3721ed36f5 · covers:skills are counted
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/scripts/ledger-report.mjs` · the saving is not summed · acceptance-sha256:4ea6e6491472b4be0cdcd019627c2a66c7f254341bc6c0c7e019cc3721ed36f5 · covers:skips are summed
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/scripts/ledger-report.mjs` · a torn session log reads as complete · acceptance-sha256:4ea6e6491472b4be0cdcd019627c2a66c7f254341bc6c0c7e019cc3721ed36f5 · covers:a torn log is UNPROVEN
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/skills/operating/SKILL.md` · the operating skill no longer names the reader · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · covers:skills are counted
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/skills/operating/SKILL.md` · the operating skill no longer names the reader · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · covers:the skill names the reader
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/scripts/ledger-report.mjs` · invocations are not counted · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · covers:skills are counted
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/scripts/ledger-report.mjs` · the saving is not summed · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · covers:skips are summed
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/scripts/ledger-report.mjs` · a torn session log reads as complete · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · covers:a torn log is UNPROVEN

## Invariants

- Read-only; exit 0.
- No session content and no path outside the checkout in either output (CLAUDE.md §6).

## Risks

- `savedMs` read as a measurement: the output labels it an estimate, as ADR-081 does.

## Stop Condition

Stop and ask if a ledger's shape differs from what `qh-check.mjs` writes today.

## Out of Scope

- Hook durations — no ledger records them (ADR-084 Out of Scope).

## Verification Log
- 2026-10-05 · f8d1eaf* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:4ea6e6491472b4be0cdcd019627c2a66c7f254341bc6c0c7e019cc3721ed36f5 · ms:365 · test-lock-sha256:c60892aff58f09ea2c94e032b1dea021daf7f42cbd6242d2c96f6ae315654ad0 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbGVkZ2VyLXJlcG9ydC50ZXN0Lm1qcwlsZWRnZXItcmVwb3J0IGNvdW50cyBza2lsbHMgYW5kIHN1bXMgc2tpcHMgZnJvbSB0aGUgbGVkZ2VycwkzZGNhZDU3YTMxODE1NDNhNDAzYTE0MTEyNWY2YWI1ZDJkOWFjYjM0YWM0OTRhOTZhZDNjNDNhNDVhZGNmM2UzCmJvZHkJdGVzdHMvbGVkZ2VyLXJlcG9ydC50ZXN0Lm1qcwlsZWRnZXItcmVwb3J0IHNheXMgVU5QUk9WRU4gZm9yIGEgbGVkZ2VyIGl0IGNvdWxkIG5vdCByZWFkIHdob2xlCWY5M2NjODBkNGU0MmFlMDkwNTQ1Y2M3YjJhM2I4M2U0YmI0ZTZmMjhiNTQzMzBiYmUwMmE1MTMzNDEwMzk3NmI
  ```
  ```
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:4ea6e6491472b4be0cdcd019627c2a66c7f254341bc6c0c7e019cc3721ed36f5 · ms:567
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:4ea6e6491472b4be0cdcd019627c2a66c7f254341bc6c0c7e019cc3721ed36f5 · ms:575
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:4ea6e6491472b4be0cdcd019627c2a66c7f254341bc6c0c7e019cc3721ed36f5 · ms:591
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · ms:640
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · ms:573
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · ms:585
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · ms:582
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:5320a2e5d8870284246f4b681ccc092314d38935b0968a87ea080476d1f28dc2 · ms:565
