# Task ADR-063-T3: adr-verify never reads a date as a record number

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one function)
**Owner:** unassigned
**Produces:** none
**Consumes:** `record_id` in `plugin/lib/record.py` and the identity table in `tests/record-identity.test.mjs` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the shared record_id in record_number_of`, `the owning record's title`, `the owning record file by its full name`, `an unnumbered record is never demoted`, `the sweep marks a demoted false claim`

## Goal

`record_number_of` in `plugin/bin/adr-verify` reads a record's number through `record.record_id`, so a record named `YYYY-MM-DD-slug`, in any separator, has no number, where today it reads 2026. The unanchored `re.search` at `:2006` goes. No guard is added beside it: an unanchored guard moves the match one character on and reads 26, which `strictFrom` would demote, the fail-open direction. The owning record's path is built as `directory.name + ".md"`, because `with_suffix(".md")` turns `2026.07.15.x` into `2026.07.15.md`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/record-identity.test.mjs` | edit | the test below |
| `plugin/bin/adr-verify` | edit | `record_number_of` (`:1997-2007`) calls `record.record_id` on the owning record's name and title, and finds the record file by `directory.name + ".md"` |
| `tests/mutations.json` | edit | a mutant |

## Ordered Steps

1. [S1] Write the test and see it fail on an assertion (TDD red).
2. [S2] Replace the title search and the name search in `record_number_of` with one call to `record.record_id`; a stem is no number, so it returns None.
3. [S3] Run the fence green and record mutants:
   - restore the unanchored `re.search`;
   - restore it with the hyphen-only date guard, which reads 26.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap tests/record-identity.test.mjs 2>&1) || { printf '%s\n' "$out"; exit 1; }
for name in 'adr-verify reads no record number from a date in any separator'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && bash scripts/selftest.sh
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-verify reads no record number from a date in any separator` | `tests/record-identity.test.mjs` | With `strictFrom` set to 2100, above 2026, a task of a record named `2026-07-15-x`, `2026_07_15_x` or `2026.07.15.x` is not marked `[strictFrom]` in `adr-verify --sweep`'s output (today it is, as record 2026, so the test is red before the fix); three controls below the cutoff still are, each numbered by one route: its name (`012-x`), only its title (`control-x`, `# ADR-004`), and only a title found by the record's full name (`v1.2-notes`, `# ADR-007`) | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the rewritten `record_number_of` |
| 2 — something selects it | `demoted_by` via `record_number_of`; S3's mutants |
| 3 — the caller can discover it | the `[strictFrom]` mark in `adr-verify`'s output (`:2198`) |
| 4 — it is used | the test runs `adr-verify` itself |

## Mutation Log

## Invariants

- `tests/gate-regressions.py`'s pins on `record_number_of` still pass (`:1897-1898`: ADR-000 is 0, ADR-014 is 14).
- No verdict changes for a numbered or `NNN-slug` record. A dated record's verdict changes only where `strictFrom` is above 2026.

## Risks

- The owning record's title is read by `record_id` instead of by this function's own regex. The two regexes differ in what they accept after `ADR`; the identity table carries every title shape the existing pins use.

## Stop Condition

Stop and ask if the test cannot observe the demotion through `adr-verify`'s own output. The finding would then be unobservable, and a function-level test is the fallback the owner should choose.

## Out of Scope

- adr-lint's `adr_number` (permanent: boundary: already guarded, BACKLOG §66, and it reads the same regexes after T1)

