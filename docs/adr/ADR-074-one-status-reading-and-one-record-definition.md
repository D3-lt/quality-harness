# ADR-074: One Status reading and one record definition for every reader

**Status:** Accepted
**Date:** 2026-09-29
**Owner:** Zy
**Spec:** None — no spec stage; the owner's decisions of 2026-09-29 (palace drawer fba1f967, revised the same day after a cold review), BACKLOG §313, §320.1 and §321
**Cross-references:** docs/adr/ADR-045-one-record-grammar.md, docs/adr/ADR-063-a-record-is-its-number-or-its-stem.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** `tests/status-reading.test.mjs::every reader gives one Status the same reading`
**Invalidates:** none — checked. ADR-063's markup rule (`_Accepted_(2026-07-15)` governs, `_Superseded by ADR-004_` names ADR-004) is kept and extended to every reader; its identity order is unchanged. The 3.1.5 Status advice's markup clause (`tests/chaos-315-codex-status.test.mjs`) is rewritten by T1, because the readers it described as disagreeing no longer do.
**Served-path change:** adr-lint, adr-next and adr-retire-check read a Status as lifecycle already does; lifecycle stops calling `Acceptedé` Accepted; adr-lint stops linting a report named `adr<digit>…`. Named under "Changed" in the release notes.

## Context

