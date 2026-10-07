# ADR-087: Read the Status shapes measured in public corpora, and name the numbered files left unread

**Status:** Accepted
**Date:** 2026-10-06
**Owner:** Zy
**Spec:** docs/specs/2026-10-06-corpus-shapes-our-readers-misread.md
**Cross-references:** docs/adr/ADR-074-one-status-reading-and-one-record-definition.md, docs/adr/ADR-063-a-record-is-its-number-or-its-stem.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per `Rests-on` name, and naming them before they exist would point at nothing.
**Invalidates:** ADR-074 — three of its decisions are widened, and none is reversed. Decision 1 (the label) gains a bullet arm, `* Status:` or `- Status:` above the first level-2 heading, and names the frontmatter `status:` key, which its line arm already matched without saying so. Decision 2 (the value) also removes one enclosing pair of `"` or `'` and a trailing ` #` comment, but only inside a leading frontmatter block. Decision 3 (the kind) adds `active` → governing to the fixed set. Decisions 4 to 6, the parity table and the placement rule in its Follow-ups are unchanged, and ADR-063's identity rule is reused unchanged.
**Served-path change:** work-next, adr-state, adr-lint and adr-context count a record whose Status is frontmatter `active`, a quoted `"accepted"` or a MADR 2 `* Status: accepted` as governing, where today it is undecided. A frontmatter `superseded` record names its replacement from `superseded_by`. work-next and corpus-probe name a numbered `.md` file with a frontmatter `status:` that sits outside any record directory, where today they say nothing about it.

## Context

The spec's Problem and Facts carry the measurements. This section adds what the decision turns on. Every figure below was measured on 2026-10-06 at quality-harness 73f930f, over shallow clones of public repositories, with `node plugin/scripts/corpus-probe.mjs <clone> --json` and never `--sweep`.

What the readers said, per corpus:

| Corpus (HEAD) | Records read | Undecided | What `undecided` says | work-next `next` |
|---|---|---|---|---|
| public/swift-adrs (b2177fb) | 29, all `superseded` | 32 | `active`: 32 | `adr-retire`, retirable 29 |
| public/active-status-adr (52d16a6) | 16 (12 superseded, 4 Accepted) | 170 | `active` 163, `Active` 3, `"active"` 1, no Status 2 | `adr-retire`, retirable 12 |
| public/frontmatter-adr (12e023b) | 1 | 37 | `active` 37 | `adr-retire`, retirable 1 |
| public/small-active-adr (8d92d2d) | 0 | 6 | `Active` 5, the template `{Active\|Superseded}` 1 | none |
| public/quoted-status-adr (20179f4) | 1 (`superseded by ADR-0011`) | 19 | `"accepted"` 15, `"accepted, amended by ADR-0019 …"` 1, the template 1, no Status 2 | `adr-retire`, retirable 1 |
| public/star-status-adr (b6001f0) | 0 | 51 | no Status line: 51. 29 of them say `* status: …` | none |
| public/template-adr (ba75bb1) | 0 | 20 | no Status 19, `on hold` 1 | none |
| public/control-adr (ad0c96c), a control | 12 (11 governing) | 1 | the template | `adr-retire`, retirable 1 |
| public/dir-status-rfc (ccc7819) | 0 | 0 | — | `core`, "no QH corpus is in use" |

Four findings shape the decision:

