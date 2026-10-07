# Task ADR-092-T3: lifecycle mirrors the definition, discovers by it, and dedups by it

**Depends-on:** T1, T5
**Covers:** none — no spec
**Estimated scope:** L (lifecycle.mjs discovery, recognition, content screen, dedup and link count; tests; campaign entries)
**Owner:** unassigned
**Produces:** `adrCorpus` with the discovery and counted sets of ADR-092 Decision 5 and an injectable `screenBudget`; `records.notRecognised` for name-discovered paths only, as today; `linksIn(file, limit)` exported and `onceByRealPath(paths, prefer, { linkLimit })`
**Consumes:** `tests/fixtures/record-recognition.json` (T1); the frontmatter-first and code-block fence walk (T5)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the name arms at any width`, `the content screen`, `the screen budget`, `the content-arm narrowings`, `the recognised-spelling preference`, `the per-hop link count`, `placement-led discovery`, `the unfenced screen`, `the one title reading in JS`

## Goal

Every row of the parity table reads its approved adrCorpus answer (ADR-092 Decision 6, undecided rule included), discovery finds every eligible file the definition can admit and counts exactly those it recognises (finding 5, Decision 5), the screen's budget is reported when crossed (second review 11), dedup keeps a name-arm spelling first and counts links hop by hop with one defined precedence (findings 6 and 11; second review 9, Decision 7), and the `templates` and one-line-heading rules read as in Python (second review 4 and 5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `recognisedAsRecord` mirrors `recognised_as_record`: `record_placement`'s fallback, the `templates` rejection on the listed and the placed path ahead of both arms, the `README.md` narrowing, the name arms (`/^ADR-[0-9]+(?![A-Za-z0-9_])/i` and `spec[-_]?` followed by any decimal digit with Python's `re.I` folding, so `ſpec-01` reads as `spec-01`), and `RECORD_SECTION`'s gap as `PY_SPACE` without `\n` and `\r` (lifecycle.mjs:2589-2590); `recordFilesFromListing` builds the discovery set (eligible paths named by `ADR_FILE` or a name arm, under a record directory, or passing the streamed content screen) and skips `README.md` and every path under `templates/`; the screen stops past `screenBudget` (64 MiB by default) and names the first unscreened path as unexamined, PARTIAL; `adrCorpus` counts the recognised members, keeps `notRecognised` for name-discovered paths, holds a recognised record with no known Status as undecided by the rule row, and follows Decision 5 for a failed read; `onceByRealPath(paths, prefer, { linkLimit })` decides the name preference first and compares links only within one name class, passed by `adrCorpus` only; `linksIn(file, limit = 32)` counts every link met, a repeated one each time, and returns `Infinity` when the count reaches the limit; `recordFilesFromListing` also discovers an eligible path whose placed directory (its listed directory's real path, taken once per listed directory) is a record directory (Decision 14); the screen keeps fence state as it streams (Decision 12); `titleLine` (:1975-1978) skips a leading frontmatter block and fenced lines (Decision 13) |
| `tests/record-discovery.test.mjs` | add | this task's eight tests, in a file of their own so T2 (same wave) and this task never edit one test file; it reads T1's table |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's eight tests and record the red run (TDD red): today `docs/adr/ADR-12345-x.md`, `notes/spec-01-x.md` and `notes/decision.md` are not selected, `plugin/templates/adr-template.md` would be counted once selected, `ADR-001-link.md` to a headingless `001-note.md` leaves no record, a two-link path counts as one, and no screen budget exists.
2. [S2] Measure before and after, dated, in this task's prose: how many files `adrCorpus` opens and how many bytes the screen streams, the SessionStart hook's time, and `work-next --json` and `adr-state --json`, each on this repository and on the largest corpus fixture under `tests/fixtures/corpora/`. [proof: human: the executor records both measurements and the diff of the outputs in this task's prose]
3. [S3] Mirror the definition, build the discovery set with its budget, and count by recognition.
4. [S4] Pass the name preference to `onceByRealPath` from `adrCorpus` only, with the precedence of Decision 7.
5. [S5] Count links by resolving each hop, with the limit, and check that BACKLOG §350 C7's link-loop mutant is still RED.
6. [S6] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac
out=$(node --test --test-reporter=tap tests/record-discovery.test.mjs 2>&1) \
  && for t in 'every row of the recognition table reads its approved answer in lifecycle' 'a failed read is never dropped by discovery' 'the content screen stops at its budget and names the first path it did not screen'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done \
  && for t in 'the link rows read their approved answers in lifecycle' 'a recognised spelling wins the dedup over fewer links' 'links are counted by resolving each hop with one precedence at the limit' 'task directories take the per-hop count and no name preference' 'discovery follows placement through a listed link'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$win$")" != 1 ]; then exit 1; fi; done
```

