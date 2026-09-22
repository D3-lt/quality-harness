# Task ADR-063-T1: The retire gate reads a record by its number or its stem

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one gate, the shared library, and adr-lint's import)
**Owner:** unassigned
**Produces:** `record_id` and the reference rule in `plugin/lib/record.py`, with `RECORD_FILE_RE`, `TASK_SHAPED_RE` and `DATE_SHAPED_RE` moved there; the fixture corpora and the identity table in `tests/record-identity.test.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the exit status of the named test run`, `the TAP line printed for each named test`, `the test output printed when a named test fails`, `each named test actually running`, `the full selftest`

## Goal

`adr-retire-check` identifies a record by the rule in ADR-063's Decision: a number from the title, else a number from a non-date, non-task name, else the exact stem of a date-shaped name. It does so for active enumeration, catalog rows, decision units, obligations, receipts, supersession and `--adopt`, from one rule in `plugin/lib/record.py`. References match whole tokens only. A numbered or `NNN-slug` archive reads exactly as before.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/record-identity.test.mjs` | create | the tests below; the fixture corpora and the identity table T2 and T3 reuse |
| `plugin/lib/record.py` | edit | `RECORD_FILE_RE`, `TASK_SHAPED_RE`, `DATE_SHAPED_RE` moved in unchanged; `record_id(name, title)`; the reference rule (ADR-045) |
| `plugin/bin/adr-lint` | edit | import the three regexes from `record.py` instead of defining them (`:3780-3784`); no behaviour change |
| `plugin/bin/adr-retire-check` | edit | replace `ADR_ID_RE`/`normalize_id`/`adr_id_for_file` (`:61-67`, `:153`); enumerate active records by the content test, not `rglob("ADR-*.md")` (`:144`); route `:165`, `:188-199`, `:233`, `:276`, `:315`, `:537` through the shared rule |
| `plugin/templates/adr-archive-readme-template.md` | edit | the row id and `superseded by` accept a dated record's stem or path |
| `plugin/skills/adr-retire/SKILL.md` | edit | `:23` hard-codes `superseded by ADR-NNN`; say both spellings |
| `docs/BACKLOG.md` | edit | §252: the per-gate id rules left out of scope, with the enumeration command and the six members it cannot see |
| `tests/mutations.json` | edit | a mutant per mechanism below |

## Ordered Steps

1. [S1] Write the tests on the fixture corpora and see them fail on an assertion (TDD red). The fixtures are temporary git repositories:
   - a numbered `ADR-NNN` corpus and archive: the control;
   - a wcag-shaped `NNN-slug` corpus, titled `# ADR-001: …`, plus one untitled `012-x.md`;
   - a TakeOnline-shaped date-slug corpus: per-record archive directory `<stem>/<stem>.md` with `tasks/T*.md` and `WAVE3-PLAN.md`, a loose active `<stem>.queries.md`, two active stems sharing a prefix (`…-defer`, `…-defer-flock`), and receipts and `Superseded by` values in every spelling ADR-063 quotes;
   - in the numbered corpus, a loose note in a flat archive identified only by its heading, a receipt naming `ADR-012-T3`, and a research note carrying `**Status:**` and `## Context` with no identity;
   - `0012-3-tier-cache.md`, untitled, which becomes a stem (the owner's decision, ADR-063 Risks), and a title `# ADR 2026-07-15: …`, which gives no number.
2. [S2] Move the three regexes into `plugin/lib/record.py` unchanged and have adr-lint import them. adr-lint's existing tests are the control for the move.
3. [S3] Add `record_id(name, title)` and the reference rule to `record.py`.
4. [S4] Route every id site in `adr-retire-check` through them. Enumerate active records by the content test (a Status line plus `## Context` or `## Decision`), keeping the `tasks/` exclusion and adding no other directory-name condition. Attribute a non-record file by its own heading first, then by the nearest ancestor directory below the archive root whose name carries an id. Report an admitted file with no identity as `advice:`.
5. [S5] Keep refusing a row, receipt or supersession that resolves to no record. The message keeps the words "no ADR id", so `tests/gate-rules.test.mjs:1604-1607` passes unchanged.
6. [S6] Update the template and the skill text, and add BACKLOG §252. [proof: acceptance]
7. [S7] Run the fence green and record mutants:
   - drop the stem fallback;
   - read a number out of a date-shaped name;
   - let a reference match a prefix rather than a whole token;
   - drop the receipt-by-stem match;
   - drop the supersession-by-stem match;
   - restore the `ADR-*.md` enumeration glob.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap tests/record-identity.test.mjs 2>&1) || { printf '%s\n' "$out"; exit 1; }
