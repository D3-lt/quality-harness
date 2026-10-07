# ADR-092: One definition of a record, in Python, with lifecycle as its only mirror

**Status:** Proposed
**Date:** 2026-10-07
**Owner:** Zy
**Spec:** None — no spec stage; the inputs are a review's twelve findings, and the approved answers table under Decision 6 is the form a spec's facts would take
**Cross-references:** docs/adr/ADR-074-one-status-reading-and-one-record-definition.md, docs/adr/ADR-087-measured-status-shapes-are-read.md, docs/adr/ADR-063-a-record-is-its-number-or-its-stem.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-091-the-catalogue-is-a-file-per-source.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per `Rests-on` name, and the parity table names no file until T1 lands, so a pointer now would point at nothing.
**Invalidates:** ADR-087 — Decision 6's `notRead` rule (a numbered name with a frontmatter `status:` outside every record directory) is widened to every numbered candidate (Decision 9 here), its "`look` is unchanged" holds only where every read succeeded (a candidate whose read failed is PARTIAL, which ADR-005 requires because that look did fail), and T4's 64 KiB `headOf` budget becomes the corpus reader's 512 KiB; ADR-087's Follow-up "a file adr-lint does not recognise is a record to no reader" is kept and moved behind one definition. ADR-074 — Decision 5 is narrowed twice: no file under a `templates` directory is a record by either arm, so its canonical `ADR-<n>` name arm no longer admits `templates/ADR-001-x.md`; and its content arm never admits a file named `README.md`. Placement becomes one rule however a path is spelled.
**Served-path change:** adr-lint, adr-next, adr-retire-check and lifecycle (so work-next, adr-state, adr-context and corpus-probe) answer "is this file a record" from one definition in `plugin/lib/record.py` and its one JS mirror in `plugin/scripts/lifecycle.mjs`, so an eligible file one of them lints is a file every corpus reader counts or names, and a file none of them counts is named.

## Context

ADR-087's follow-ups (committed at bf3aa732) made a file adr-lint does not recognise a record to no reader. A gpt-6.1-sol review of df605f89..bf3aa732 on 2026-10-07 found twelve places where the readers still disagree, each an input that one reader counts and another rejects or never sees:

| # | P | Input | Where it is answered | What disagrees |
|---|---|-------|----------------------|----------------|
| 1 | P1 | `adr/001-link.md`, a link to a file outside the repository, with the repository under `/tmp/tasks/repo` | lifecycle.mjs placement fallback (`recognisedAsRecord`); adr-lint:6503 | lifecycle falls back to the path relative to the root and counts it; adr-lint falls back to the path as spelled, which is absolute, sees the ancestor `tasks` and rejects it, and would accept it spelled relative |
| 2 | P1 | `## Status\n\n    Accepted` | record.py:776 `status_section`; lifecycle.mjs:2168 `statusSection` | an indented code-block line is read as the Status |
| 3 | P1 | `Final/001-note.md` with `Status: Accepted` and `## Decision` | adr-retire-check:162 and :201 through record.py:722 `looks_like_record` | content is checked without placement, so adr-retire-check counts ADR-001 where adr-lint rejects it |
| 4 | P1 | `docs/decisions/001-note.md` with only `Status: Accepted`, beside `001-note/tasks/` | adr-next:1160 `owning_record` | answers `(True, 'Accepted')`, a decided owner, where adr-lint rejects the file |
| 5 | P2 | `docs/adr/ADR-12345-x.md`; `notes/spec-01-x.md` with `Status: Accepted`; `notes/decision.md` with `**Status:** Accepted` and `## Decision` | lifecycle.mjs:1949 `ADR_FILE` and :2565 content discovery | adr-lint recognises all three; lifecycle never selects them |
| 6 | P2 | `ADR-001-link.md`, a link to `001-note.md` with `Status: Accepted` and no heading | lifecycle.mjs:2716 `onceByRealPath` | dedup keeps the target (fewer links), which only the link's name made a record, so the record vanishes |
| 7 | P2 | a YAML literal holding an unmatched code fence marker above a top-level `status:` | record.py:741 `record_status`; lifecycle.mjs:2121-2126 `inlineStatus` | the fence opened inside the frontmatter hides the Status |
| 8 | P3 | `Final/RFC0001-x.md` with `# A note`; `Status: Final` with no frontmatter; a headingless `docs/adr/01-x.md` | work-next.mjs:218 `notReadFiles` | a numbered file is neither counted nor named |
| 9 | P3 | a numbered file that is missing, unreadable, or a FIFO | work-next.mjs:222 | the failed read is dropped, `look ok` |
| 10 | P3 | `---` followed by 65,536 spaces | work-next.mjs:225 `headOf` | the cut leaves nothing, and nothing is said |
| 11 | P3 | `a` → `c` → the file, two links | lifecycle.mjs:1380 `linksIn` | counted as one link, so dedup can keep the more-linked path |
| 12 | P3 | a FIFO named `ADR-001-x.md` | adr-retire-check:68 `_read`, walked by record.py `walk` | opened, and the process blocks |

