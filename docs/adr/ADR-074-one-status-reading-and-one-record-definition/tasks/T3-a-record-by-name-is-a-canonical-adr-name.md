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
- 2026-09-29 · 9625781* · exit 1 · `set -o pipefail …` · acceptance-sha256:b62b7d219898cd731f536a334cdede03afd435eae3f2759008a200e51d948c52 · ms:655 · test-lock-sha256:b7998b75b7e78f793ef90f1d7135c6c50698d2d088c7c51abbd37be5b2c7d5a0 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlY29yZC1ieS1uYW1lLnRlc3QubWpzCWEgZmlsZSBuYW1lZCBhZHI8ZGlnaXQ-IHdpdGhvdXQgcmVjb3JkIGNvbnRlbnQgaXMgbm90IGEgcmVjb3JkLCBhbmQgYSBjYW5vbmljYWwgQURSLTxuPiBuYW1lIHN0aWxsIGlzCTZjNmZmM2QzN2UwNmJmZGQ5ZTUwMGVjODQ2M2RiYWU2N2MzOWNlOWM2MDI5NjdjZWM1MjA0MzNlNjZjYWRiYTc
  ```
  --- last 1 line(s) of stdout
  0
  --- last 10 line(s) of stderr (of 41 after folding 41 raw)
    ...
  1..1
  # tests 1
  # suites 0
  # pass 0
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 553.515083
  ```
- 2026-09-29 · cb39b90 · exit 0 · `set -o pipefail …` · acceptance-sha256:b62b7d219898cd731f536a334cdede03afd435eae3f2759008a200e51d948c52 · ms:611
- 2026-09-29 · cb39b90* · exit 0 · `set -o pipefail …` · acceptance-sha256:b62b7d219898cd731f536a334cdede03afd435eae3f2759008a200e51d948c52 · ms:592
- 2026-09-29 · cb39b90* · exit 0 · `set -o pipefail …` · acceptance-sha256:b62b7d219898cd731f536a334cdede03afd435eae3f2759008a200e51d948c52 · ms:566

## Mutation Log
- 2026-09-29 · cb39b90 · mutant killed · exit 1 · `plugin/bin/adr-lint` · the old adr[-_]?\d name arm back: adr018-sweep.md and the Codex review are linted as records again · acceptance-sha256:b62b7d219898cd731f536a334cdede03afd435eae3f2759008a200e51d948c52 · covers:a file named adr<digit> without record content is not a record, and a canonical ADR-<n> name still is
- 2026-09-29 · cb39b90* · mutant killed · exit 1 · `plugin/bin/adr-lint` · the content arm dropped: adr012-x.md with a Status and ## Context is not-recognised · acceptance-sha256:b62b7d219898cd731f536a334cdede03afd435eae3f2759008a200e51d948c52
- 2026-09-29 · cb39b90* · mutant killed · exit 1 · `plugin/bin/adr-lint` · the content arm admitting a Status alone: a backlog with a ## Status section is linted as a record (§141) · acceptance-sha256:b62b7d219898cd731f536a334cdede03afd435eae3f2759008a200e51d948c52
