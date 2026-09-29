# Task ADR-074-T3: adr-lint lints a file as a record for a canonical ADR-<n> name, or for record content

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (adr-lint's guard, one new test file)
**Owner:** unassigned
**Produces:** adr-lint's not-recognised guard by name or content
**Consumes:** `record_status` reading a section (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a file named adr<digit> without record content is not a record, and a canonical ADR-<n> name still is`

## Goal

adr-lint lints a file as a record when its name starts with the canonical `ADR-<n>` token (case-insensitive, hyphen required), or when it has a Status by Decision 1 and a `## Context` or `## Decision` heading. `docs/evaluations/adr018-sweep.md` and `adr004_review_notes_part1_20260101.md`, which have neither, are not-recognised. A real `ADR-018-x.md` without a Status keeps its missing-Status advice. `adr012-x.md` with a Status and `## Context` is linted.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | the not-recognised guard in `main` |
| `tests/record-by-name.test.mjs` | new | the name and content cases |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the test. Its cases are:
   - both reported names;
   - a canonical `ADR-018-x.md` with no Status;
   - `adr012-x.md` with `Status: Accepted` and `## Context`;
   - a backlog with a `## Status` heading and no `## Context` or `## Decision`;
   - a `spec-3.md`.
   See it fail on `adr018-sweep.md` (TDD red).
2. [S2] Narrow the guard's name arm to the canonical token, and add lifecycle's content test as its other arm. Leave the `spec` arm as it is.
3. [S3] Record a mutant per arm with `adr-verify --mutant`: the old `adr[-_]?\d` name arm back, the content arm dropped, the content arm admitting a section alone. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/record-by-name.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - a file named adr<digit> without record content is not a record, and a canonical ADR-<n> name still is'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a file named adr<digit> without record content is not a record, and a canonical ADR-<n> name still is` | `tests/record-by-name.test.mjs` | the reported names are not-recognised; a canonical name, and record content, are linted; a backlog with a Status heading is not | none | S1, S2 |

## Invariants

- ADR-063's identity of a file adr-lint does lint is unchanged.
- A `spec<digit>` name keeps the guard's answer.
- BACKLOG §141 stays closed: a backlog or a README is not linted as a record.

## Risks

- A corpus naming real records `adr012-x.md` with a Status but no `## Context` or `## Decision` loses them from adr-lint; lifecycle's content test does not admit them either.

## Stop Condition

Stop and ask if one of this machine's corpora names its records `adr<digit>` without that content.

## Out of Scope

- lifecycle's corpus reader (permanent: boundary: its content test already requires a Status and one of those headings)

## Verification Log

## Mutation Log
