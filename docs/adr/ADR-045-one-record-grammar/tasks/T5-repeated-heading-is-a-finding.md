# Task ADR-045-T5: A repeated `## ` heading is a finding, never resolved in silence

**Depends-on:** T1
**Covers:** F-6, UC6-S1, UC6-S2
**Estimated scope:** S (one function in the lib; one check in adr-lint; one refusal in adr-verify; one test)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`record.repeated_headings(text)` names every `## ` heading that appears more than once outside a fence, from the same walk `sections_of` uses. adr-lint blocks a repeated `## Acceptance` in a task (two fences, one digest — the severity of the no-fence check) and advises any other repeat in a task or an ADR (the severity of a missing section). adr-verify refuses to run or write against a task with any repeated heading (exit 2, authoring). `sections_of` and `section_span` keep the LAST occurrence — documented, identical in every gate — so until the record is fixed nothing disagrees, and the report is what makes the ambiguity visible.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `repeated_headings`; `sections_of` docstring states last-wins and points here |
| `plugin/bin/adr-lint` | edit | `check_repeated_headings` called from `check_task` (Acceptance blocks) and `check_adr` (advice) |
| `plugin/bin/adr-verify` | edit | refuse a task with a repeated heading before anything runs or is written |
| `tests/evidence-chain.test.mjs` | edit | duplicate Acceptance: refused and blocked; duplicate Risks and ADR Context: advice; clean fixture: silent |
| `tests/gates.test.mjs` | edit | `repeated_headings` on its own: a real repeat named, a fenced one not |
| `tests/mutations.json` | edit | `repeated_headings` emptied; adr-lint's block demoted; ADR check removed; adr-verify's refusal removed |

## Ordered Steps

1. [S1] Bind the failing test: two `## Acceptance` sections refused by adr-verify and blocked by adr-lint; two `## Risks` advised; clean fixture silent. [proof: acceptance]
2. [S2] Add `repeated_headings`; the adr-lint check; the adr-verify refusal. [proof: acceptance]
3. [S3] Add the catalogue entries; run each with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a repeated ## Acceptance is refused' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a repeated ## Acceptance is refused by adr-verify and blocked by adr-lint; another repeat is advice` | `tests/evidence-chain.test.mjs` | exit 2 and no entry from the writer; a blocking line from the verifier; advice for Risks and for an ADR's Context; nothing on the clean fixture | F-6, UC6-S1, UC6-S2 | S1, S2 |
| `record.py: the opener is bash, sh or shell; a repeated heading is named; a span is where the reader reads` | `tests/gates.test.mjs` | `['A']` for a real repeat, `[]` when the second `## A` is fenced; `sections_of` and `section_span` agree on the last | F-6 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `repeated_headings` is in `record.__all__` |
| 2 — something selects it | `check_repeated_headings` in adr-lint; the preflight in adr-verify's `main` |
| 3 — the caller can discover it | the finding names the heading and says which occurrence the gates read |
| 4 — it is used | both CLIs report a duplicate the fixture never had before |

## Mutation Log

- 2026-09-11 · 9942edb* · mutant killed · exit 1 · `plugin/lib/record.py` · with repeated_headings answering nothing, adr-verify records against the second Acceptance, adr-lint passes the task with two of them, and the record.py probe sees no repeat · acceptance-sha256:0e14f1babbd9d1f4f6a620072768e8895eee336119fd0f6808d854a80620e6a0

## Invariants

- `sections_of(text)` and `section_span(text, h)` select the same occurrence of `h`.
- A `## ` line inside a fence is never counted as a repeat.
- Only `## Acceptance` blocks; every other repeat is `errors.advise` (CLAUDE.md §3).
- The shipped corpus has no repeated heading: enumerated 2026-09-11 with `repeated_headings` over `git ls-files docs/adr docs/specs tests/fixtures` (209 files, none).

## Risks

- An adopting corpus with a task carrying two `## Acceptance` sections goes from silently-last-wins to blocked; the message names the fix (merge them).

## Stop Condition

A green run while a task with two `## Acceptance` sections passes adr-lint or is recorded by adr-verify.

## Out of Scope

- Merging or choosing between duplicate sections for the author (permanent: boundary: a tool that resolves an ambiguous record has decided what the author meant)
- Blocking a repeated heading other than Acceptance (permanent: boundary: no digest hangs on it; a missing section is advice, so a doubled one is too)

## Notes

Design: one walk (`record._sections`) feeds `sections_of`, `section_span` and `repeated_headings`, so a reader, a writer and the report cannot select different bodies. Raising on a duplicate was rejected: seven gates would each need a handler, and a linter that dies on a malformed record has stopped linting. First-wins was rejected: it changes the body every gate reads today for no gain once the repeat is reported.

## Verification Log
- 2026-09-11 · 9942edb* · exit 0 · `node --test --test-name-pattern 'a repeated ## Acceptance is refused' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash' tests/gates.test.mjs` · acceptance-sha256:0e14f1babbd9d1f4f6a620072768e8895eee336119fd0f6808d854a80620e6a0 · ms:501
- 2026-09-11 · 9942edb* · exit 0 · `node --test --test-name-pattern 'a repeated ## Acceptance is refused' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash' tests/gates.test.mjs` · acceptance-sha256:0e14f1babbd9d1f4f6a620072768e8895eee336119fd0f6808d854a80620e6a0 · ms:482