for name in 'a date-slug archive passes adr-retire-check with each record named by its stem' 'an NNN-slug archive keeps its record numbers' 'a date-shaped name never yields a record number' 'a numbered archive reads exactly as before' 'a reference names a record only as a whole token' 'a row, receipt or supersession that names no record is refused' 'the artifact hook passes a date-slug archive' 'adr-retire-check --adopt reads a date-slug corpus' 'a file with no identity is advice, not a failure'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && bash scripts/selftest.sh
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a date-slug archive passes adr-retire-check with each record named by its stem` | `tests/record-identity.test.mjs` | The TakeOnline-shaped archive passes, counts its archived and active records, and the digest printed equals one the test computes from the files | none | S1, S3, S4 |
| `an NNN-slug archive keeps its record numbers` | `tests/record-identity.test.mjs` | `001-x.md` titled `# ADR-001` and an untitled `012-x.md` are records 1 and 12, and a row or receipt naming `ADR-012` resolves | none | S1, S3, S4 |
| `a date-shaped name never yields a record number` | `tests/record-identity.test.mjs` | `2026-07-15-x`, `2026_07_15_x` and `2026.7.15.x` give their stems, never 2026 or 26, from `record_id` and from the gate's output; `0012-3-tier-cache` gives its stem; a title `# ADR 2026-07-15: …` gives no number | none | S3 |
| `a file with no identity is advice, not a failure` | `tests/record-identity.test.mjs` | The numbered fixture's research note, which the content test admits and no rule identifies, is named on an `advice:` line and the gate still PASSes | none | S4 |
| `a numbered archive reads exactly as before` | `tests/record-identity.test.mjs` | The control: an `ADR-NNN` archive gives a golden PASS line and golden counts written into the test; a heading-identified loose note stays in its record's digest and obligation count, and a receipt naming `ADR-012-T3` still counts for record 12 | none | S2, S4 |
| `a reference names a record only as a whole token` | `tests/record-identity.test.mjs` | A receipt for `…-defer` does not satisfy `…-defer-flock`, and each quoted spelling (bare stem, `` `<stem>.md` ``, `` `docs/adr/<stem>.md` (date) ``, `` `docs/adr-archive/<stem>/<stem>.md` ``, either separator) resolves | none | S3, S4 |
| `a row, receipt or supersession that names no record is refused` | `tests/record-identity.test.mjs` | Each still FAILs, so widening the grammar opened nothing | none | S5 |
| `the artifact hook passes a date-slug archive` | `tests/record-identity.test.mjs` | `plugin/scripts/facts-gate-dispatch.sh` on the fixture's archive README exits 0 with no FAIL, the boundary the report came through (CLAUDE.md §4) | none | S4 |
| `adr-retire-check --adopt reads a date-slug corpus` | `tests/record-identity.test.mjs` | `adoption_report` lists the dated records by stem rather than reporting none | none | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `record_id` and the reference rule in `plugin/lib/record.py` |
| 2 — something selects it | `adr-retire-check` calls them at every id site, and adr-lint imports the regexes; S7's mutants remove each use |
| 3 — the caller can discover it | the archive template and the `adr-retire` skill name both spellings |
| 4 — it is used | the tests run `adr-retire-check` and `facts-gate-dispatch.sh` themselves on each fixture |

## Mutation Log

## Invariants

- Every existing `adr-retire-check` and adr-lint test passes unchanged, `tests/gate-rules.test.mjs:1604-1607` and `tests/gate-regressions.py:1080-1087` included.
- No number is ever parsed from a date-shaped name.
- A row, receipt or supersession that resolves to no record is still refused.
- A stem that is both active and archived is still refused as a duplicate (`adr-retire-check:509-512`).

## Risks

- The content test admits a file the glob did not, such as a research note carrying a Status line and a `## Context`. The fixtures carry one; if it is admitted, that is a finding to take to the owner, not a test to weaken.

## Stop Condition

Stop and ask if any existing numbered or `NNN-slug` test changes its output. That breaks ADR-063's own failure criterion.

## Out of Scope

- The lifecycle corpus reader, `supersededBy` and `adr-state` (deferred: ADR-063 T2)
- `adr-verify`'s record number (deferred: ADR-063 T3)
- adr-lint's cross-reference enumeration, `adr-next`, `adr-debt`, `corpus-report.mjs`, `facts-gate-dispatch.sh`'s record test (deferred: docs/BACKLOG.md §252)

