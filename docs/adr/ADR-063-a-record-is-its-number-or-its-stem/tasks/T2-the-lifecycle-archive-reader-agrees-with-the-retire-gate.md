# Task ADR-063-T2: The lifecycle corpus reader agrees with the retire gate

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (the corpus reader and one consumer)
**Owner:** unassigned
**Produces:** an `id` on every `adrCorpus` record; `supersededBy` as an id
**Consumes:** the fixture corpora and the identity table in `tests/record-identity.test.mjs` (T1); `record_id` and the reference rule (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the date shape in the name guard`, `admission under a frozen archive`, `the catalog found at the archive root`, `the supersession id`, `adr-state keyed by id`, `the JS identity rule`

## Goal

`adrCorpus` in `plugin/scripts/lifecycle.mjs` lists a date-slug corpus's records, active and archived, gives each an `id` by ADR-063's rule, and reads catalog rows, `superseded by` and task claims by that id. `supersededBy` never turns a date into a record number. `adr-state` resolves a supersession by id. On the identity table, the JS rule gives exactly what T1's Python `record_id` gives.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/record-identity.test.mjs` | edit | the tests below, on T1's fixtures |
| `plugin/scripts/lifecycle.mjs` | edit | `ADR_FILE` (`:1280`) and `adrNumber` (`:1527`) take the `DATE_SHAPED` shape; `recordFilesFromListing` (`:1648`) admits content-test records under a frozen archive via `underFrozenArchive` (`:1031`), passed the file's own directory parts, since it checks only strict ancestors (`:1039`), and repository-relative paths; `archiveDecisionEffect` (`:1351-1357`) finds the catalog at the frozen-archive root rather than only beside the file, resolving each row's link against that README; `id` on each record; `ARCHIVE_EFFECT` (`:1337`), `archiveDecisionEffect` (`:1351`), the row link (`:1367`), the task claim (`:1816`) and `supersededBy` (`:1835`) by id |
| `plugin/scripts/adr-state.mjs` | edit | `byNumber` (`:42`, `:64`, `:73`) becomes `byId`; the label (`:39`) prints a stem when there is no number |
| `tests/mutations.json` | edit | a mutant per mechanism |

## Ordered Steps

1. [S1] Measure first. On T1's date-slug fixture, and on a copy of its shape with every active record, find why `adrCorpus` lists fewer dated active records than the content test admits: the cold review read 19 of 24 on the real corpus. Record the cause in this task before changing anything.
2. [S2] Write the tests and see them fail on an assertion (TDD red).
3. [S3] Change the date guard in `ADR_FILE` and `adrNumber` to the `DATE_SHAPED` shape, so `_` and `.` separators are excluded as hyphens are.
4. [S4] Admit a record under a frozen archive in `recordFilesFromListing`, using `underFrozenArchive`, rather than widening the `adr` directory-name rule. Find its catalog at the frozen-archive root: today `archiveDecisionEffect` looks only in the file's own directory and returns null for `<stem>/<stem>.md`, so a withdrawn record falls back to its frozen `Status:` and reads as governing, which is the failure its own comment (`:1320-1326`) warns about, and which a numbered per-directory archive already hits.
5. [S5] Give each record an `id`, and read catalog rows, `superseded by` and task claims by it, with the reference rule.
6. [S6] Key `adr-state`'s supersession map by id.
7. [S7] Run the fence green and record mutants:
   - restore the hyphen-only date guard;
   - drop the frozen-archive admission;
   - look for the catalog only beside the file again;
   - let `supersededBy` read the first digits;
   - key `adr-state` by number again;
   - let the JS rule read a number from a date-shaped name.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap tests/record-identity.test.mjs 2>&1) || { printf '%s\n' "$out"; exit 1; }
