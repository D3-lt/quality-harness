# Task ADR-092-T6: an archive holding a record the definition admits is named

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S (lifecycle.mjs `unmarkedArchives` and `RECORD_SHAPED`, tests, campaign entries)
**Owner:** unassigned
**Produces:** `unmarkedArchives(root, listing, recognised)` with an optional recognised set; `RECORD_SHAPED` widened to the name arms
**Consumes:** `adrCorpus` selection (T3)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the recognised set`, `the widened name test`

## Goal

An archive-named directory with no Lifecycle marker is named whenever it holds a record the definition admits (ADR-092 Decision 11): through `adrCorpus`, by the counted set; at SessionStart, which opens no file (CLAUDE.md §19), by a name test widened to the name arms.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `RECORD_SHAPED` (lifecycle.mjs:1340) admits `ADR-<n>` at any width and `spec[-_]?` followed by a decimal digit, beside its numbered and dated shapes; `unmarkedArchives` (:1341-1362) takes an optional set of recognised absolute paths and treats a listed path in it like a record-shaped name; `adrCorpus` sets its `unmarkedArchives` property (:2705) after its read loop, with its counted set; the callers at :1814 and :3744 keep two arguments, with a comment saying why they open no file |
| `tests/unmarked-archives.test.mjs` | add | this task's two tests, in a file of their own so T4 and T7 (same wave) never edit it |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's two tests and record the red run (TDD red): today `archive/spec-01-x.md`, `archive/ADR-12345-x.md` and `archive/decision.md` (`**Status:** Accepted`, `## Decision`) under an unmarked `archive/` name nothing.
2. [S2] Widen `RECORD_SHAPED`, add the recognised set, and pass it from `adrCorpus`.
3. [S3] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/unmarked-archives.test.mjs 2>&1) \
  && for t in 'an archive holding a record the definition admits is named by the corpus reader' 'the SessionStart archive test names the name arms and opens no file'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an archive holding a record the definition admits is named by the corpus reader` | `tests/unmarked-archives.test.mjs` | `adrCorpus(...).unmarkedArchives` and work-next's JSON name `archive` for each of the three records; its twin, `archive/notes.md` holding no record, names nothing | — | S1, S2 |
| `the SessionStart archive test names the name arms and opens no file` | `tests/unmarked-archives.test.mjs` | `unmarkedArchives(root, listing)` names `archive` for `spec-01-x.md` and `ADR-12345-x.md`, and not for `decision.md`, with a reader that throws on any open | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `adrCorpus` passes its counted set; a mutant passing none is caught by the first test |
| 3 — the caller can discover it | work-next's `unmarkedArchives` line and JSON, SessionStart's archive advice |
| 4 — it is used | every SessionStart and work-next run; nothing measures this yet |

## Mutation Log

## Invariants

- The SessionStart callers open no file.
- An archive-named directory of notes with no record is not named, as today (lifecycle.mjs:1348-1349).
- This repository's `unmarkedArchives` stays empty.

## Risks

- A content-only record under an unmarked archive is named by work-next and not by SessionStart; the advice at SessionStart is a hint about a directory and the record is counted either way.

## Stop Condition

Stop and ask if this repository's `unmarkedArchives` is not empty after S2.

## Out of Scope

- Opening files at SessionStart to find content-only records (permanent: boundary: CLAUDE.md §19, ADR-092 Decision 11)

## Verification Log
