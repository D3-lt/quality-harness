# Task ADR-074-T2: A Status section is read by every reader, and an inline Status wins with advice

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (record.py, adr-lint, adr-next, lifecycle, one new test file)
**Owner:** unassigned
**Produces:** `record_status` reading a `## Status` section
**Consumes:** `record_status(text)` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a Status section is read, and an inline Status wins with advice when they disagree`

## Goal

A record that keeps its status in a level-2 `## Status` section outside a code fence, with no inline line, is read the same by lifecycle, adr-next and adr-lint: the section's first non-empty line, with T1's markup and kind rules. When a record has both and they give different kinds, the inline line wins and adr-lint advises.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `record_status` falls back to the section, through ADR-045's fence-aware `sections_of` |
| `plugin/bin/adr-lint` | edit | the disagreement advice |
| `plugin/bin/adr-next` | edit | `owning_record` reads the section through record.py |
| `plugin/scripts/lifecycle.mjs` | edit | `markdownSection` for Status: level 2 only, outside a fence; the section line's markup removed as the inline value's is |
| `tests/status-section.test.mjs` | new | the section cases |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the test. It has records with a section only, both agreeing, both disagreeing, a section inside a code fence, a `### Status` heading, and neither. See it fail on the section-only record in adr-lint (TDD red).
2. [S2] Read the section in `record_status`, returning source `section`. Make lifecycle's reading fence-aware and level-2. adr-lint advises on a disagreement.
3. [S3] Record a mutant per rule with `adr-verify --mutant`: the section ignored, the section winning over inline, a fenced heading read, the conflict silent. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/status-section.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - a Status section is read, and an inline Status wins with advice when they disagree'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a Status section is read, and an inline Status wins with advice when they disagree` | `tests/status-section.test.mjs` | lifecycle, adr-next and adr-lint read the section alike, ignore a fenced or level-3 heading, and inline wins | none | S1, S2 |

## Invariants

- A record with an inline Status reads exactly as after T1.

## Risks

- lifecycle's fence handling is its own code, not ADR-045's; the fenced-heading row pins the two to one answer.

## Stop Condition

Stop and ask if a record in this repository's corpus reads a different Status after the change.

## Out of Scope

- A multi-line section read as one value (permanent: boundary: the owner chose the first non-empty line, 2026-09-29)

## Verification Log

## Mutation Log
