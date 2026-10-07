# Spec: Read the Status shapes measured in public corpora, and name the files left unread

> **Date:** 2026-10-06 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-087 (`docs/adr/ADR-087-measured-status-shapes-are-read.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** docs/adr/ADR-074-one-status-reading-and-one-record-definition.md, docs/adr/ADR-063-a-record-is-its-number-or-its-stem.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/BACKLOG.md

## Problem

Public corpora keep their Status in shapes the readers misread. Measured 2026-10-06 at 73f930f, without `--sweep`: 241 records that say `active` read as undecided across four corpora, 15 records that say `"accepted"` read as undecided, and 29 MADR 2 bullet Statuses read as "no status line". work-next routes four of those corpora to `adr-retire` while most of their records are in force. A corpus kept outside any `adr` or `decisions` directory (public/dir-status-rfc, 64 `RFC*.md` files) gets `look: ok` and nothing else (docs/BACKLOG.md §353, §354).

## Goal

Every shape in the Facts table is read as the Fact says on its measured corpus, every twin keeps today's reading, and a numbered file with a frontmatter `status:` outside a record directory is named, not passed over in silence.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopter session | system | ask work-next, adr-state, adr-lint and adr-context what governs a corpus, and get an answer that matches the corpus's own words |
| outside runner | human role | run `corpus-probe --json` over a corpus we do not own and see what was read and what was not |

## Use Cases

### UC-1: adopter session reads a corpus written in a measured shape

- **Trigger:** work-next, adr-state, adr-lint or adr-context runs over the corpus · **Preconditions:** the records sit under an `adr` or `decisions` directory
- **Main flow:**
  1. Each reader takes the Status from the frontmatter, inline, bullet or section form.
  2. Each reader looks the value's first word up in the one fixed set (ADR-074 Decision 3, plus `active`).
  3. A graveyard record names its replacement from its Status, or from its frontmatter `superseded_by`.
- **Failure paths:** a. at step 2, the value is a template placeholder or a word outside the set → the record stays undecided and is named with today's reason.
- **Postconditions:** the governing and graveyard counts match the corpus's own Status words.

### UC-2: outside runner probes a corpus kept outside a record directory

- **Trigger:** `corpus-probe --json` or work-next runs over the repository · **Preconditions:** no `adr` or `decisions` directory holds records
- **Main flow:**
  1. work-next lists tracked `.md` files outside any record directory whose name starts with a number (after an optional letter prefix) and whose frontmatter has a `status:` key.
  2. work-next and the probe name them as not read.
- **Failure paths:** a. at step 1, an unnumbered note carries a frontmatter `status:` → it is not named.
- **Postconditions:** `look` is unchanged; the files that were not read are named.

## Scenarios

### UC1-S1 [happy] a frontmatter active record governs [@implemented] → `tests/corpus-shapes.test.mjs::a frontmatter status is read as its corpora write it`

```gherkin
Given a record under docs/decisions whose frontmatter says status: active
When adr-state and work-next read the corpus
Then the record is counted governing by both
```

### UC1-S2 [failure] a placeholder or unmapped Status stays undecided and is named [@implemented] → `tests/corpus-shapes.test.mjs::a placeholder or an unmapped status stays undecided and is named`

```gherkin
Given a record whose frontmatter says status: "{proposed | rejected | accepted}"
When adr-state and work-next read the corpus
Then the record is undecided, and both name it with the reason they give today
```

### UC2-S1 [happy] a numbered file outside a record directory is named as not read [@implemented] → `tests/corpus-shapes.test.mjs::a numbered file with a frontmatter status outside a record directory is named as not read`

```gherkin
Given Final/RFC0001-x.md with frontmatter Status: Final and no adr or decisions directory
When work-next and corpus-probe run
Then both name Final/RFC0001-x.md as not read, and look stays ok
```

### UC2-S2 [failure] an unnumbered note with a frontmatter status is not named [@implemented] → `tests/corpus-shapes.test.mjs::an unnumbered note or a record inside a record directory is not named as not read`

```gherkin
Given vault/note.md with frontmatter status: draft
When work-next and corpus-probe run
Then neither names vault/note.md
```

## Facts

Each mapped value names the corpus it was measured on, at a shallow clone's HEAD, 2026-10-06. Each twin row is a shape that must keep today's reading.

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | A `status:` key in a leading YAML frontmatter block is the record's Status, read by ADR-074 Decision 1's label arm. That arm already matches it; this Fact names the form so it is tested on purpose (public/swift-adrs b2177fb: 61 records). | `tests/corpus-shapes.test.mjs::a frontmatter status is read as its corpora write it` | @implemented | |
| F-2 | Inside the frontmatter only, a value wholly inside one matching pair of `"` or `'` is read without them, and a ` #` comment after the value is dropped. `status: "accepted"` governs (public/quoted-status-adr 20179f4: 15 records; public/active-status-adr 52d16a6: 1 `"active"`). Twins: `status: "{proposed \| rejected \| accepted \| deprecated \| … \| superseded by ADR-0123}"` stays undecided, and `**Status:** "Accepted"` outside a frontmatter block stays undecided. | `tests/corpus-shapes.test.mjs::a frontmatter status is read as its corpora write it` | @implemented | |
| F-3 | `active`, in any case, governs in every reader (swift-adrs 32; active-status-adr 167; public/frontmatter-adr 12e023b, 37; public/small-active-adr 8d92d2d, 5 `Active`). Across swift-adrs and active-status-adr, no `active` record names a `superseded_by` successor and every `superseded` one does. Twin: `{Active\|Superseded}` (small-active-adr's template) stays undecided. | `tests/corpus-shapes.test.mjs::a frontmatter status is read as its corpora write it` | @implemented | |
| F-4 | A bullet `* Status: <value>` or `- Status: <value>` above the first level-2 heading is a Status label, matched case-insensitively as Decision 1's label is (public/star-status-adr b6001f0: 29 records, 26 `accepted`, 2 `proposed`, 1 template). Twin: the same bullet below the first `## ` heading is not the record's Status. | `tests/corpus-shapes.test.mjs::a MADR 2 bullet status is read above the first section` | @implemented | |
| F-5 | For a graveyard record whose Status names no record, a frontmatter `superseded_by:` value names the replacement, by the identity rule `supersessionTarget` already applies (ADR-063). Three spellings were measured: a bare stem (`005-static-card-…`, swift-adrs), a stem with `.md` (swift-adrs 008), and a quoted bare number (`"0044"`, active-status-adr). Twins: `null`, `[]` and an empty value name nothing; on a governing record the key changes nothing. | `tests/corpus-shapes.test.mjs::a frontmatter superseded_by names the replacement in the three measured spellings` | @implemented | |
| F-6 | A frontmatter `supersedes:` is never read. In active-status-adr, 28 of the 37 records it names still say `active`, so there it does not mean replaced. | `tests/corpus-shapes.test.mjs::supersedes is never read and superseded_by never moves a governing record` | @implemented | |
| F-7 | These values stay undecided and keep today's reason: `final`, `experimental`, `draft-accepted` (public/dir-status-rfc ccc7819), `on hold` (public/template-adr ba75bb1, 1 record), and any value starting with `{` or `<`. | `tests/corpus-shapes.test.mjs::a placeholder or an unmapped status stays undecided and is named` | @implemented | |
| F-8 | A directory name is never a Status. In dir-status-rfc the directory and the file's own `Status:` disagree in 8 of 64 `RFC*.md` files, and none of the 64 has a `## Context` or `## Decision` heading. | `tests/corpus-shapes.test.mjs::a directory name is never a status` | @implemented | |
| F-9 | work-next and corpus-probe name every tracked `.md` file outside any record directory whose basename matches `^[A-Za-z]*-?\d{2,}[-_]` and whose frontmatter has a `status:` key, as not read. `look` is unchanged. Measured: dir-status-rfc 63 such files; 0 in the other eight public corpora above, in public/swift-adrs's `docs/`, and in this repository. Twin: an unnumbered file with a frontmatter `status:` (active-status-adr's 14 vault and fixture notes, public/template-adr's 3 templates) is not named. | `tests/corpus-shapes.test.mjs::a numbered file with a frontmatter status outside a record directory is named as not read` | @implemented | |

## Domain

A record's Status has four written forms: frontmatter, inline label, bullet label and `## Status` section. The first one found wins, and its first word is looked up in one set. A graveyard record's replacement comes from its Status value, or from frontmatter `superseded_by` when the value names none. A record directory is an `adr` or `decisions` directory, or an archive of one (lifecycle `RECORD_DIRECTORY`).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `record.status_kind` / lifecycle `recordStatusKind` word set | adds `active` → governing | adr-lint, adr-next, adr-retire-check, adr-state, work-next, adr-context, SessionStart |
| `record.record_status` / lifecycle `inlineStatus` | frontmatter quotes and comment; bullet label above the first `##` | the same |
| lifecycle `supersessionTarget` input | frontmatter `superseded_by` when the Status names none | adr-state `danglingSupersession`, adr-context, work-next `retirable` |
| work-next JSON `notRead`, text line; corpus-probe `notRead` | new field | outside runners, `corpus-probe --diff`, `tests/fixtures/corpora/*/expected.json` |

## Non-Goals

- Reading dir-status-rfc-style corpora (RFC files outside a record directory, no `## Context` or `## Decision`) as records. F-9 names them; reading them would need a record definition ADR-074 Decision 5 does not have.
- A YAML parser. Only the `status` and `superseded_by` keys are read, line by line.
- SessionStart lines for undecided records. work-next and adr-state already name each one, and SessionStart is paid in every adopter session (CLAUDE.md §19).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A corpus where `Status: Active` means "under discussion" now governs | Low | Med | measured on four corpora where it means in force; the release notes name the new word |
| adr-lint and lifecycle split on a headingless `active` record (swift-adrs: 20 of 32 have no `## Context` or `## Decision`; adr-lint calls them not-recognised, and lifecycle lists all 32 as undecided) | Med | Low | the fixture carries one, and `expected.json` records the split under `disagreements` if one remains |
| Duplicate record numbers (swift-adrs: 4) begin to govern and collide in identity | Med | Low | the fixture carries a duplicate number, and adr-state's answer for it is reviewed in `expected.json` |

## Open Questions


## Verify

```bash
spec-verify --spec docs/specs/2026-10-06-corpus-shapes-our-readers-misread.md
```

## Grill Log (appendix)

Each decision below is the drafter's proposal from the measurements, and awaits the owner's answer.

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Does `active` govern? | F-3 | Yes, in every reader. Four corpora use it to mean in force. |
| 2 | Are YAML quotes markup? | F-2 | Only inside a frontmatter block, where YAML puts them. |
| 3 | Does `supersedes` move another record's kind? | F-6 | No. active-status-adr uses it for records that still govern. |
| 4 | Is a directory a Status? | F-8 | No. dir-status-rfc's directories contradict their own files. |
| 5 | Does an unread corpus outside a record directory turn `look` PARTIAL? | F-9 | No. The readers looked, so PARTIAL would report a look that did not fail (ADR-005). They name the files instead. |
| 6 | Is the MADR 2 bullet a label? | F-4 | Yes, above the first `##` heading only. |
| 7 | Should `active` govern only in frontmatter? | F-3 | No: the owner accepted ADR-087 with `active` read as a status in every form. |
| 8 | Is naming RFC-style files (F-9) enough? | F-9 | For this record, yes: ADR-087 was accepted with reading them as records under Out of Scope, so a later record would have to define an RFC corpus. |