- **The text readers already name what they could not read.** On swift-adrs, work-next prints "32 further record(s) are not acted on", and adr-state lists the 32 files with their `[active]` Status. So BACKLOG §354's "silent" holds only for the JSON `look: ok` and for SessionStart. The defect is that the readers misread shapes, not that they say nothing.
- **BACKLOG §354 item 2 does not reproduce here.** It says 12 of the 29 retirable records say `status: active`. At b2177fb, work-next's retirable set is exactly the 29 records whose frontmatter says `status: superseded`, compared as sets. This record corrects that figure. The BACKLOG keeps it, as history (CLAUDE.md §10).
- **`supersedes` is not the inverse of `superseded_by`.** On swift-adrs and active-status-adr, `superseded_by` agrees with `status` in every record: set exactly when the status is `superseded`. `supersedes` does not: in active-status-adr, 28 of the 37 records it names still say `active`.
- **dir-status-rfc is not a record corpus.** None of its 64 `RFC*.md` files has a `## Context` or `## Decision` heading. In 8 of the 64, the file's own frontmatter `Status:` contradicts its directory: 3 `Draft` under `Archive/Rejected`, 1 `Draft` under `Final`, 1 `Draft-Accepted` under `Archive/Experimental`, 2 `Draft-Accepted` under `Archive/Draft`, and 1 `Draft` under `Draft-Accepted`.