Line numbers are the review's, at bf3aa732.

A cold review of this record's first draft (gpt-6.1-sol, 2026-10-07: three blockers, nine should-fixes), and reading the sites it named, found more members of the same class. Each is now part of this decision:

- adr-retire-check:160-168 keys records by ADR-063 identity, and a file NAMED `ADR-` whose identity is None falls to `continue` with no word, because the `unidentified` append at :166 is guarded by `not named`. `record_id` reads one to four digits (record.py:494-496, :665), so `ADR-12345-x.md` is such a file; so are `spec-01-x.md` and `decision.md` (measured 2026-10-07: `record_id` returns None for all three, with the title `# ADR-12345: X` too). ADR-063 Decision 4 says a record without identity is advised, never dropped silently.
- adr-retire-check:156 walks `walk(root, "*.md")`, and `walk` (record.py:3208) matches with `fnmatch`, which is case-sensitive off Windows: measured 2026-10-07 on macOS with Python 3.14.8, `ADR-002-x.MD` is not yielded. lifecycle's `/\.md$/i` (lifecycle.mjs:2624) lists it, so the same file is a record to one reader on one platform.
- adr-retire-check:158 skips every `README.md`; lifecycle (lifecycle.mjs:2622-2640) does not, so a `README.md` under a record directory with a Status and a `## Decision` is counted by lifecycle and by no Python walk.
- adr-retire-check:68 `_read` has no `OSError` arm, so an unreadable corpus file is a traceback, not its documented exit 2 (adr-retire-check:17-18).
- adr-next:1140 skips a candidate that `is_file()` rejects before any read, so a FIFO owner is reported missing rather than found and unreadable.
- record.py:3202-3205 `walk` drops a directory it cannot list (`except OSError: continue`), in every caller.
- lifecycle.mjs:1340 `RECORD_SHAPED` decides by name alone whether an archive-named directory holds records, so a record the definition admits by `spec-<n>` or by content leaves its archive unnamed in `unmarkedArchives`.
- adr-retire-check counts paths, not files: a link and its target in one walked root read "ADR-n exists 2 times" (adr-retire-check:400-403, :609-612), with nothing saying the two paths are one file.

**The class:** "is this file a record, and what is its Status" is answered in several places, each with its own copy of part of the rule. Enumerated 2026-10-07 at bf3aa732 with

```bash
mrw read --grep 'looks_like_record|record_status\(|status_section\(|_RECORD_SECTION|_NUMBERED_REF\.match|owning_record\(|adr_files\(|recognisedAsRecord|ADR_FILE|readsAsRecord|looksLikeRecord|onceByRealPath|notReadFiles|headOf\(|NUMBERED_NAME|RECORD_SHAPED|notRecognised|inlineStatus\(|statusSection\(|from record import .*\bwalk\b' plugin/ \
  | awk '/^==> /{f=$2} /^ *[0-9]+\| /{c[f]++; t++} END{for(k in c) print c[k], k; print t, "total"}'
```

which counted 80 lines in 12 files: lifecycle.mjs 25, work-next.mjs 10, record.py 10, adr-lint 10, adr-retire-check 8, adr-state.mjs 6, adr-next 6, corpus-probe.mjs 1, and one `walk` import each in spec-verify, arch-lint, adr-verify and adr-debt. The first draft said 73 lines, and 60 for the fence walk, without saying how lines were counted; re-run with the counting step above at the same sha they are 80 and 103, and these are the numbers this record rests on.

The recognition decisions among them are six: adr-lint's main (canonical name, spec name, content with placement), record.py's `looks_like_record` (content without placement, used by adr-retire-check twice), adr-next's `owning_record` (any Status at all), lifecycle's discovery plus `recognisedAsRecord` (a third copy, with its own placement fallback), work-next's `notReadFiles` (a fourth candidate rule), and lifecycle's `RECORD_SHAPED` (a name-only guess at whether a directory holds records). The selection filters in front of them are four, each a separate boundary today: adr-retire-check's `README.md` and `tasks/` skip and `*.md` glob (:156-158), lifecycle's `tasks/` and fixture-tree skip and `/\.md$/i` (lifecycle.mjs:2624-2630), adr-next's `is_file` skip (:1140), and work-next's `NUMBERED_NAME` and record-directory skip (work-next.mjs:217-218).

The fence walk the status readers sit on is shared further: the same pipeline over `sections_of|section_span|repeated_headings|_sections|_scan|unfenced_numbered|unfenced_lines|fencedLines` counted 103 lines in 9 files (record.py 44, adr-lint 20, adr-verify 12, adr-next 7, adr-retire-check 6, lifecycle.mjs 5, spec-verify 3, arch-lint 3, adr-debt 3). `walk(` itself is called at adr-debt:309, :311, :480, adr-lint:2933, adr-retire-check:156, :223, :346, :348, adr-verify:2444, arch-lint:328 and spec-verify:427.

