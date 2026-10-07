# Task ADR-092-T1: one Python definition of a record, its eligibility rule, and the parity table

**Depends-on:** T5
**Covers:** none — no spec
**Estimated scope:** M (record.py, adr-lint, one fixture, one new test file, gates.test.mjs, campaign entries)
**Owner:** unassigned
**Produces:** `recognised_as_record(path, text, root)`, `record_placement(path, root)`, `corpus_eligible(relative)` and `UNINTERESTING_DIRECTORY` in `plugin/lib/record.py`; `_RECORD_SECTION` matching a heading on one line; the parity table `tests/fixtures/record-recognition.json`
**Consumes:** the frontmatter-first and code-block fence walk (T5)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the canonical-name arm`, `the content arm`, `the placement fallback`, `the templates exclusion`, `the eligibility rule`, `the one-line heading`, `the unfenced discriminators`, `the one title reading`

## Goal

`record.py` holds the one definition adr-lint uses for its verdict and its not-recognised message (ADR-092 Decision 1), with one placement rule however a path is spelled (finding 1, Decision 2), the `templates` exclusion asked of the listed and the placed path (second review 5), a heading read on one line (second review 4), and one eligibility rule for corpus walks (Decision 3); the table holds every approved answer of Decision 6, the undecided rule included, and this task asserts its `recognised`, `status` and `identity` columns.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | add `record_placement`, `recognised_as_record` (rejecting a path with a `templates` directory on its listed or its placed path before either arm, and no `README.md` by content), `corpus_eligible` (excluding `templates` too) and `UNINTERESTING_DIRECTORY` (the pattern of `plugin/scripts/uninteresting.mjs`, with a comment naming it); `_RECORD_SECTION`'s gap after `##` becomes whitespace other than `\r` and `\n` (record.py:525); built from `record_status`, `_RECORD_SECTION`, `_NUMBERED_REF`, `_RECORD_DIRECTORY` and `git_root`; export all four; the content arm's `**Status:**` and heading are read from the unfenced lines of the whole document (Decision 12); `title_line` (record.py:631-636) skips a leading frontmatter block and fenced lines (Decision 13) |
| `plugin/bin/adr-lint` | edit | its main's recognition branch (adr-lint:6498-6510) and `_not_recognised_because` call the definition, and the message names a `templates` directory or a `README.md` when that is what kept the file out; the comment at adr-lint:6481-6497, which says the ADR template is linted for its placeholders and that a file NAMED `ADR-<n>` keeps its findings whatever it contains, is rewritten to say a template is never linted as a record, whatever its name; no copy of the rule is left there; `_record_title` (adr-lint:4197-4214) is replaced by record.py's `title_line`, and `adr_numbers` (:6340-6348) reads its title number through it (Decision 13) |
| `tests/fixtures/record-recognition.json` | add | the parity table: rows R1-R36, layouts L1-L9 and the undecided rule of ADR-092 Decision 6, each row a row id, its files (path, text or a generated-text spec such as `{"repeat": "filler\n", "bytes": 614400, "then": "Status: Final\n"}`, an optional link target, an optional `notRegular`, `absent` or `nul` marker), and every column's approved answer, `undecided` cells resolved through the rule row |
| `tests/record-recognition.test.mjs` | add | this task's six tests |
| `tests/gates.test.mjs` | edit | the two assertions that adr-lint exits 1 on `templates/adr-template.md` (tests/gates.test.mjs:93 and :1300) become exit 2, each with a twin beside it running adr-lint on a copy of the template outside a `templates` directory and expecting exit 1 (test-locks found no lock on this file, 2026-10-07) |
| `tests/mutations.json` | edit | one entry per Rests-on name (or the per-source file under `tests/mutations/` once ADR-091 T3 has landed) |

## Ordered Steps