On Windows only, the four link tests may report `# SKIP` when `symlinkSync` is refused (EPERM); every other platform must run them. The three tests that need no link run everywhere.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every row of the recognition table reads its approved answer in lifecycle` | `tests/record-discovery.test.mjs` | rows R2-R36 laid out as one tracked repository: the map row id → adrCorpus's answer (record with its Status, undecided, `notRecognised`, `unreadable`, or in no list) deepStrictEquals the table's adrCorpus column, and every row it counts has the table's `status` | — | S1, S3 |
| `the link rows read their approved answers in lifecycle` | `tests/record-discovery.test.mjs` | row R1 (under a `tasks` ancestor, counted with Accepted) and layouts L7 and L8 give the table's adrCorpus cells; skipped on Windows only if a link cannot be made | — | S1, S3 |
| `a recognised spelling wins the dedup over fewer links` | `tests/record-discovery.test.mjs` | layouts L1, L2 and L3: the kept path, the alias and its `sameAs` deepStrictEqual the table's answers; with `linkLimit` 2, a name-arm spelling reached through three links (`Infinity`) still wins over a one-link non-name spelling, by Decision 7's precedence | — | S1, S4 |
| `links are counted by resolving each hop with one precedence at the limit` | `tests/record-discovery.test.mjs` | layout L4's kept path and `linksIn` values 2 and 1; `linksIn(file, 2)` is 1 over one link and `Infinity` over two and over three; `a/a/file.md` with `a` → `.` counts 2 and loses to a one-link spelling of the same name class; between two `Infinity` spellings of one class the first listed is kept; a cycle is kept and not aliased, as today | — | S1, S5 |
| `task directories take the per-hop count and no name preference` | `tests/record-discovery.test.mjs` | two paths to one `tasks/` directory, through two links and through one, keep the one-link path in `taskDirectories` and in work-next's task list; two paths with as many links keep the first listed | — | S1, S4, S5 |
| `a failed read is never dropped by discovery` | `tests/record-discovery.test.mjs` | layout L5 with a directory named `ADR-005-x.md` and layout L9 (NUL) are `unreadable` and PARTIAL; layout L6's three paths are in no adrCorpus list; a screen candidate `notes/x.md` that is a directory is `unreadable` and PARTIAL | — | S1, S3 |
| `the content screen stops at its budget and names the first path it did not screen` | `tests/record-discovery.test.mjs` | with `screenBudget` set to 1 KiB over three 800-byte non-record notes and `notes/decision.md` (row R8) listed last, the look is PARTIAL, the second note is named as unexamined, and R8 is not counted; with the default budget R8 is counted and the look is ok | — | S1, S3 |
| `discovery follows placement through a listed link` | `tests/record-discovery.test.mjs` | layout L10: only `notes/rule.md` listed, a link to an unlisted `docs/adr/rule.md` holding P and D, is counted under its listed spelling with Accepted through `adrCorpus`, and work-next counts it; today the corpus is empty with `look` ok; skipped on Windows only if the link cannot be made | — | S1, S3 |

The first test's range is R2-R41, rows R37-R41 included: the screen must not admit R37 or R38, and R40's and R41's identity come from `titleLine`.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the eight tests |
| 2 — something selects it | `adrCorpus` calls the discovery, the screen budget, the recognition and the preference; mutants dropping any of them are caught |
| 3 — the caller can discover it | work-next and adr-state counts, `notRead` and `partialBecause` |
| 4 — it is used | every SessionStart and work-next run; nothing measures this yet |

## Mutation Log

## Invariants

- This repository's `work-next --json` and `adr-state --json` are unchanged: at bf3aa732 `look` ok, 91 records, `notRead` 0, `partialBecause` 0, `unmarkedArchives` 0, and ADR-092's Context measured no eligible file here that the wider discovery would add.
- A file whose read failed is never dropped (ADR-092 Decision 5): it is `unreadable` and PARTIAL, except a screen-only path absent from the working tree.
- Two paths of one name class with as many links keep the first listed, so the junction loop of BACKLOG §350 C7 reads as before.

## Risks

- Streaming every eligible `.md` on a large tree; the budget bounds it, S2 measures it and the Stop Condition stops on it.

## Stop Condition

Stop and ask if S2 finds this repository's counts move at all, if the SessionStart hook's time grows by more than a quarter on this repository or on the largest corpus fixture, or if any row's adrCorpus answer differs from ADR-092 Decision 6 after S5.

## Out of Scope

- Naming the files no reader counts (T4), the archive heuristic (T6), status reading (T5)

## Verification Log
