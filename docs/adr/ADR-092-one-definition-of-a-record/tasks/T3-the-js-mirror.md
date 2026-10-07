# Task ADR-092-T3: lifecycle mirrors the definition, discovers by it, and dedups by it

**Depends-on:** T1, T5
**Covers:** none — no spec
**Estimated scope:** L (lifecycle.mjs discovery, recognition, content screen, dedup and link count; tests; campaign entries)
**Owner:** unassigned
**Produces:** `adrCorpus` with the discovery and counted sets of ADR-092 Decision 5; `records.notRecognised` for name-discovered paths only, as today; `linksIn(file, limit)` exported
**Consumes:** `tests/fixtures/record-recognition.json` (T1); the frontmatter-first and code-block fence walk (T5)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the name arms at any width`, `the content screen`, `the content-arm narrowings`, `the recognised-spelling preference`, `the per-hop link count`

## Goal

Every row of the parity table reads its approved adrCorpus answer (ADR-092 Decision 6), discovery finds every eligible file the definition can admit and counts exactly those it recognises (finding 5, Decision 5), dedup keeps a name-arm spelling first (finding 6, Decision 7), and links are counted hop by hop with a defined limit (finding 11).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `recognisedAsRecord` mirrors `recognised_as_record`: `record_placement`'s fallback, the `templates` rejection ahead of both arms, the `README.md` narrowing, and the name arms (`/^ADR-[0-9]+(?![A-Za-z0-9_])/i` and `spec[-_]?` followed by any decimal digit with Python's `re.I` folding, so `ſpec-01` reads as `spec-01`); `recordFilesFromListing` builds the discovery set (eligible paths named by `ADR_FILE` or a name arm, under a record directory, or passing the streamed content screen) and skips `README.md` and every path under `templates/`, so `plugin/templates/ADR-001-x.md` is neither counted nor in `notRecognised`; `adrCorpus` counts the recognised members, keeps `notRecognised` for name-discovered paths, and follows Decision 5 for a failed read; `onceByRealPath(paths, prefer)` takes an optional preference passed by `adrCorpus` only; `linksIn(file, limit = 32)` resolves each hop and returns `Infinity` at the limit or on a repeated link, and is exported |
| `tests/record-discovery.test.mjs` | add | this task's six tests, in a file of their own so T2 (same wave) and this task never edit one test file; it reads T1's table |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's six tests and record the red run (TDD red): today `docs/adr/ADR-12345-x.md`, `notes/spec-01-x.md` and `notes/decision.md` are not selected, `plugin/templates/adr-template.md` would be counted once selected, `ADR-001-link.md` to a headingless `001-note.md` leaves no record, and a two-link path counts as one.
2. [S2] Measure before and after, dated, in this task's prose: how many files `adrCorpus` opens and how many bytes the screen streams, on this repository and on each corpus fixture, the time of this repository's SessionStart hook, and this repository's `work-next --json` and `adr-state --json`. [proof: human: the executor records both measurements and the diff of the two outputs in this task's prose]
3. [S3] Mirror the definition, build the discovery set, and count by recognition.
4. [S4] Pass the name preference to `onceByRealPath` from `adrCorpus` only: a spelling a name arm recognises, then fewer links, then the first listed.
5. [S5] Count links by resolving each hop, with the limit and the repeated-link rule, and check that BACKLOG §350 C7's link-loop mutant is still RED.
6. [S6] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac
out=$(node --test --test-reporter=tap tests/record-discovery.test.mjs 2>&1) \
  && for t in 'every row of the recognition table reads its approved answer in lifecycle' 'a failed read is never dropped by discovery'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done \
  && for t in 'a link out of the repository reads its approved answer in lifecycle' 'a recognised spelling wins the dedup over fewer links' 'links are counted by resolving each hop and an unbounded chain loses' 'task directories take the per-hop count and no name preference'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$win$")" != 1 ]; then exit 1; fi; done
```

On Windows only, the four link tests may report `# SKIP` when `symlinkSync` is refused (EPERM); every other platform must run them. The two tests that need no link run everywhere.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every row of the recognition table reads its approved answer in lifecycle` | `tests/record-discovery.test.mjs` | rows R2-R33 laid out as one tracked repository: the map row id → adrCorpus's answer (record with its Status, `notRecognised`, `unreadable`, or in no list) deepStrictEquals the table's adrCorpus column, and every row it counts has the table's `status` | — | S1, S3 |
| `a link out of the repository reads its approved answer in lifecycle` | `tests/record-discovery.test.mjs` | row R1, under a `tasks` ancestor, is counted with Accepted; skipped on Windows only if the link cannot be made | — | S1, S3 |
| `a recognised spelling wins the dedup over fewer links` | `tests/record-discovery.test.mjs` | layouts L1, L2 and L3: the kept path, the alias and its `sameAs` deepStrictEqual the table's answers | — | S1, S4 |
| `links are counted by resolving each hop and an unbounded chain loses` | `tests/record-discovery.test.mjs` | layout L4's kept path and `linksIn` values 2 and 1; `linksIn(file, 2)` over a three-link chain is `Infinity` and that path loses to a one-link path; a cycle is kept and not aliased, as today | — | S1, S5 |
| `task directories take the per-hop count and no name preference` | `tests/record-discovery.test.mjs` | two paths to one `tasks/` directory, through two links and through one, keep the one-link path in `taskDirectories` and in work-next's task list; two paths with as many links keep the first listed | — | S1, S4, S5 |
| `a failed read is never dropped by discovery` | `tests/record-discovery.test.mjs` | layout L5 with a directory named `ADR-005-x.md` is `unreadable` and PARTIAL; layout L6's three paths are in no adrCorpus list; a screen candidate `notes/x.md` that is a directory is `unreadable` and PARTIAL | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests |
| 2 — something selects it | `adrCorpus` calls the discovery, the recognition and the preference; mutants dropping any of them are caught |
| 3 — the caller can discover it | work-next and adr-state counts, and `notRead` |
| 4 — it is used | every SessionStart and work-next run; nothing measures this yet |

## Mutation Log

## Invariants

- This repository's `work-next --json` and `adr-state --json` are unchanged: at bf3aa732 `look` ok, 91 records, `notRead` 0, `partialBecause` 0, `unmarkedArchives` 0, and ADR-092's Context measured no eligible file here that the wider discovery would add.
- A file whose read failed is never dropped (ADR-092 Decision 5): it is `unreadable` and PARTIAL, except a screen-only path absent from the working tree.
- Two paths with as many links, and the same name standing, keep the first listed, so the junction loop of BACKLOG §350 C7 reads as before.

## Risks

- Streaming every eligible `.md` on a large tree; S2 measures it and the Stop Condition bounds it.

## Stop Condition

Stop and ask if S2 finds this repository's counts move at all, if a SessionStart budget test moves, or if any row's adrCorpus answer differs from ADR-092 Decision 6 after S5.

## Out of Scope

- Naming the files no reader counts (T4), the archive heuristic (T6), status reading (T5)

## Verification Log