## Verification Log
- 2026-09-22 · 9652ae6* · exit 1 · `set -o pipefail …` · acceptance-sha256:5109467e37465f044cda67bde665fef84da3a22d8236dd4584d47bb58f034155 · ms:1781 · test-lock-sha256:d2cdfa2f8f62e193901ad456dd93b5bbce5401490c6d1e20f3aad0e1074cb1fa · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlY29yZC1pZGVudGl0eS50ZXN0Lm1qcwlhIGRhdGUtc2hhcGVkIG5hbWUgbmV2ZXIgeWllbGRzIGEgcmVjb3JkIG51bWJlcgk2YzRlOWMxYjFjZmZjYzA5MTgzODc3YzM1ZGQ5ZTliMzcyNGMyNDVkZDc3OGNjZmFhNTQwYzg4YWQ0MjFjN2JjCmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgZGF0ZS1zbHVnIGFyY2hpdmUgcGFzc2VzIGFkci1yZXRpcmUtY2hlY2sgd2l0aCBlYWNoIHJlY29yZCBuYW1lZCBieSBpdHMgc3RlbQk4NzU4NGVkMGQ1NDRmNGVlODE3OWRlNjEzYjI2YmE5NWEzZmU2MDczNjU5M2EzNGI5OTE4ZDRkZmIzNDM0YTU4CmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgZGF0ZWQgc3VwZXJzZXNzaW9uIGlzIG5ldmVyIHJlY29yZCAyMDI2CTJhYzI4MjVkNmYzNzY5ZDE0ZWFmYjcxNmRjOWUwYjM4M2Q2MjhkMWY2ZWI1MWY1MjA5MWU3NmY0MzhmOTUxYTcKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYSBmaWxlIHdpdGggbm8gaWRlbnRpdHkgaXMgYWR2aWNlLCBub3QgYSBmYWlsdXJlCWMxYTBhMjc4OGNmYWRhNjBlNDliY2Q2MTE0MGM5ODgzZTM1YzE2ODRlNDQzYTdmYTg5YWU4MDYxNzM5NjM3YjIKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYSBudW1iZXJlZCBhcmNoaXZlIHJlYWRzIGV4YWN0bHkgYXMgYmVmb3JlCWY5N2EzOTZlNTYwYzEwMzY5MTc2YzIyMTM0ZTVhMTdjODI2NjczNzhlOTVhMmU1YTEzYzE5OGM4YzMyNzc0MGMKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYSByZWZlcmVuY2UgbmFtZXMgYSByZWNvcmQgb25seSBhcyBhIHdob2xlIHRva2VuCWQ2NzQyMGUwOTBkZDU4OWNjYmE2ODgwMTI3OGZmNjQ5ODNmM2UwZjYzYzAwZWM3MDBlY2VkNGRlNGJkZTgzNDkKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYSByb3csIHJlY2VpcHQgb3Igc3VwZXJzZXNzaW9uIHRoYXQgbmFtZXMgbm8gcmVjb3JkIGlzIHJlZnVzZWQJMDgyNjZlOWU0Y2MyOGIzYTZiNzgyNWJhM2UxMThhMzU5OGVlM2E2YjFiZTMwNjkyZDYwNTYyZjczMmNjMDYxZApib2R5CXRlc3RzL3JlY29yZC1pZGVudGl0eS50ZXN0Lm1qcwlhZHItcmV0aXJlLWNoZWNrIC0tYWRvcHQgcmVhZHMgYSBkYXRlLXNsdWcgY29ycHVzCWUzMmRiZjlhY2QyZjg3YTIyMDg4YmRhMzM3YTNlOTViY2RhZjU1NDA0ZWY3ZjIzNzIzYzJmZDU5YWQyZTFiYTkKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYWRyLXN0YXRlIHJlc29sdmVzIGEgc3VwZXJzZXNzaW9uIGJ5IHN0ZW0JNWU0ZGFlYzJlOWIwYzJmZTc3OTFkY2ZlODU2ZDcyYWFkMmZmMzMzYWEyY2MxYTVhYWZlZmVkZGNlZDM3MTk1ZApib2R5CXRlc3RzL3JlY29yZC1pZGVudGl0eS50ZXN0Lm1qcwlhZHItdmVyaWZ5IHJlYWRzIG5vIHJlY29yZCBudW1iZXIgZnJvbSBhIGRhdGUgaW4gYW55IHNlcGFyYXRvcgllOTM1NGJjNTRhMGQ4NzBkYWJlOTg3YWRlMzJmY2Y3YTRmN2FhNWYxYTdjY2M2NjY2OWJhZmE1OTFlNjQ4MWIyCmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWFuIE5OTi1zbHVnIGFyY2hpdmUga2VlcHMgaXRzIHJlY29yZCBudW1iZXJzCWNmYjA3ZTQzMzdjYzZlOTZhNTgzYWJkNmQ0YjhlMWNjMzRlMGFjYzYyNGQ1NDQ5YzkzNThkYjUyNDIwZmMxMjgKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJdGhlIEpTIGFuZCBQeXRob24gaWRlbnRpdHkgcnVsZXMgYWdyZWUgb24gb25lIHRhYmxlCTg2NTJhM2Q3YWZkYTk1OWMyZjUzODVkYjE3YzI1MDI2MmY2YjVkZTlkOTFmMzY4Y2RiNTY3Mjc4YjAxNDkxZTQKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJdGhlIGFydGlmYWN0IGhvb2sgcGFzc2VzIGEgZGF0ZS1zbHVnIGFyY2hpdmUJNDNiYzA5Yjg1MjhiYzc5YmM5ZTlmNzliNjllZjVhYzA5YTQ3MjM5ZTBlZWE1ZDBkOTgzNTEzZmI0MDM2OGIxNQpib2R5CXRlc3RzL3JlY29yZC1pZGVudGl0eS50ZXN0Lm1qcwl0aGUgY29ycHVzIHJlYWRlciBsaXN0cyBkYXRlZCByZWNvcmRzLCBhY3RpdmUgYW5kIGFyY2hpdmVkCWNjMWJiNmM2ZWQyMzBkYzVjMzRkNGQwMzY3Mjg5OTcwNzE2N2U1Njg4ZDBmMWJiMWI1MzIxZTMyYjE5OGJiZDAKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJdGhlIGxpZmVjeWNsZSBhcmNoaXZlIHJlYWRlciByZWFkcyBhIHJlY29yZCBieSBpdHMgc3RlbQliMjVjYzQzNmRmYWFhMGE2MjBmZTI2MTM2MjNjZWQwZmI5ZjRhMjI1NGVjZjcyZWI3YWE2YjcwODE4Yjc4NGVj
  ```
  --- last 10 line(s) of stdout (of 116 after folding 116 raw)
    ...
  1..15
  # tests 15
  # suites 0
  # pass 14
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 1721.7495
  ```