The readers disagree about one Status, and about what a record is. Measured 2026-09-29 at ebfaee0 (the Codex round on ffd4892, its #5; BACKLOG §321; a cold review of this record):
- **Markup.** lifecycle's `recordStatus` removes every `*`, `_` and backtick, as ADR-063 decided and pins in `tests/record-identity.test.mjs`. adr-lint and adr-next trim `*` and backticks from the edges only. So `_Accepted_` governs in lifecycle and is undecided in adr-next and adr-lint.
- **The word end.** lifecycle's `statusKind` uses JS's ASCII `\b`; the Python readers use Python's Unicode `\b` with `re.I`, whose case folding differs from JS `/iu` (measured: `Wıthdrawn`, U+0131). So `Acceptedé` governs in lifecycle and not elsewhere.
- **The label.** adr-lint reads only `**Status:**`; lifecycle, adr-next, record.py and adr-retire-check also accept `Status:` and `**Status**:`. So `Status: Proposed` over a done task passes adr-lint's execution check while lifecycle reads it as Proposed.
- **Exactness.** adr-retire-check's `is_accepted_status` accepts only an exact `accepted`, so `Accepted (Zy, 2026-09-01)` has no authority there and does everywhere else (BACKLOG §313's open question).
- **What is a record.** adr-lint's not-recognised guard admits any `(?:adr|spec)[-_]?\d` name, so it lints `docs/evaluations/adr018-chaos.md` and `adr002_codex_review_round1_20260707.md`, reports about records, as records (§320.1, two corpora). A record keeping its status in a `## Status` section is read by lifecycle and not by adr-lint (the PHP/Laravel corpus).
- **Human proof.** A step marked `[proof: human: …]` with no human-observed sign-off does not stop `done`, and no reader mentions it (§319's addendum).

The owner decided, 2026-09-29: one reading everywhere, markup-aware, as ADR-063 already reads it; a record by name alone only for the canonical `ADR-<n>`; `## Status` sections read by adr-lint; the human-proof gap said as advice.

**The class: every reader of a record's Status.** Enumerated with `git ls-files plugin/bin plugin/lib plugin/scripts | mrw read --files-from - --grep 'Status:\?|statusKind\(|record_undecided\(|RECORD_STATUS_WORDS|isPending|is_accepted_status|status_of\('` on 2026-09-29. The members are:
- adr-lint: `check_adr` (its missing, empty and unrecognised arms), `check_status_allows_execution`, the not-recognised guard in `main`, and the no-tasks advice.
- adr-next: `owning_record` and `record_undecided`.
- adr-retire-check: `status_of` and `is_accepted_status`.
- record.py: `_RECORD_STATUS`.
- lifecycle: `rawStatus`, `recordStatus`, `statusKind`, `markdownSection` and `looksLikeRecord`.
- adr-state: `isPending`.

Left out, on purpose:
- the task-status readers (adr-lint `terminal_task_status`, adr-next `task_status`);
- work-next's spec Status;
- arch-lint's architecture Status (arch-lint:536).
Each has a vocabulary of its own.

## Existing Primitives Audit

- `plugin/lib/record.py` is the shared record grammar (ADR-045), loaded by adr-lint, adr-next and adr-verify. **Extended** with `record_status(text)` and `status_kind(value)`; adr-retire-check loads it too.
- lifecycle.mjs cannot import Python, so it keeps its own copy (ADR-063's choice for identity). **Reshaped** to the same rule, pinned to the Python one by one fixture table run through every reader.
- lifecycle's markup removal is ADR-063's. **Reused** as the rule for every reader.
- `tests/archive-history-parity.test.mjs` pins two implementations of one question. **Reused** as the pattern.
- lifecycle's `looksLikeRecord` (a Status plus `## Context` or `## Decision`, BACKLOG §55) is the content test for "is this a record". **Reused** by adr-lint's guard.
- adr-next already reads `[proof: human: …]` steps and `· human-observed ·` rows. **Reused**.

## Decision

1. **The label.** A record's Status is the value after the first line matching `Status` at line start, with optional `**` around it and an optional colon on either side of the `**` (the form lifecycle, adr-next and record.py already accept); or, when there is no such line, the first non-empty line of a level-2 `## Status` section outside a code fence.
2. **The value.** Every `*`, `_` and backtick is removed from the value, wherever it stands (ADR-063's rule). A supersession's target is then read from what remains, so `_Superseded by ADR-004_` names ADR-004.
3. **The kind.** The first run of Unicode letters and digits in the value is lower-cased and looked up in a fixed set: `accepted` governs; `proposed` and `draft` are pending; `superseded`, `withdrawn`, `rejected` and `deprecated` are the graveyard; any other run, or none, is undecided. It is a lookup, not a case-insensitive regex, so `Acceptedé` and `Wıthdrawn` are undecided in every reader and no case folding can differ between Python and JS.
4. **An inline line wins over a section.** When a record has both and they give different kinds, adr-lint advises.
5. **What is a record.** adr-lint lints a file as a record when its name starts with the canonical `ADR-<n>` token (case-insensitive, hyphen required, as record.py's `_NUMBERED_REF`), or when its content passes lifecycle's content test: a Status by Decision 1, plus a `## Context` or `## Decision` heading. `adr018-chaos.md` without that content is not-recognised. The guard's `spec` arm, which admits a spec to its own checks, is unchanged.
6. **A step-level human proof with no sign-off is advice.** adr-lint and adr-next say which step names `[proof: human: …]` when the task's log holds no `· human-observed ·` row. `done` keeps its rule.

**What makes it fail.** The parity table fails when any reader reads one row differently from the others. Each task's test fails when its reader regresses. The mutants break each rule.

## Alternatives Considered

- **Strict everywhere** (edge trim only). The owner chose it first. It was withdrawn the same day because it reverses ADR-063, whose tests pin markup-wrapped statuses as governing.
- **Leave the disagreement, with advice.** Rejected: two readers giving one record two answers is the defect.
- **A record by location only.** Rejected: it drops real records a corpus keeps elsewhere, and ADR-063 reads names, not places.
- **A `## Status` section alone admits a file to adr-lint.** Rejected: a backlog or a report with a Status heading would be linted as a record again (BACKLOG §141). The section counts only with `## Context` or `## Decision`, as lifecycle's content test already requires.
- **Block `done` on an unsigned human proof.** Rejected by the owner: a new refusal needs its own record and an opt-out (CLAUDE.md §3).

## Component / Boundary Impact

None — no module is added or moved. Every change is inside the readers ADR-045 and ADR-063 already place: `plugin/lib/record.py`, `plugin/bin/adr-lint`, `plugin/bin/adr-next`, `plugin/bin/adr-retire-check`, `plugin/scripts/lifecycle.mjs`, `plugin/scripts/adr-state.mjs`.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `record.record_status(text)` → `(value, source)`, source `inline` or `None` | new shared reader | T1 | adr-lint, adr-next, adr-retire-check |
| `record.status_kind(value)` | new shared rule | T1 | the same |
| `record_status` source `section` | a `## Status` section | T2 | adr-lint, adr-next |
| lifecycle `recordStatus` / `statusKind` / `markdownSection` | the same rule; a fence-aware level-2 section | T1, T2 | adrCorpus, adr-state, work-next, SessionStart |
| adr-lint advice | inline vs section disagreement; unsigned human proof | T2, T4 | adr-lint output |
| adr-lint not-recognised guard | canonical `ADR-<n>` name, or the content test | T3 | adr-lint verdict |
| adr-next note | an unsigned human-proof step | T4 | adr-next text and JSON |

## Inter-task Contracts

| Contract | Producer | Consumer |
|----------|----------|----------|
| `record_status(text)` and `status_kind(value)` | T1 | T2, T3 |
| `record_status` reading a section | T2 | T3 |

## Implementation

See `tasks/README.md`: T1 (the shared reader and the parity table), T2 (`## Status` sections), T3 (what is a record), T4 (the unsigned human proof).

## Consequences

- **Positive:** one Status gets one answer from every reader, and a report about a record is no longer linted as one.
- **Negative:**
  - `Acceptedé`-style values stop governing in lifecycle.
  - `Accepted (…)` starts carrying authority in adr-retire-check.
  - The release notes name both.
- **Neutral:** `**Accepted**`, `_Accepted_` and `Accepted (Zy, 2026-09-01)` read as Accepted, as lifecycle reads them today.

## Out of Scope

- Task-status, spec-status and architecture-status readers (permanent: boundary: each has its own vocabulary, named in Context)
- The `**Statusas:**` label boundary (deferred: docs/BACKLOG.md §321)
- Blocking `done` on an unsigned human proof (permanent: boundary: the owner chose advice, 2026-09-29)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Python and Node disagree on whether a new code point is a letter (CI pins Python 3.12, Unicode 15.0, and Node 24, Unicode 16.0; measured on U+1C89) | Low | Low | the parity table carries a U+1C89 row, and the skew is named here; the lookup compares one run, so only a letter added between the two versions can split them |
| A real record named `adr012-x.md` with no `## Context` or `## Decision` goes silent in adr-lint | Low | Low | lifecycle's content test would not admit it either; the two readers now agree |

## Rollback

`git revert` of the four task commits; nothing persistent changes.

## Follow-ups

- [ ] After release, ask the outside runner whose corpus uses `## Status` sections (the PHP/Laravel corpus) to confirm the section is read.
- [x] ADR-038 decision 4 is reversed for MADR records: a `## Status` section and a `## Context` under `docs/adr` read as a record and are linted, where ADR-038 called them not-recognised. The owner chose this record as written, 2026-09-29. This record's `Invalidates:` did not name ADR-038; its task T2's Tests row still names the removed test `a MADR file is not-recognised, not a failed record`, which adr-lint advises on and which is left as history. Spec 2026-09-09 F-15 and UC2-S2 are rebound to `a MADR record is linted as a record, and a file that is not one is still not-recognised`.
- [x] Decision 3 is read as the run the value STARTS with. Read as "the first run anywhere", `**Status：** Accepted` (a fullwidth colon) governed in every reader where every reader called it undecided at ebfaee0 — T1's stop condition.
- [x] Decision 5's content arm takes a placement rule (the owner, 2026-09-29): the exact `**Status:**` line admits a record anywhere, as §141's discriminator did, so the ADR template and a record named on the command line are still linted; every other Status form (`Status:`, `**Status**:`, a `## Status` section) admits one only under a directory named `adr` or `decisions`, or an archive of one, and never under `tasks/`. Measured over 3,756 tracked `.md` files in this machine's checkouts against the guard before T3: 5 newly linted (three MADR records, two the PHP/Laravel corpus decision records) and 166 no longer linted (reports, summaries, postmortems, specs outside a record directory, BACKLOG, task files — each with a `**Status:**` line and no `## Context` or `## Decision`).
