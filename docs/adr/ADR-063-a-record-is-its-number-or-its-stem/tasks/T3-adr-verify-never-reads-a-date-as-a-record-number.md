# Task ADR-063-T3: adr-verify never reads a date as a record number

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one function)
**Owner:** unassigned
**Produces:** none
**Consumes:** `record_id` in `plugin/lib/record.py` and the identity table in `tests/record-identity.test.mjs` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the shared record_id in record_number_of`, `the owning record file by its full name`

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
| `adr-verify reads no record number from a date in any separator` | `tests/record-identity.test.mjs` | With `strictFrom` set to 2100, above 2026, a task of a record named `2026-07-15-x`, `2026_07_15_x` or `2026.07.15.x` is not marked `[strictFrom]` in `adr-verify`'s output (today it is, as record 2026, so the test is red before the fix); a task of `012-x` still is; and a task of `ADR-004-x` whose record file `ADR-004-x.md` carries `# ADR-004` still is | none | S1, S2 |

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