1. [S1] Write the table whole, with every answer ADR-092 Decision 6 approves, and this task's six tests, and record the red run (TDD red): before the work the Python half has no function to call, so every test fails.
2. [S2] Measure, dated, in this task's prose, which tracked `.md` files in this repository and in `tests/fixtures/` change their `_RECORD_SECTION` answer when the heading's gap stops crossing a line break; stop if any does. [proof: human: the executor records the command, the count and each file it names]
3. [S3] Add `record_placement(path, root)`: the real path relative to the real root; when it leaves the root, the path as listed relative to the root; with no root, the path's own components. Lower-cased directory parts, as adr-lint lowers them.
4. [S4] Add `recognised_as_record(path, text, root)` returning `(recognised, status_value, kept, arm)`: first, not a record when the listed path or the placed path has a `templates` directory; then the canonical arm `_NUMBERED_REF.match(name)`, the spec arm `spec[-_]?\d` under `re.I`, else a Status, a one-line `_RECORD_SECTION` heading, a name other than `README.md`, and a line-start `**Status:**` or `kept`.
5. [S5] Add `corpus_eligible(relative)`: `.md` in any case, not `README.md` in any case, no `tasks`, `templates` or `UNINTERESTING_DIRECTORY` component.
6. [S6] adr-lint's main and `_not_recognised_because` call the definition, so the verdict and the message read the same values; change the two gates.test.mjs assertions and add their twins.
7. [S7] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac
out=$(node --test --test-reporter=tap tests/record-recognition.test.mjs 2>&1) \
  && for t in 'every row of the recognition table reads its approved answer in record.py and adr-lint' 'a templates directory admits no record by either arm and the same file outside it is judged as any other' 'corpus eligibility is one rule in record.py' 'a fenced example is not a discriminator' 'one title reading decides identity and adr-lint finds no false mismatch'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done \
  && for t in 'the link rows read their approved answers in record.py and adr-lint'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$win$")" != 1 ]; then exit 1; fi; done
```

On Windows only, the link test may report `# SKIP` when `symlinkSync` is refused (EPERM); every other platform must run it. The other three tests run everywhere.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every row of the recognition table reads its approved answer in record.py and adr-lint` | `tests/record-recognition.test.mjs` | for rows R2-R36, laid out in a fresh repository, the maps row id → `recognised_as_record`'s answer, row id → adr-lint's verdict (recognised, or `not-recognised` at exit 2), row id → `record_status`'s value and row id → `record_id`'s answer each `deepStrictEqual` the table's `recognised`, `status` and `identity` columns; R34 (`##` and `Decision` on two lines) is not recognised | — | S1, S2, S4, S6 |
| `the link rows read their approved answers in record.py and adr-lint` | `tests/record-recognition.test.mjs` | row R1 (a repository under a `tasks` directory, `adr/001-link.md` linking outside it, adr-lint called with the relative and the absolute path) and layouts L7 and L8 (a `templates/` link to a record, and a link to a file under `templates/`) give the approved answers in both readers; skipped on Windows only if a link cannot be made | — | S1, S3, S4, S6 |
| `a templates directory admits no record by either arm and the same file outside it is judged as any other` | `tests/record-recognition.test.mjs` | rows R27 and R29 are not recognised in either reader, and R28 is; adr-lint exits 2 on R27 and on R29, and 1 on R28's placeholders; a copy of R29's text at `docs/adr/ADR-001-x.md` is recognised | — | S1, S4, S6 |
| `corpus eligibility is one rule in record.py` | `tests/record-recognition.test.mjs` | `corpus_eligible` over every row path deepStrictEquals the table's eligibility (false for R27, R29, R30, R32, R33; true for R31 `.MD` and the rest) | — | S1, S5 |
| `a fenced example is not a discriminator` | `tests/record-recognition.test.mjs` | rows R37 and R38 (the bold label or the heading only inside a fence) are not recognised by `recognised_as_record` or adr-lint, and R39 (both outside, an example inside) is; today adr-lint recognises R37 and R38 | — | S1, S4, S6 |
| `one title reading decides identity and adr-lint finds no false mismatch` | `tests/record-recognition.test.mjs` | rows R40 (a YAML comment `# ADR-999`) and R41 (a fenced `# ADR-998`) give `record_id` ADR-040 and ADR-041, and adr-lint reports no filename/title mismatch on either; today R40 is ADR-999 and adr-lint reports 1 against 999 | — | S1, S4, S6 |