**The class: every reader of a record's Status value or of its supersession target.** Enumerated with `git ls-files plugin/bin plugin/lib plugin/scripts | xargs grep -nE 'record_status\(|recordStatus\(|status_kind\(|recordStatusKind\(|statusKind\(|rawStatus\(|first_reference\(|STATUS_KINDS|_STATUS_LINE|status_section\('` on 2026-10-06. Per file: adr-lint 10, adr-next 4, adr-retire-check 4, record.py 10, adr-state.mjs 1, lifecycle.mjs 12. These are ADR-074's members, unchanged. The value is read in two places, record.py's `record_status`/`status_kind` and lifecycle's `inlineStatus`/`recordStatusKind`, and every other member consumes one of them. Supersession targets were enumerated with `git ls-files plugin/bin plugin/lib plugin/scripts | xargs grep -nE 'supersessionTarget\(|first_reference\(|superseded_by'`. It found 4 call sites; the fifth hit is `first_reference`'s own definition. Only `lifecycle.mjs:2778` reads a record's own Status. `lifecycle.mjs:2251` and `adr-retire-check:636` read an archive catalog's effect column.

Left out, on purpose:
- the archive-catalog effect readers (`lifecycle.mjs:2251`, `adr-retire-check:636`), because a catalog row has no frontmatter;
- the task-status, spec-status and architecture-status readers, as in ADR-074.

This repository's own corpus is unaffected. `git ls-files '*.md'` holds no record with a bullet Status or a quoted frontmatter Status, and none with a frontmatter `status:` key outside a record directory.

## Existing Primitives Audit

- `record.record_status` / `status_kind` and lifecycle's `inlineStatus` / `recordStatusKind` (ADR-074): **extended**. T1 adds the frontmatter quote rule and `active`; T2 adds the bullet arm.
- lifecycle `supersessionTarget` (`lifecycle.mjs:2828`): **reused unchanged**. It already reads a bare leading number (`0044`) and a number-first stem (`005-static-…`) as a record id. T3 feeds it the `superseded_by` value when the Status names nothing.
- record.py `first_reference`: **not reused**. Measured 2026-10-06, it returns None for `005-static-card-transitions-and-completion-cue`, `039-….md`, `0044` and `"0044"`, so it cannot read these spellings.
- adr-lint's frontmatter skip for titles (`adr-lint:4185`): **reused as the pattern** for finding the block. T1 adds one shared `frontmatter_block` / `frontmatterBlock` and does not copy the skip.
- work-next's `undecidedNamed` and corpus-probe's `undecided`: **reused**. They already name each undecided file under a record directory. T4 adds only files outside one.
- lifecycle `RECORD_DIRECTORY` (`lifecycle.mjs:2496`): **reused** as the definition of "inside a record directory" for T4.
- `tests/fixtures/corpora/go-module` with its `expected.json` and README row: **reused** as the pattern for T5's fixture.

## Decision

The rules are the spec's Facts F-1 to F-9. Every mapped value names its measured corpus, and every twin keeps today's reading. In short:

1. **Frontmatter is a named form.** A leading `---` block's `status:` key is the record's Status (F-1). Inside that block only, one enclosing pair of `"` or `'` and a trailing ` #` comment are removed before ADR-074 Decision 2 (F-2).
2. **`active` governs**, in every reader and in any case (F-3). A value that starts with `{` or `<` (a template placeholder) stays undecided, as do `final`, `experimental`, `draft-accepted` and `on hold` (F-7). Each is still named with today's reason.
3. **The MADR 2 bullet is a label above the first `##` heading** (F-4). Below that heading it is body text.
4. **`superseded_by` supplies a missing target.** For a graveyard record whose Status names no record, the frontmatter `superseded_by` value goes through `supersessionTarget` after quotes and a `.md` suffix are removed (F-5). `null`, `[]` and an empty value name nothing. `supersedes` is never read (F-6).
5. **A directory is never a Status** (F-8).
6. **Name, do not read, numbered files outside a record directory.** work-next and corpus-probe report `notRead`. It lists each tracked `.md` file that is outside every `RECORD_DIRECTORY`, has a basename matching `^[A-Za-z]*-?\d{2,}[-_]` and has a frontmatter `status:` key. work-next prints one line naming the count and the first three (F-9). `look` is unchanged: the readers did look, and ADR-005 does not let PARTIAL report a look that did not fail.

**What makes it fail.** Each task's test fails when its rule regresses, and each twin fails when the rule over-reaches. T5's corpus fails when any reader's answer on the authored shapes moves from what `expected.json` reviewed. The mapping is valid for the nine corpora above at the named HEADs. A corpus where `Active` means "under discussion" would read wrongly, and none of the nine is one. That is the open question below.

## Alternatives Considered

- **Do nothing, and document the unsupported shapes.** Rejected. The text readers already name every undecided file, so documentation adds nothing a session does not already see. The defect is the routing and the counts: three corpora with 32, 167 and 37 records in force get `next = adr-retire` and `governing 0` or close to it. Prose cannot change what a reader says, and MADR 4's own template writes the quoted form.
- **Map `active` only when it is written in frontmatter.** Not chosen yet; it is the spec's first Open Question. All four measured uses are frontmatter. One word set for every form is what keeps ADR-074's parity table a single lookup.
- **Read the directory as the Status** (dir-status-rfc). Rejected (F-8). The directory contradicts the file's own Status in 8 of 64 files, and none of the 64 is a record by ADR-074 Decision 5's content test.
- **Read `supersedes` as a reverse supersession.** Rejected (F-6). In active-status-adr, 28 of the 37 targets still govern by their own Status.
- **Turn `look` PARTIAL when files go unread.** Rejected. The readers looked. ADR-005 reserves PARTIAL for a look that could not be completed, and a verdict word for something not observed is the defect ADR-005 exists to stop.
- **Parse YAML.** Rejected. Neither Python's standard library nor Node has a YAML parser, and a dependency is out of proportion to two keys. Every measured `status` and `superseded_by` value sits on one line. The one block list seen, swift-adrs 009, is under `supersedes`, which is never read (F-6).
- **Remove quotes from every Status, not only frontmatter.** Rejected under CLAUDE.md §16: only the frontmatter form was measured, and `**Status:** "Accepted"` was seen in none of the nine corpora.

## Component / Boundary Impact

None — no module is added or moved. The changes stay inside the readers ADR-045 and ADR-074 already place: `plugin/lib/record.py`, `plugin/scripts/lifecycle.mjs`, `plugin/bin/adr-lint` (its not-recognised sentence lists the words acted on), `plugin/scripts/work-next.mjs` and `plugin/scripts/corpus-probe.mjs`.

## Wiring & Contract Changes

Inherited from docs/specs/2026-10-06-corpus-shapes-our-readers-misread.md §Contracts Touched; delta:

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `record.frontmatter_block(text)` / lifecycle `frontmatterBlock(text)` | new shared reader: the leading `---` block's line range, or none | T1 | T2, T3, T4 |
| adr-lint not-recognised sentence | its list of words acted on gains `Active` | T1 | adr-lint output, corpus-probe `reason` |
| `tests/fixtures/corpora/yaml-frontmatter/` and its README row | new consumer-shaped corpus | T5 | `tests/corpus-matrix.test.mjs` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `frontmatter_block` / `frontmatterBlock` | T1 | T2, T3, T4 | No — new |
| `active` in the word set; frontmatter quote rule | T1 | T5 | No — widens |
| bullet label | T2 | T5 | No — widens |
| `superseded_by` target | T3 | T5 | No — widens |
| work-next `notRead`, corpus-probe `notRead` | T4 | T5 | No — new field |

## Implementation

See `tasks/README.md`: T1 (frontmatter values and `active`), T2 (the MADR 2 bullet), T3 (`superseded_by`), T4 (numbered files outside a record directory), T5 (the fixture corpus).

## Consequences

- **Positive:** the four `active` corpora, the quoted MADR 4 corpus and the MADR 2 bullet corpus read their own records as governing. Every reader agrees, and the numbered RFC-style files are named instead of passed over.
- **Negative:**
  - A corpus whose `Active` does not mean in force now reads wrongly, and nothing measured shows one.
  - In swift-adrs, 20 of the 32 `active` records have no `## Context` or `## Decision` heading. adr-lint keeps calling those 20 not-recognised and lints the other 12. lifecycle lists all 32 as undecided today, and T5's `011` row shows whether it counts a headingless one once its Status reads.
  - Records that sat undecided start to govern, so their duplicate numbers (swift-adrs: 4) become identity collisions adr-state reports.
- **Neutral:**
  - `next` on swift-adrs most likely stays `adr-retire`, because its 29 superseded records are still in the active corpus. What changes is `accepted` and `governing`: from 0 to at least the 12 records that carry a heading.
  - The release notes name the new word, the quote rule and the bullet arm under "Changed".

## Out of Scope

Inherited from docs/specs/2026-10-06-corpus-shapes-our-readers-misread.md §Non-Goals; delta:
- Reading RFC-style corpora outside a record directory as records (permanent: boundary: ADR-074 Decision 5 defines a record by a Status plus a `## Context` or `## Decision` heading, and none of dir-status-rfc's 64 files has one; F-9 names them instead)
- A SessionStart line for undecided records (permanent: boundary: work-next and adr-state already name each one, and SessionStart is paid in every adopter session, CLAUDE.md §19)
- `implemented`, `final` and the other unmapped words (permanent: boundary: no measured corpus uses them as records; F-7 keeps them undecided and named)
- Quote removal outside a frontmatter block (permanent: boundary: unmeasured, CLAUDE.md §16)

## Risks

Inherited from the spec §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The bullet arm admits a list item as a Status in some corpus's header block | Low | Low | bounded above the first `##`, and placed under ADR-074's placement rule (only under a record directory), so no new file outside one is linted; T2's twin pins it |
| An outside run over another corpus finds a shape this table did not measure | Med | Low | the release that ships this asks for one outside run (CLAUDE.md §18), and the fixture's README row names the shapes covered |

## Rollback

`git revert` of the five task commits; nothing persistent changes. A corpus read under this record goes back to reading `active` as undecided.

## Follow-ups

- [x] The owner answers the spec's two Open Questions before this record is Accepted. (2026-10-07: row 7 at acceptance; row 8, naming RFC-style files is enough, confirmed by the owner on 2026-10-07.)
- [ ] After release, ask an outside runner to re-probe public/swift-adrs and public/active-status-adr without `--sweep`, and file the attestation (CLAUDE.md §18).
- [x] 2026-10-07, owner decision: a file adr-lint does not recognise as a record is not a record to any reader, applied literally (the owner confirmed the literal reading the same day). lifecycle's `adrCorpus` drops every listed file that fails adr-lint's rule (an `ADR-<n>`/`spec-<n>` name, or a Status plus a `## Context`/`## Decision` heading, written `**Status:**` outside a record directory, placed by its real path), before a frozen archive's catalog is asked: it is neither counted nor undecided, since undecided is a record whose status no reader acts on. work-next's `notRead` names it. The yaml-frontmatter fixture's `011` (was governing) and `013` (was undecided) move to `notRead`. A file that could not be read stays named as unread. Tests: tests/corpus-shapes.test.mjs "a file adr-lint does not recognise is counted by no reader and named as not read", "a not-recognised file that cannot be read is still named as unread, never dropped".
- [x] 2026-10-07, owner-approved relock: the literal rule changes three locked tests in tests/corpus-shapes.test.mjs — "a status bullet inside a section is not the record status" and "an unnumbered note or a record inside a record directory is not named as not read" (named in the owner's approval), and "a directory name is never a status" (the same rule's consequence, not named in it) — so T1-T4 were relocked with `adr-verify --relock --replace-hashes`.
- [x] 2026-10-07, a gpt-6.1-sol delta review of the owner's decision, four findings, fixed in lifecycle and work-next: (1) a frozen archive's catalog no longer bypasses recognition; (2) placement is judged on the real path, as adr-lint judges it; (3) the heading's whitespace and line start are spelled as Python's `\s` and `^` read them; (4) a cut head is read to its last complete line. Tests in tests/corpus-shapes.test.mjs: "a frozen archive catalog does not make a not-recognised file a record", "a link to a record is placed where its target is kept, as adr-lint places it", "a heading after whitespace only one runtime calls whitespace is read alike by every reader", "a 64 KiB cut that ends on three dashes is not read as the closing delimiter".
- [x] 2026-10-07, the owner's rule that nothing found along the way is left open: (1) a `Status:` label indented by four spaces or a tab, an indented code block, is no longer read as the Status in record.py (so adr-lint, adr-next, adr-retire-check) or lifecycle, as the MADR 2 bullet already was not; (2) adr-state names the files the corpus reader dropped, in its JSON `notRead` and its text. Tests in tests/corpus-shapes.test.mjs: "a Status line in an indented code block is not the record status", "adr-state names the files no reader counts".
- [x] 2026-10-07, the delta review's finding 2, second half: `onceByRealPath` keeps the path with fewer links anywhere in it — a linked file or a linked parent directory — over one listed before it, and names the other as the alias, for every reader that dedups through it (lifecycle's records and task directories, work-next's task files); paths with as many links keep the first listed. Tests in tests/corpus-shapes.test.mjs: "a link and its target are read once, as the target, and the link is the alias", "a path through a linked parent directory is the alias of the path with no link in it".
- [x] 2026-10-07, found by the full gate after the literal rule: corpus-probe lints the files the corpus reader dropped as well, so adr-lint's not-recognised verdict and what each file lacks stay beside `notRead` (tests/not-recognised-reason.test.mjs, tests/chaos-315-probe.test.mjs, tests/one-unreadable-task.test.mjs pass unchanged); tests/record-budget.test.mjs "a record named with the ADR prefix is found at any width, and a bare short number is not" gives `adr_3-c.md` a `## Decision`, since adr-lint reads no `ADR-<n>` name in `adr_3` and the bare-Status file is no record to it.
- [x] 2026-10-07, a gpt-6.1-sol review of df605f89, six findings, fixed in record.py, lifecycle and work-next: (1) an indented line in the frontmatter is never the Status; (2) a MADR 2 bullet is indented by at most three spaces; (3) a numbered headingless `active` file outside a record directory is the owner's decision above; (4) the not-read look reads 64 KiB rather than 64 lines and says a frontmatter past that as PARTIAL; (5) `superseded by` naming no record falls back to `superseded_by`; (6) the not-read look opens only a regular file. Tests in tests/corpus-shapes.test.mjs: "a status inside a frontmatter literal block is not the record status", "a status bullet in an indented code block is not the record status", "a numbered file whose frontmatter runs past 64 lines is named, and past the budget is PARTIAL", "a superseded status that names no record takes its target from superseded_by", "a FIFO in place of a numbered file is not opened by the not-read look".