## Verification Log
- 2026-09-22 · d39cc9e* · exit 1 · `set -o pipefail …` · acceptance-sha256:f4d3a820bdafffa07fe96a886a6a214ca2f5337ad62b1579fb8e1ba35a3907a5 · ms:405 · test-lock-sha256:1d82b6e519660e4ac80e712ea8913f11200dd815ed8a74bb83d3fb131e9839e0 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlY29yZC1pZGVudGl0eS50ZXN0Lm1qcwlhIGRhdGUtc2hhcGVkIG5hbWUgbmV2ZXIgeWllbGRzIGEgcmVjb3JkIG51bWJlcgk2YzRlOWMxYjFjZmZjYzA5MTgzODc3YzM1ZGQ5ZTliMzcyNGMyNDVkZDc3OGNjZmFhNTQwYzg4YWQ0MjFjN2JjCmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgZGF0ZS1zbHVnIGFyY2hpdmUgcGFzc2VzIGFkci1yZXRpcmUtY2hlY2sgd2l0aCBlYWNoIHJlY29yZCBuYW1lZCBieSBpdHMgc3RlbQk4NzU4NGVkMGQ1NDRmNGVlODE3OWRlNjEzYjI2YmE5NWEzZmU2MDczNjU5M2EzNGI5OTE4ZDRkZmIzNDM0YTU4CmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgZmlsZSB3aXRoIG5vIGlkZW50aXR5IGlzIGFkdmljZSwgbm90IGEgZmFpbHVyZQljMWEwYTI3ODhjZmFkYTYwZTQ5YmNkNjExNDBjOTg4M2UzNWMxNjg0ZTQ0M2E3ZmE4OWFlODA2MTczOTYzN2IyCmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgbnVtYmVyZWQgYXJjaGl2ZSByZWFkcyBleGFjdGx5IGFzIGJlZm9yZQlmOTdhMzk2ZTU2MGMxMDM2OTE3NmMyMjEzNGU1YTE3YzgyNjY3Mzc4ZTk1YTJlNWExM2MxOThjOGMzMjc3NDBjCmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgcmVmZXJlbmNlIG5hbWVzIGEgcmVjb3JkIG9ubHkgYXMgYSB3aG9sZSB0b2tlbglkNjc0MjBlMDkwZGQ1ODljY2JhNjg4MDEyNzhmZjY0OTgzZjNlMGY2M2MwMGVjNzAwZWNlZDRkZTRiZGU4MzQ5CmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWEgcm93LCByZWNlaXB0IG9yIHN1cGVyc2Vzc2lvbiB0aGF0IG5hbWVzIG5vIHJlY29yZCBpcyByZWZ1c2VkCTA4MjY2ZTllNGNjMjhiM2E2Yjc4MjViYTNlMTE4YTM1OThlZTNhNmIxYmUzMDY5MmQ2MDU2MmY3MzJjYzA2MWQKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJYWRyLXJldGlyZS1jaGVjayAtLWFkb3B0IHJlYWRzIGEgZGF0ZS1zbHVnIGNvcnB1cwllMzJkYmY5YWNkMmY4N2EyMjA4OGJkYTMzN2EzZTk1YmNkYWY1NTQwNGVmN2YyMzcyM2MyZmQ1OWFkMmUxYmE5CmJvZHkJdGVzdHMvcmVjb3JkLWlkZW50aXR5LnRlc3QubWpzCWFuIE5OTi1zbHVnIGFyY2hpdmUga2VlcHMgaXRzIHJlY29yZCBudW1iZXJzCWNmYjA3ZTQzMzdjYzZlOTZhNTgzYWJkNmQ0YjhlMWNjMzRlMGFjYzYyNGQ1NDQ5YzkzNThkYjUyNDIwZmMxMjgKYm9keQl0ZXN0cy9yZWNvcmQtaWRlbnRpdHkudGVzdC5tanMJdGhlIGFydGlmYWN0IGhvb2sgcGFzc2VzIGEgZGF0ZS1zbHVnIGFyY2hpdmUJNDNiYzA5Yjg1MjhiYzc5YmM5ZTlmNzliNjllZjVhYzA5YTQ3MjM5ZTBlZWE1ZDBkOTgzNTEzZmI0MDM2OGIxNQ
  ```
  --- last 10 line(s) of stdout (of 248 after folding 253 raw)
    ...
  1..9
  # tests 9
  # suites 0
  # pass 1
  # fail 8
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 343.923125
  ```