The first test's range is R2-R41, rows R37-R41 included (ADR-092's third review); layout L10 is in the link test.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | adr-lint's main calls the definition; a mutant that restores its own copy of the content arm, drops the `templates` check on either path, or restores `\s+` in `_RECORD_SECTION` is caught by the first three tests |
| 3 — the caller can discover it | adr-lint's verdict and its not-recognised message |
| 4 — it is used | every adr-lint run; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 44450d7d* · mutant killed · exit 1 · `plugin/lib/record.py` · the content arm admits nothing, so a record kept by content is not one · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · covers:the content arm
- 2026-10-07 · 44450d7d* · mutant killed · exit 1 · `plugin/lib/record.py` · a file named ADR-<n> is a record only by its content · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · covers:the canonical-name arm
- 2026-10-07 · 44450d7d* · mutant killed · exit 1 · `plugin/lib/record.py` · a link leaving the repository is placed by its spelling, and an absolute one sees the repository's own tasks ancestor · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · covers:the placement fallback
- 2026-10-07 · 44450d7d* · mutant killed · exit 1 · `plugin/lib/record.py` · a file under templates/ is judged by its name and content like any other · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · covers:the templates exclusion
- 2026-10-07 · 44450d7d* · mutant killed · exit 1 · `plugin/lib/record.py` · a fixture tree is eligible for a corpus walk · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · covers:the eligibility rule
- 2026-10-07 · 44450d7d* · mutant killed · exit 1 · `plugin/lib/record.py` · a record heading is read from the raw text with a gap that crosses a line break · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · covers:the one-line heading
- 2026-10-07 · 44450d7d* · mutant killed · exit 1 · `plugin/lib/record.py` · a fenced example of a record supplies the bold Status and the heading · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · covers:the unfenced discriminators
- 2026-10-07 · 44450d7d* · mutant killed · exit 1 · `plugin/bin/adr-lint` · adr-lint reads its title number from any heading line, a YAML comment included · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · covers:the one title reading

## Invariants

- adr-lint's verdict is unchanged for every file whose path is spelled relative to the repository and whose real path stays inside it, except a file under a `templates` directory (by either arm), a content-only file named `README.md`, and a file whose only record heading is split across two lines, which become not-recognised (ADR-092 Decision 1); of this repository's tracked files, only plugin/templates/adr-template.md changes (measured 2026-10-07 for the first two; S2 measures the third).
- A file named `ADR-<n>` or `spec-<n>` is recognised whatever its content and wherever it sits, except with a `templates` directory on its listed or placed path (row R29, layouts L7 and L8).
- The not-recognised message names what the file lacks, as today, and names the `templates` directory or the `README.md` name when that is the reason.

## Risks

- `git_root` spawns `git` when no `.git` is found on the way up; the definition takes the root from its caller, so a caller walking a directory computes it once.
- A mutation-catalogue entry that relies on adr-lint exiting 1 on the bundled template: S7 runs the entries that name tests/gates.test.mjs:93 or :1300.
- S2, measured 2026-10-07 at 44450d7d: `mrw read --grep '^##[ \t]*\r?$' .` over every file git does not ignore (tests/fixtures/ included) found no line holding `##` alone, so no tracked file changes its `_RECORD_SECTION` answer when the heading's gap stops crossing a line break; the control `mrw read --grep '^##\s+Decision' docs/adr` found 85 files, so the search was able to find a hit. S7 ran the four entries naming the edited tests/gates.test.mjs tests (`severity: a placeholder still blocks`, `severity: postmortem frontmatter is identity`, `severity: an arch placeholder still blocks`, `strictFrom: demotes, and only downward`): all RED.
- The definition moved fourteen catalogue entries' code (adr-lint's recognition branch and `_record_title` into record.py); each was repointed to the same mechanism at its new site and re-run RED. One, `ADR-074 T3 (owner, after): a note under tasks/ reads as a record`, went GREEN because the record's-own-directory rule (ADR-092 Decision 1's amendment, row R45) also covers `ADR-001-x/tasks/`; row R47 (`docs/adr/tasks/note.md`) was added and the entry now runs this task's first test too, RED.
- The table carries rows R42-R47 beyond the record's first draft, added the same day before any assertion (ADR-092 Decision 6): R42-R46 from outside probe runs, R47 above. The T1 implementation was written before the red run and set aside for it: the red entry was taken on a tree without it.

## Stop Condition

Stop and ask if any row's `recognised`, `status` or `identity` answer differs from ADR-092 Decision 6 after S6, or if S2 finds a tracked file whose recognition the one-line heading changes. The table records approved answers; a row that reads otherwise is a new decision, not a fixture to edit.

## Out of Scope

- The Python callers other than adr-lint (T2), the JS mirror (T3), naming (T4), the archive heuristic (T6), the other walks (T7)

