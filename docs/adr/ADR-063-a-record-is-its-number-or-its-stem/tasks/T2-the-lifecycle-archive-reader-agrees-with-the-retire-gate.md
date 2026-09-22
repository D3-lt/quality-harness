# Task ADR-063-T2: The lifecycle corpus reader agrees with the retire gate

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (the corpus reader and one consumer)
**Owner:** unassigned
**Produces:** an `id` on every `adrCorpus` record; `supersededBy` as an id
**Consumes:** the fixture corpora and the identity table in `tests/record-identity.test.mjs` (T1); `record_id` and the reference rule (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the exit status of the named test run`, `the TAP line printed for each named test`, `the test output printed when a named test fails`, `each named test actually running`, `the full selftest`

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