for name in 'the corpus reader lists dated records, active and archived' 'the lifecycle archive reader reads a record by its stem' 'a dated supersession is never record 2026' 'adr-state resolves a supersession by stem' 'the JS and Python identity rules agree on one table'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && bash scripts/selftest.sh
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the corpus reader lists dated records, active and archived` | `tests/record-identity.test.mjs` | Through the exported `adrCorpus`, every dated record in T1's fixture is listed with its stem as `id`, the archived one included, and the numbered fixture's listing is unchanged | none | S1, S2, S3, S4, S5 |
| `the lifecycle archive reader reads a record by its stem` | `tests/record-identity.test.mjs` | In the `<stem>/<stem>.md` layout, the archived dated record's effect (governing, withdrawn, or superseded by a stem) is read from the catalog at the archive root, and a withdrawn one does not read as governing | none | S4, S5 |
| `a dated supersession is never record 2026` | `tests/record-identity.test.mjs` | `Superseded by` in each quoted spelling of a dated record yields its stem, and `Superseded by ADR-0004` still yields 4 | none | S5 |
| `adr-state resolves a supersession by stem` | `tests/record-identity.test.mjs` | `adr-state.mjs` on the fixture reports no dangling supersession for a record superseded by a dated one, and still reports one superseded by a stem no record has | none | S6 |
| `the JS and Python identity rules agree on one table` | `tests/record-identity.test.mjs` | Every row of T1's identity table gives the same answer from lifecycle's rule and from `record.record_id`, run through `python3` in the test | none | S3, S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the `id` field and the edited reader |
| 2 — something selects it | the session notes, `decisionsGoverning` and `adr-state` read the corpus through `adrCorpus`; S7's mutants |
| 3 — the caller can discover it | `adr-state`'s output names a dated record by its stem |
| 4 — it is used | the tests call the exported `adrCorpus` and run `adr-state.mjs` on T1's fixtures |

## Mutation Log

## Invariants

- `tests/archive-not-in-flight.test.mjs`, `tests/archive-history-parity.test.mjs` and the `adrCorpus` tests in `tests/lifecycle.test.mjs` pass unchanged.
- A numbered supersession reads the same number as before, and a record's `number` is unchanged wherever it had one, except for the names S3 changes on purpose: a date-shaped name in the `_` or `.` spelling, and a four-digit name with a numeric slug (ADR-063 Risks), which become stems.

## Risks

- `supersededBy`'s callers compare a number. Each is checked before it can receive a stem; a caller that needs a number keeps `number`, and only the supersession link moves to `id`.

## Stop Condition

Stop and ask if S1 finds the missing records are dropped for a reason ADR-063 did not name, or if a caller of `supersededBy` depends on it being numeric in a way an `id` cannot satisfy.

## Out of Scope

- `adr-next`, `corpus-report.mjs` and `facts-gate-dispatch.sh`'s record test (deferred: docs/BACKLOG.md §252)

## Verification Log
- 2026-09-22 · bbb045b* · exit 1 · `set -o pipefail …` · acceptance-sha256:e89ed958f9d55758e466941a56ae052a1abfbf220d47a3689e7ac744ccd48bc4 · ms:1263 · test-lock-sha256:7b23ac36c464459dee57d37b41565afc4ebf78ba6d3509f485be4aa5af7b609b · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlY29yZC1pZGVudGl0eS50ZXN0Lm1qcwlhIGRhdGUtc2hhcGVkIG5hbWUgbmV2ZXIgeWllbGRzIGEgcmVjb3JkIG51bWJlcgk2YzRlOWMxYjFjZmZjYzA5MTgzODc3YzM1ZGQ5ZTliMzcyNGMyNDVkZDc3OGNjZmFhNTQwYzg4YWQ0MjFjN2JjCmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgZGF0ZS1zbHVnIGFyY2hpdmUgcGFzc2VzIGFkci1yZXRpcmUtY2hlY2sgd2l0aCBlYWNoIHJlY29yZCBuYW1lZCBieSBpdHMgc3RlbQk4NzU4NGVkMGQ1NDRmNGVlODE3OWRlNjEzYjI2YmE5NWEzZmU2MDczNjU5M2EzNGI5OTE4ZDRkZmIzNDM0YTU4CmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgZGF0ZWQgc3VwZXJzZXNzaW9uIGlzIG5ldmVyIHJlY29yZCAyMDI2CTJhYzI4MjVkNmYzNzY5ZDE0ZWFmYjcxNmRjOWUwYjM4M2Q2MjhkMWY2ZWI1MWY1MjA5MWU3NmY0MzhmOTUxYTcKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYSBmaWxlIHdpdGggbm8gaWRlbnRpdHkgaXMgYWR2aWNlLCBub3QgYSBmYWlsdXJlCWMxYTBhMjc4OGNmYWRhNjBlNDliY2Q2MTE0MGM5ODgzZTM1YzE2ODRlNDQzYTdmYTg5YWU4MDYxNzM5NjM3YjIKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYSBudW1iZXJlZCBhcmNoaXZlIHJlYWRzIGV4YWN0bHkgYXMgYmVmb3JlCWY5N2EzOTZlNTYwYzEwMzY5MTc2YzIyMTM0ZTVhMTdjODI2NjczNzhlOTVhMmU1YTEzYzE5OGM4YzMyNzc0MGMKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYSByZWZlcmVuY2UgbmFtZXMgYSByZWNvcmQgb25seSBhcyBhIHdob2xlIHRva2VuCWQ2NzQyMGUwOTBkZDU4OWNjYmE2ODgwMTI3OGZmNjQ5ODNmM2UwZjYzYzAwZWM3MDBlY2VkNGRlNGJkZTgzNDkKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYSByb3csIHJlY2VpcHQgb3Igc3VwZXJzZXNzaW9uIHRoYXQgbmFtZXMgbm8gcmVjb3JkIGlzIHJlZnVzZWQJMDgyNjZlOWU0Y2MyOGIzYTZiNzgyNWJhM2UxMThhMzU5OGVlM2E2YjFiZTMwNjkyZDYwNTYyZjczMmNjMDYxZApib2R5CXRlc3RzL3JlY29yZC1pZGVudGl0eS50ZXN0Lm1qcwlhZHItcmV0aXJlLWNoZWNrIC0tYWRvcHQgcmVhZHMgYSBkYXRlLXNsdWcgY29ycHVzCWUzMmRiZjlhY2QyZjg3YTIyMDg4YmRhMzM3YTNlOTViY2RhZjU1NDA0ZWY3ZjIzNzIzYzJmZDU5YWQyZTFiYTkKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYWRyLXN0YXRlIHJlc29sdmVzIGEgc3VwZXJzZXNzaW9uIGJ5IHN0ZW0JNWU0ZGFlYzJlOWIwYzJmZTc3OTFkY2ZlODU2ZDcyYWFkMmZmMzMzYWEyY2MxYTVhYWZlZmVkZGNlZDM3MTk1ZApib2R5CXRlc3RzL3JlY29yZC1pZGVudGl0eS50ZXN0Lm1qcwlhbiBOTk4tc2x1ZyBhcmNoaXZlIGtlZXBzIGl0cyByZWNvcmQgbnVtYmVycwljZmIwN2U0MzM3Y2M2ZTk2YTU4M2FiZDZkNGI4ZTFjYzM0ZTBhY2M2MjRkNTQ0OWM5MzU4ZGI1MjQyMGZjMTI4CmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCXRoZSBKUyBhbmQgUHl0aG9uIGlkZW50aXR5IHJ1bGVzIGFncmVlIG9uIG9uZSB0YWJsZQk4NjUyYTNkN2FmZGE5NTljMmY1Mzg1ZGIxN2MyNTAyNjJmNmI1ZGU5ZDkxZjM2OGNkYjU2NzI3OGIwMTQ5MWU0CmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCXRoZSBhcnRpZmFjdCBob29rIHBhc3NlcyBhIGRhdGUtc2x1ZyBhcmNoaXZlCTQzYmMwOWI4NTI4YmM3OWJjOWU5Zjc5YjY5ZWY1YWMwOWE0NzIzOWUwZWVhNWQwZDk4MzUxM2ZiNDAzNjhiMTUKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJdGhlIGNvcnB1cyByZWFkZXIgbGlzdHMgZGF0ZWQgcmVjb3JkcywgYWN0aXZlIGFuZCBhcmNoaXZlZAljYzFiYjZjNmVkMjMwZGM1YzM0ZDRkMDM2NzI4OTk3MDcxNjdlNTY4OGQwZjFiYjFiNTMyMWUzMmIxOThiYmQwCmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCXRoZSBsaWZlY3ljbGUgYXJjaGl2ZSByZWFkZXIgcmVhZHMgYSByZWNvcmQgYnkgaXRzIHN0ZW0JYjI1Y2M0MzZkZmFhYTBhNjIwZmUyNjEzNjIzY2VkMGZiOWY0YTIyNTRlY2Y3MmViN2FhNmI3MDgxOGI3ODRlYw
  ```
  --- last 10 line(s) of stdout (of 204 after folding 205 raw)
    ...
  1..14
  # tests 14
  # suites 0
  # pass 9
  # fail 5
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 1202.146542
  ```