Measured on this repository the same day, for what the decision would change here (a Python pass over `git ls-files` using record.py's own functions): 226 tracked `.md` files are eligible (Decision 3). Outside every record directory none of them carries both a line-start `**Status:**` and a `## Context` or `## Decision` heading once `plugin/templates/` is excluded; four carry a `**Status:**` (docs/BACKLOG.md, docs/TEST-PLAN.md and two templates), and only the ADR template also carries a heading. 51 numbered `.md` files sit outside every record directory (docs/specs 28, .claude/rules 19, docs/research 3, docs/audits 1); none carries a Status in any form, none has a letter prefix, and none is over 512 KiB. The largest, docs/specs/2026-09-11-one-record-grammar.md, is 67,005 bytes, past ADR-087's 64 KiB head. docs/BACKLOG.md is 1,454,747 bytes. No tracked `README.md` outside fixtures reads as a record. `node plugin/scripts/work-next.mjs --json` at bf3aa732: `look` ok, 91 records, `notRead` 0, `partialBecause` 0, `unmarkedArchives` 0.

**Consistency with the Accepted records this one touches**, each read 2026-10-07. ADR-005 (could-not-look is never verdict vocabulary) is what Decisions 9 and 10 apply. ADR-063's identity rule is unchanged; its Decision 4 (a record without identity is advised, never counted, never dropped) is applied to the name arm, where adr-retire-check:166 broke it. ADR-074 Decisions 1-4 are unchanged except that Decision 1's "outside a code fence" now also excludes an indented code block and a fence opened inside the frontmatter (Decision 8 here); its Decision 5 is narrowed as `Invalidates` says. ADR-087 is altered as `Invalidates` says, and its Out of Scope (RFC-style corpora outside a record directory are named, not read) is kept. ADR-091 decides only where campaign entries live: the tasks write to `tests/mutations.json` or, once ADR-091 T3 has landed, its per-source file. ADR-004 (templates are not linked) is about installation and is not touched.

## Existing Primitives Audit

- `record.py` `record_status`, `status_section`, `frontmatter_block`, `_RECORD_SECTION`, `_NUMBERED_REF`, `_RECORD_DIRECTORY`, `record_id`, `git_root`, `walk`: reused. The definition is built from them, not beside them; `record_id` (ADR-063) is not changed.
- adr-lint's recognition branch in its main (adr-lint:6498-6536) and `_not_recognised_because`: reshaped into the shared definition, which returns the parts the message needs, so adr-lint keeps no second copy.
- record.py `looks_like_record`: replaced; its two callers in adr-retire-check take the shared definition, and nothing else calls it.
- adr-lint `refuse_irregular` (adr-lint:1038-1048): its rule (only a regular file is opened) moves to record.py so adr-retire-check and adr-next read through it too.
- adr-retire-check's `unidentified` list and its advice line (:398, :457-459, :602-608): reused for every recognised record without identity.
- lifecycle `recognisedAsRecord`, `readsAsRecord`, `looksLikeRecord`, `ADR_FILE`, `onceByRealPath`, `linksIn`, `inlineStatus`, `statusSection`, `fencedLines`, `RECORD_SHAPED`, `unmarkedArchives`: reshaped into the one mirror. `ADR_FILE` stays as the name filter that feeds `notRecognised` and task attribution, and stops deciding what a record is.
- `uninteresting.mjs` `listedUnderUninterestingDirectory`: reused as the fixture-tree half of eligibility in JS; record.py gains its pattern.
- work-next `notReadFiles` and `headOf`: reshaped.
- tests/status-reading.test.mjs already holds Python and JS to one Status reading, and tests/record-identity.test.mjs to one identity; the parity table extends the same idea to recognition and selection.

## Decision

1. **One definition, in Python.** `plugin/lib/record.py` gains `recognised_as_record(path, text, root)`, returning whether the file is a record and the parts a caller reports: the Status value read, whether the file sits where records are kept, and which arm admitted it. **No file with a directory named `templates` (ASCII case-insensitive) on its placed path is a record, by either arm** (the owner, 2026-10-07: a template is never a record, whatever its name; the same file outside `templates/` is judged as any other). Outside such a directory, a file is a record when its name starts `ADR-<n>` (`_NUMBERED_REF`, any width) or `spec-<n>` (`spec[-_]?\d`, `re.I`), whatever its directory. Otherwise it is a record by content when it carries a Status (ADR-074 Decision 1) and a `## Context` or `## Decision` heading, is not named `README.md` in any case, and either has a line-start `**Status:**` or is kept where records are (a directory `_RECORD_DIRECTORY` names, never under `tasks/`). This is adr-lint's rule today with two narrowings of ADR-074 Decision 5. The `templates` one covers both arms, so `templates/ADR-001-x.md` is not a record (row R29). **A `README.md` is a catalog, never a record by content** (the owner, 2026-10-07), as adr-retire-check already decides (:158); the name arms cannot match it. Outside `templates/`, a record named `ADR-<n>` keeps every finding it had. Measured 2026-10-07 by listing the directory: the plugin's own `plugin/templates/` holds `adr-archive-readme-template.md`, `adr-template.md`, `architecture-template.md`, `spec-template.md`, `task-template.md` and `tasks-readme-template.md`; none starts `ADR-<n>` or `spec-<n>` or matches lifecycle's `ADR_FILE` (each needs a digit after the prefix), so no reader reads any of them as a record by name today, and the only verdict that changes there is adr-lint's on `adr-template.md`, recognised today by its `**Status:**` line and headings.
2. **Placement is one rule, whoever asks and however the path is spelled.** The file's real path relative to the real git root; when the real path leaves the root, the path as listed relative to the root; when there is no root, the path's own components. adr-lint no longer answers differently for a relative and an absolute spelling of the same file (finding 1).
3. **Eligibility is one rule for every corpus walk, and it is not the definition.** A walk (adr-retire-check, lifecycle's discovery, work-next's candidates) considers a path only when its basename ends `.md` in any case, on every platform; it is not `README.md` in any case; and no directory between the walked root and the file is `tasks` (ADR-063 Decision 4), `templates` (Decision 1, so a template is not even a `notRead` candidate) or a fixture tree (`uninteresting.mjs`'s pattern, which record.py gains as `UNINTERESTING_DIRECTORY`). adr-lint, judging a path named on its command line, applies the definition without eligibility, because it must lint a fixture named directly; the definition already rejects every path under `templates/`. The promise this record makes (a file adr-lint lints is counted or named by every corpus reader) is over eligible paths: a name-arm file under `tasks/` or in a fixture tree is linted when named and enumerated by no walk, as today.
4. **Every Python reader calls the definition.** adr-lint calls it for its verdict and its message. adr-retire-check counts **the recognised records that have an ADR-063 identity**, and advises on **every recognised record without one**, the name arm included (`ADR-12345-x.md`, `spec-01-x.md`, `decision.md`), never counting and never dropping it. adr-next's `owning_record` reads an unrecognised file as found with no Status, and a file that exists and is not a regular file as found and unreadable. `looks_like_record` is deleted. adr-retire-check's duplicate-identity error stays, since a sealed archive reachable twice is the layout defect it names, and says so when the paths are one file on disk.
5. **lifecycle's JS is its only mirror, with two sets.** The **discovery set** is every eligible path that is named like a record (`ADR_FILE`, or a name arm at any width with Python's `re.I` and `\d` reproduced, so `ſpec-01` and a non-ASCII digit read alike), or sits under a record directory, or passes the **content screen**: a streamed read of the whole file, at any size, that finds both a line starting `**Status:**` and a `_RECORD_SECTION` heading line. The screen is exact, not a guess: outside a record directory the content arm cannot admit a file lacking either. It is bounded the way the record budget is (lifecycle.mjs:2631-2636): past 64 MiB streamed in one `adrCorpus` call it stops, and the first path left unscreened is named as unexamined and the look is PARTIAL, never `look ok` over a tree it did not read. Dedup (Decision 7) runs over the discovery set. The **counted set** is each kept path the mirror recognises, read under the existing 512 KiB record budget; a path over it is `unreadable` and PARTIAL, as a record is today. A discovered path the mirror does not recognise is in `notRecognised` only when it was discovered by name; one discovered by place or by the screen and not recognised was never claimed, and no reader names it, as today. A path whose read failed is never dropped: one discovered by name or by place is `unreadable` and PARTIAL, as today; one that only the screen could have admitted is `unreadable` and PARTIAL for every failure except its absence from the working tree (`ENOENT`), which is an observation that it carries nothing.
6. **The approved answers.** `tests/fixtures/record-recognition.json` holds the rows below, and each row is read by every reader its columns name. The expected answers are these, approved with this record. No task may change one; a task that finds a reader disagreeing stops and asks. Each task asserts only the columns it makes true, by exact equality over every row and layout that has a cell in that column (`deepStrictEqual` of the whole row-id → answer map, so a dropped row fails); a row that needs a link (R1, L1-L4) is asserted in a companion test that may skip only on Windows when the link cannot be made, and L5 in the regular-file tests. `P` is `Status: Accepted`, `B` is `**Status:** Accepted`, `D` is `## Decision`, `C` is `## Context`. adr-retire-check's `adr_files` is called with the row path's first component as its root (`adr`, `docs`, `Final`, `notes`, `plugin`, `tests`), through the module loader the tests already use (`load_script`, tests/gate-regressions.py:716), so eligibility is judged below that root. `—` means the reader lists the path nowhere.

| Row | Path: text | recognised (T1) | status (T1) | identity (T1) | adrCorpus (T3) | adr-retire-check (T2) | work-next (T4) |
|-----|-----------|-----------------|-------------|---------------|----------------|-----------------------|----------------|
| R1 | `adr/001-link.md` → link to `<outside>/001-note.md`: P, D; repository under `<tmp>/tasks/repo`; adr-lint run with the relative and the absolute spelling | true | `Accepted` | ADR-001 | record | counted ADR-001 | counted |
| R2 | `docs/adr/ADR-002-x.md`: `# ADR-002: X`, `## Status`, a four-space `Accepted`, D | true | null | ADR-002 | record | counted ADR-002 | counted |
| R3 | `docs/adr/ADR-003-x.md`: as R2 with `Accepted` unindented | true | `Accepted` | ADR-003 | record | counted ADR-003 | counted |
| R4 | `Final/001-note.md`: P, D | false | `Accepted` | ADR-001 | notRecognised | — | notRead |
| R5 | `docs/decisions/001-note.md`: P only, beside `docs/decisions/001-note/tasks/T1-x.md` | false | `Accepted` | ADR-001 | notRecognised | — | notRead |
| R6 | `docs/adr/ADR-12345-x.md`: `# ADR-12345: X` | true | null | null | record | unidentified | counted |
| R7 | `notes/spec-01-x.md`: P | true | `Accepted` | null | record | unidentified | counted |
| R8 | `notes/decision.md`: B, D | true | `Accepted` | null | record | unidentified | counted |
| R9 | `docs/adr/ADR-007-x.md`: `---`, `notes: \|`, two spaces and a three-backtick fence marker, `status: accepted`, `---`, `# ADR-007: X`, D | true | `accepted` | ADR-007 | record | counted ADR-007 | counted |
| R10 | `Final/RFC0001-x.md`: `# A note` | false | null | null | — | — | notRead |
| R11 | `notes/01-x.md`: `Status: Final` | false | `Final` | ADR-001 | — | — | notRead |
| R12 | `docs/adr/01-x.md`: `Some text` | false | null | ADR-001 | — | — | notRead |
| R13 | `Final/RFC0047-x.md`: `---` and 65,536 spaces, no line break | false | null | null | — | — | notRead |
| R14 | `notes/02-x.md`: 70 KiB of `filler` lines, then `Status: Final` | false | `Final` | ADR-002 | — | — | notRead |
| R15 | `notes/03-x.md`: 600 KiB of `filler` lines, then `Status: Final` | false | `Final` | ADR-003 | — | — | partialBecause |
| R16 | `notes/04-x.md`: `---`, 600 KiB of `k: v` lines, `status: x`, `---` | false | `x` | ADR-004 | — | — | partialBecause |
| R17 | `docs/adr/011-x.md`: `---`, `status: accepted`, `---`, `Text` (ADR-087's headingless shape) | false | `accepted` | ADR-011 | notRecognised | — | notRead |
| R18 | `docs/adr/ADR-020-x.md`: `Text` | true | null | ADR-020 | record | counted ADR-020 | counted |
| R19 | `notes/report.md`: B, C | true | `Accepted` | null | record | unidentified | counted |
| R20 | `notes/report-2.md`: `**Status**: Accepted`, C | false | `Accepted` | null | — | — | — |
| R21 | `docs/adr/021-nel.md`: P, then `##`, U+0085, `Decision` | true | `Accepted` | ADR-021 | record | counted ADR-021 | counted |
| R22 | `docs/adr/022-fs.md`: P, then `##`, U+001C, `Decision` | true | `Accepted` | ADR-022 | record | counted ADR-022 | counted |
| R23 | `docs/adr/023-bom.md`: P, then `##`, U+FEFF, `Decision` | false | `Accepted` | ADR-023 | notRecognised | — | notRead |
| R24 | `docs/adr/024-ls.md`: `Status: Accepted`, U+2028, `## Decision`, on one Python line | false | `Accepted`, U+2028, `## Decision` | ADR-024 | notRecognised | — | notRead |
| R25 | `notes/ſpec-01-x.md` (U+017F): P | true | `Accepted` | null | record | unidentified | counted |
| R26 | `notes/spec-٠١-x.md` (U+0660, U+0661): P | true | `Accepted` | null | record | unidentified | counted |
| R27 | `plugin/templates/adr-template.md`: B, D | false | `Accepted` | null | — | — | — |
| R28 | `docs/notes/adr-template.md`: the R27 text | true | `Accepted` | null | record | unidentified | counted |
| R29 | `plugin/templates/ADR-001-x.md`: B, D | false | `Accepted` | ADR-001 | — | — | — |
| R30 | `docs/adr/README.md`: P, D | false | `Accepted` | null | — | — | — |
| R31 | `docs/adr/ADR-031-x.MD`: P, D | true | `Accepted` | ADR-031 | record | counted ADR-031 | counted |
| R32 | `docs/adr/tasks/ADR-032-x.md`: P, D | true | `Accepted` | ADR-032 | — | — | — |
| R33 | `tests/fixtures/docs/adr/ADR-033-x.md`: P, D | true | `Accepted` | ADR-033 | — | — | — |

Six layouts are rows of the same file with their own exact answers, because recognised and status cannot express them (alias, link count, unreadable, absent):

| Layout | Paths | adrCorpus (T3) | adr-retire-check (T2) | work-next (T4) |
|--------|-------|----------------|-----------------------|----------------|
| L1 (finding 6) | `docs/adr/ADR-001-link.md` → link to `notes/001-note.md`: P, no heading | `docs/adr/ADR-001-link.md` counted, `Accepted`; `notes/001-note.md` alias of it | counted ADR-001 | the kept path counted; the alias in partialBecause, as every alias is today (work-next.mjs:658) |
| L2 (twin, both named) | `docs/adr/ADR-002-link.md` → link to `docs/adr/ADR-002-target.md`: P, D | `ADR-002-target.md` counted; `ADR-002-link.md` alias of it (fewer links) | ADR-002 exists 2 times, the error naming both paths as one file | the kept path counted; the alias in partialBecause |
| L3 (twin, target by content) | `docs/adr/ADR-003-link.md` → link to `docs/adr/003-target.md`: P, D | `ADR-003-link.md` counted (the name arm wins); `003-target.md` alias of it | ADR-003 exists 2 times, the error naming both paths as one file | the kept path counted; the alias in partialBecause |
| L4 (finding 11) | the file `<outside>/x/ADR-004-x.md`, outside the repository, reached as `a/ADR-004-x.md` (`a` → `c` → `<outside>/x`, two links, `c` a link in the repository) and as `b/ADR-004-x.md` (`b` → `<outside>/x`, one link); no zero-link path to it is listed | through `adrCorpus`'s injected `tracked` listing of both paths (git lists a link, never the paths under it): `b/ADR-004-x.md` counted; `a/ADR-004-x.md` alias of it; `linksIn` 2 and 1 | — (the walk never enters a link) | — (git lists the links `a`, `b` and `c`, never a path under them) |
| L5 (findings 9, 12) | `docs/adr/ADR-005-x.md` that is not a regular file: a FIFO on POSIX, a directory on every platform | unreadable, PARTIAL | could-not-run, exit 2, naming it | partialBecause |
| L6 (finding 9, Decisions 5 and 9) | `notes/gone.md`, `notes/07-gone.md` and `Final/RFC0007-x.md`, tracked and absent from disk | in no list | — | `Final/RFC0007-x.md` in partialBecause (a candidate by name whose read failed); neither `notes/` path, since only content could make them candidates and absence is an observation of none |

7. **Dedup prefers, in order:** a spelling a name arm recognises; then fewer links, counted by resolving each hop; then the first listed. The name preference is computed from the name alone, so it is known before any read. Only `adrCorpus` passes it. Task directories (lifecycle.mjs:1487, work-next.mjs:265) take no name preference and gain the per-hop count, which changes their winner only where a path's links were undercounted. `linksIn` counts every link component of the path and every link met while resolving a target, and stops at 32 hops. A path whose count reaches the limit, or meets a link it already followed, counts as unbounded (`Infinity`) and loses to every counted path; two unbounded paths keep the first listed. A path whose real path cannot be taken (a cycle makes `realpathSync` throw) is kept, as today (lifecycle.mjs:1390).
8. **No indented code-block line is a Status** (label, bullet or `## Status` section line alike: four spaces or a tab), and **the frontmatter is delimited before any fence is scanned**, so a fence opened inside a YAML value hides nothing below the block. This changes the one fence walk (`_scan` / `unfenced_numbered` and lifecycle's `fencedLines`), so every section reader gains it.
9. **Every numbered candidate is counted or named.** A candidate is an eligible tracked `.md` file with a numbered basename (`^[A-Za-z]*-?\d{2,}[-_]`) that sits in a record directory, has a letter prefix before its number (`RFC0001-`), or carries a Status in any form. The first two are decided by the path; the third needs the content, read whole up to the corpus reader's 512 KiB. A candidate no reader counts is in `notRead`. A candidate decided by the path whose read failed (absent, unreadable, not a regular file) is in `partialBecause`. A path whose candidacy needs content is in `partialBecause` when the content could not be read for any reason but absence, or is over 512 KiB. Either makes `look` PARTIAL.
10. **Only a regular file is opened**, by every reader in this class; anything else is could-not-look and named: adrCorpus `unreadable` and PARTIAL, work-next `partialBecause`, adr-lint and adr-retire-check could-not-run at exit 2, adr-next found and unreadable. A directory a walk could not list is named the same way, in adr-retire-check (T2) and in every other `walk` caller (T7). The other `*.md` walks (adr-debt:309, :480; adr-verify:2444) read `.md` in any case too (T7), so a `.MD` record's obligations and tasks are not missed off Windows.
11. **The unmarked-archive heuristic follows the definition where it can afford to.** `unmarkedArchives` takes an optional set of recognised files, and `adrCorpus` passes its counted set, so a `spec-01` or content-recognised record under an archive-named directory names that directory in work-next. The two SessionStart callers (lifecycle.mjs:1814, :3744) open no file, by CLAUDE.md §19, and keep the name test, widened to the name arms (`ADR-<n>` at any width, `spec-<n>`). They advise about a directory and never count anything.

The decision fails, and the parity test says so, if any row reads differently from its approved answer in any reader, if an eligible file adr-lint lints is counted or named by no corpus reader, or if a file a reader counts is one adr-lint rejects. The data that could produce that failure exists today: the twelve inputs are rows R1-R17 and layouts L1-L6.

## Alternatives Considered

- **Patch each reader separately**, as the review lists them: rejected because that is how the class arose. Six recognition rules already exist; a twelfth patch makes a seventh, and the next corpus shape finds the next disagreement.
- **Generate lifecycle's JS from the Python definition**: rejected because the two languages differ exactly where the review found defects (`\s`, `^` under multiline, `re.I` folding, `\d`); a generator that translated regexes would carry those differences invisibly, while a hand mirror held by a parity table shows each one as a failing row.
- **Spawn Python from lifecycle for every candidate**: rejected because lifecycle runs on SessionStart and on every prompt's brief, where a Python process per file costs an adopter's session seconds on a corpus of hundreds (CLAUDE.md §19), and a missing `python3` would turn every corpus reader into could-not-look.
- **Make lifecycle the definition and have Python mirror it**: rejected because adr-lint is the gate a record is checked against, and the owner chose on 2026-10-07 that adr-lint's answer wins.
- **Count a record without identity in adr-retire-check under a synthetic id**: rejected because adr-retire-check's catalog is keyed by identity (ADR-063), and ADR-063 Decision 4 already chose advice for exactly this case.
- **Read only a 64 KiB head for discovery and candidacy**: rejected because a Status past the head is then could-not-look for every long file, which on this repository would make docs/specs/2026-09-11-one-record-grammar.md (67,005 bytes) PARTIAL in every session; the 512 KiB record budget and a streamed two-line screen answer exactly.
- **Exclude templates only from lifecycle**: rejected by the owner on 2026-10-07: both languages, one rule.

## Component / Boundary Impact

- `plugin/lib/record.py` owns the definition, placement and eligibility; it has one reason to change: what a record is.
- adr-lint, adr-retire-check and adr-next consume it; none decides recognition itself.
- `plugin/scripts/lifecycle.mjs` owns the JS mirror, discovery, the content screen, dedup and the archive heuristic; work-next, adr-state, adr-context and corpus-probe consume `adrCorpus` as today.
- `plugin/scripts/work-next.mjs` owns naming (`notRead`) and the PARTIAL reasons for candidates it could not read.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `record.py` `recognised_as_record(path, text, root)` | new | record.py (T1) | adr-lint (T1), adr-retire-check, adr-next (T2) |
| `record.py` `record_placement(path, root)` | new | record.py (T1) | `recognised_as_record`; adr-lint's not-recognised message |
| `record.py` `corpus_eligible(relative)`, `UNINTERESTING_DIRECTORY` | new | record.py (T1) | adr-retire-check (T2) |
| `record.py` `read_regular(path)` | new; raises for a path that is not a regular file | record.py (T2) | adr-retire-check, adr-next, adr-lint's `refuse_irregular` |
| `record.py` `walk(root, pattern, is_link, unlisted=None)` | new optional list of the directories it could not list | record.py (T2) | adr-retire-check (T2), the other walk callers (T7) |
| `record.py` `looks_like_record` | deleted | — | adr-retire-check moves to the definition (T2) |
| adr-lint verdict on any file under `templates/`, or a content-only file named `README.md` | was recognised, is `not-recognised` (exit 2) | adr-lint (T1) | tests/gates.test.mjs:93 and :1300, which change from 1 to 2, with a twin outside `templates/` still 1 |
| adr-retire-check output | advice for every recognised record without identity; could-not-run exit 2 for an unreadable corpus file or an unlistable directory; the duplicate error says when its paths are one file | adr-retire-check (T2) | `--adopt` and the archive catalog check |
| `tests/fixtures/record-recognition.json` | new parity table, rows R1-R33 and layouts L1-L6 | T1 | T1, T2, T3, T4 tests |
| `adrCorpus` record selection | the discovery and counted sets of Decision 5 | lifecycle (T3) | work-next, adr-state, adr-context, corpus-probe |
| lifecycle `linksIn(file, limit = 32)` | exported; per-hop count, `Infinity` when unbounded | lifecycle (T3) | `onceByRealPath` and its three callers |
| `unmarkedArchives(root, listing, recognised)` | optional third argument | lifecycle (T6) | `adrCorpus` (T6); the SessionStart callers keep two arguments |
| work-next JSON `notRead`, `partialBecause` | wider candidate set; new could-not-look reasons | work-next (T4) | corpus-probe, the matrix |
| adr-next `owning_record` | an unrecognised file reads as found with no Status; a non-regular owner as found and unreadable | adr-next (T2) | SessionStart's owner hedge, `adr-next <tasks>` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the fence walk's frontmatter-first and code-block rules | T5 | T1, T3 (rows R2 and R9) | No — two answers move to the approved ones |
| `recognised_as_record`, `record_placement`, `corpus_eligible` | T1 | T2, T3 | No — new functions |
| `tests/fixtures/record-recognition.json` | T1 | T2, T3, T4 | No — written whole once; later tasks add assertions, never rows or answers |
| `walk(..., unlisted)` | T2 | T7 | No — optional argument |
| `adrCorpus` selection, `notRecognised` and `linksIn` | T3 | T4, T6 | No — same fields, more files |

## Implementation

See `tasks/README.md`. Seven tasks; every finding maps to one: T5 (2, 7), T1 (1, and Decisions 1-3), T2 (3, 4, 12, and the identity partition, `.MD`, unreadable-file and duplicate-path sites), T3 (5, 6, 11), T4 (8, 9, 10), T6 (the archive heuristic), T7 (the other walks' unlisted directories and `.MD` files). T5 lands first, so the table T1 writes holds only approved answers and no task's acceptance depends on a wrong one.

## Consequences

- **Positive:** an eligible file adr-lint lints is a file every corpus reader counts or names, and a file no reader counts is named; the next corpus shape that splits them is one failing row of one table.
- **Negative:** discovery streams every eligible `.md` outside record directories through the two-line screen, which costs a large repository more than reading record directories alone (this repository: 226 eligible files, docs/BACKLOG.md 1.45 MB); the screen's 64 MiB bound turns a tree past it into PARTIAL, not into a long SessionStart; T3 measures the SessionStart hook's time on this repository and the largest corpus fixture before and after, and stops if it grows by more than a quarter. adr-lint on the bundled ADR template now says not-recognised instead of FAIL; the protection against a placeholder record passing is kept by the same text outside `templates/`, which still FAILs. Measured 2026-10-07: the only tracked paths with a `templates` directory are plugin/templates/ (six `.md`) and plugin/evals/templates/ (`.yaml`), and of them only adr-template.md is recognised today.
- **Neutral:** changing the fence walk (Decision 8) changes what every section reader sees in a record whose frontmatter holds a fence marker; T5 measures how many such files this repository has.

## Out of Scope

- Reading RFC-style corpora outside a record directory as records (permanent: boundary: ADR-087 Out of Scope, and the owner's 2026-10-07 answer to its spec's Grill Log row 8 that naming is enough)
- A YAML parser for frontmatter (permanent: boundary: only top-level keys are read, line by line, as ADR-087 decided)
- Spawning Python from the JS readers (permanent: boundary: rejected under Alternatives for its per-session cost)
- Widening ADR-063's identity past four digits (permanent: boundary: identity is ADR-063's decision; a record it cannot identify is advised, never dropped, by Decision 4 here)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The wider discovery makes a non-record in an adopter's tree a record (a report written with `**Status:**` and `## Decision`) | Med | Low | adr-lint already lints exactly those files, so the readers now agree with a verdict the adopter already sees; templates (by either arm) and READMEs (by content) are excluded by Decision 1 |
| Streaming every eligible `.md` slows SessionStart on a large tree | Low | Med | the 64 MiB screen bound (Decision 5); T3 measures the opened-file and streamed-byte counts and the SessionStart hook's time on this repository and on the corpus fixtures, dated, and stops if the time grows by more than a quarter |
| The fence-walk change moves a section reader's answer somewhere unseen | Low | Med | T5 enumerates the callers (103 lines in 9 files on 2026-10-07) and runs every catalogue entry in the edited functions |
| A tracked file deleted in the working tree turns a look PARTIAL | Low | Low | only a path decided by name or place does (Decision 9, L6); a path only content could admit is observed absent |
| A locked test's behaviour changes | Med | Low | each task asks `scripts/test-locks.py` first; a locked test stays byte-identical and a new test goes beside it, or the task stops |

## Rollback

`git revert` of the task commits. Nothing persistent changes: no state is written, and every field keeps its shape.

## Follow-ups
