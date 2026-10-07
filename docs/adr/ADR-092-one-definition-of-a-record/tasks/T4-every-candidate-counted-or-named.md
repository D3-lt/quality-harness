# Task ADR-092-T4: every numbered candidate is counted or named, and a failed read is PARTIAL

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** M (work-next.mjs, tests, campaign entries)
**Owner:** unassigned
**Produces:** work-next `notRead` over the candidate set of ADR-092 Decision 9; `partialBecause` reasons for a failed read and for content past the 512 KiB budget
**Consumes:** `adrCorpus` selection and `notRecognised` (T3); `tests/fixtures/record-recognition.json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the candidate rule`, `the failed-read reason`, `the budget reason`, `the regular-file guard`

## Goal

Every numbered candidate (ADR-092 Decision 9) is counted by a reader, held undecided, or named in `notRead` (finding 8); a candidate whose read failed is named in `partialBecause` and makes the look PARTIAL (finding 9); a candidate's content is read whole up to 512 KiB, so a Status past ADR-087's 64 KiB head is read and only content past 512 KiB is could-not-look (finding 10).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/work-next.mjs` | edit | `notReadFiles` takes the candidate rule over eligible paths: a record directory or a letter prefix decides by path, otherwise any Status form decides by content; `headOf` becomes a regular-file read of up to 512 KiB (the corpus reader's budget, lifecycle.mjs:2735) that says when it stopped short; its failures are returned, not dropped (work-next.mjs:222); `observe` folds them into `look` and `partialBecause` (work-next.mjs:657-662) with one reason per kind; the comment at work-next.mjs:180-187 and the 64 KiB reason at :662 change with it |
| `tests/record-naming.test.mjs` | add | this task's six tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's six tests and record the red run (TDD red): today `Final/RFC0001-x.md` holding `# A note`, a numbered `Status: Final` file with no frontmatter and a headingless `docs/adr/01-x.md` are neither counted nor named; a missing or non-regular candidate is dropped; `---` and 65,536 spaces end with nothing said; a Status after 70 KiB is not read.
2. [S2] Measure on this repository, dated, in this task's prose: how many paths the rule makes candidates, and that `notRead` and `partialBecause` stay empty and `look` ok (51 numbered non-records on 2026-10-07, none a candidate, none over 512 KiB). [proof: human: the executor records the counts and the empty lists in this task's prose]
3. [S3] Apply the candidate rule; return failed reads and over-budget reads and name them.
4. [S4] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac
out=$(node --test --test-reporter=tap tests/record-naming.test.mjs 2>&1) \
  && for t in 'every row of the recognition table reads its approved answer in work-next' 'a numbered file that is no candidate is neither counted nor named' 'a numbered candidate that cannot be read makes the look PARTIAL and is named' 'a candidate past the read budget is PARTIAL and named'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done \
  && for t in 'a FIFO candidate is named and never opened' 'the link rows read their approved answers in work-next'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$win$")" != 1 ]; then exit 1; fi; done
```

On Windows only, the FIFO test may report `# SKIP` (the third test proves the same rule there with a directory), and the link test may when `symlinkSync` is refused.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every row of the recognition table reads its approved answer in work-next` | `tests/record-naming.test.mjs` | rows R2-R36 laid out as one tracked repository: the map row id → work-next's answer (counted, undecided, `notRead`, `partialBecause`, or in no list) deepStrictEquals the table's work-next column, the three finding-8 inputs included | — | S1, S3 |
| `the link rows read their approved answers in work-next` | `tests/record-naming.test.mjs` | row R1 and layouts L1-L4, L7 and L8 give the table's work-next cells exactly; skipped on Windows only if a link cannot be made | — | S1, S3 |
| `a numbered file that is no candidate is neither counted nor named` | `tests/record-naming.test.mjs` | a numbered `notes/01-rule.md` and a dated `docs/specs/2026-10-07-x.md`, neither carrying a Status, and a 67 KiB numbered spec without one, are in no list and `look` is ok, as this repository's 51 are | — | S1, S2, S3 |
| `a numbered candidate that cannot be read makes the look PARTIAL and is named` | `tests/record-naming.test.mjs` | layouts L5 (a directory), L6 and L9 give the table's work-next answers: `Final/RFC0007-x.md` (absent), the directory and the NUL-bearing record are in `partialBecause` with their reasons, `notes/07-gone.md` is in no list, `look` is PARTIAL; runs on every platform | — | S1, S3 |
| `a candidate past the read budget is PARTIAL and named` | `tests/record-naming.test.mjs` | rows R15 and R16 are in `partialBecause` with a reason naming 512 KiB; row R14 (Status after 70 KiB) and row R13 are in `notRead` | — | S1, S3 |
| `a FIFO candidate is named and never opened` | `tests/record-naming.test.mjs` | `Final/RFC0008-x.md` replaced on disk by a FIFO is in `partialBecause` and work-next finishes within the test's bound; skipped on Windows | — | S1, S3 |

The first test's range is R2-R41; layout L10 is in the link test.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests |
| 2 — something selects it | `observe` builds `notRead` and `partialBecause` from `notReadFiles`; mutants dropping the rule or a reason are caught |
| 3 — the caller can discover it | work-next's text line and JSON; corpus-probe carries both |
| 4 — it is used | an outside corpus run after release; nothing measures this yet |

## Mutation Log

## Invariants

- No file is both counted and named, or both in `notRead` and in `partialBecause`.
- This repository's `notRead` and `partialBecause` stay empty and `look` stays ok (bf3aa732 baseline in ADR-092's Context).
- A path whose candidacy needed content and that is absent from the working tree is in no list: absence is an observation of no Status (ADR-092 Decision 9).

## Risks

- A wider candidate rule names files in an adopter's tree that are not records; the rule asks for a Status, a record directory or a letter-prefixed number, and S2 measures it here.

## Stop Condition

Stop and ask if this repository's `notRead` or `partialBecause` is not empty after S3, or if any row's work-next answer differs from ADR-092 Decision 6.

## Out of Scope

- Reading a named file as a record (permanent: boundary: ADR-087 Out of Scope)

## Verification Log