## Verification Log
- 2026-10-07 · 44450d7d* · exit 1 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:596 · test-lock-sha256:410a7b29987834d81fc20a07ec20cd67f2132efb604ba72b2881cd2a45451db2 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVjb3JkLXJlY29nbml0aW9uLnRlc3QubWpzCWEgZmVuY2VkIGV4YW1wbGUgaXMgbm90IGEgZGlzY3JpbWluYXRvcgk3ZDAzMjk0YmZkNWExNTY2YzcxNDc5MzhlNDY0NDI0NTc1YWVlZDJlMzM5YjU5Y2ZhNmE3YTFlNWUxZWJhMjExCmJvZHkJdGVzdHMvcmVjb3JkLXJlY29nbml0aW9uLnRlc3QubWpzCWEgdGVtcGxhdGVzIGRpcmVjdG9yeSBhZG1pdHMgbm8gcmVjb3JkIGJ5IGVpdGhlciBhcm0gYW5kIHRoZSBzYW1lIGZpbGUgb3V0c2lkZSBpdCBpcyBqdWRnZWQgYXMgYW55IG90aGVyCWE5NWJlMjQwMDYzZDFhNGU3MWJiYjkwNzQzODgwYTMzM2Q4Mzc1ZjkwNzQwODc3ZjY4ZTczYzRmYTA4YzIzNzkKYm9keQl0ZXN0cy9yZWNvcmQtcmVjb2duaXRpb24udGVzdC5tanMJY29ycHVzIGVsaWdpYmlsaXR5IGlzIG9uZSBydWxlIGluIHJlY29yZC5weQk5OGRiZGFiZGNhODAyOWY5MzhlMDhjNGY4ZTQzODg0NTI3ZmI4NDkyODk0YWM0MWMyMGU0ZGZjZjA5Y2M4YzI3CmJvZHkJdGVzdHMvcmVjb3JkLXJlY29nbml0aW9uLnRlc3QubWpzCWV2ZXJ5IHJvdyBvZiB0aGUgcmVjb2duaXRpb24gdGFibGUgcmVhZHMgaXRzIGFwcHJvdmVkIGFuc3dlciBpbiByZWNvcmQucHkgYW5kIGFkci1saW50CTk5ZmI4MDI4NThiZGUyYWI3OTVlZmM5YTFkMjIxMzI0MzcyZWYzMjU4MWU5YmJmNTFkM2RkYzgxMWY5OWJmMGMKYm9keQl0ZXN0cy9yZWNvcmQtcmVjb2duaXRpb24udGVzdC5tanMJb25lIHRpdGxlIHJlYWRpbmcgZGVjaWRlcyBpZGVudGl0eSBhbmQgYWRyLWxpbnQgZmluZHMgbm8gZmFsc2UgbWlzbWF0Y2gJMWQ4OWUzOThmYzJjOGI3Njg4YTk4YTc0YmZjMzhlNDQ4MGYyNWQ4MDFjOTBlZTIyNTViZDljNWJlNDY5ZTE0Mgpib2R5CXRlc3RzL3JlY29yZC1yZWNvZ25pdGlvbi50ZXN0Lm1qcwl0aGUgbGluayByb3dzIHJlYWQgdGhlaXIgYXBwcm92ZWQgYW5zd2VycyBpbiByZWNvcmQucHkgYW5kIGFkci1saW50CTFmYjEzNmM3MTY0OWE5ZjlhY2ZmZWIzMTBlNzk4NmEzMjFmNmM2YmY3MDc5NzRkZmJkNzdjNzFlMmEyOTY4OTM
  ```
  ```
- 2026-10-07 · 44450d7d* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:5309
- 2026-10-07 · 44450d7d* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:5278
- 2026-10-07 · 44450d7d* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:5393
- 2026-10-07 · 44450d7d* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:5424
- 2026-10-07 · 44450d7d* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:5304
- 2026-10-07 · 44450d7d* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:5292
- 2026-10-07 · 44450d7d* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:6278
- 2026-10-07 · 44450d7d* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:999a205de2d4411c095beffb7872053af5dcf914df2f0a21defd55f5b6f9227a · ms:5690
- 2026-10-07 · human-observed · observed by the executor (Claude, 2026-10-07): S2's command, its zero count and its control are recorded in this task's Risks
