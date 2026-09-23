# ADR-063: A record is its number, or its stem

**Status:** Accepted
**Date:** 2026-09-22
**Owner:** zy
**Spec:** None — no spec stage. On 2026-09-22 the owner decided to accept an adopter's record naming instead of requiring it to be converted, with no configuration option, and scoped this to the retire family and its readers. After the cold review the owner decided the identity rule: only a date-shaped name is identified by its stem; an `NNN-slug` name keeps its number.
**Cross-references:** ADR-005, ADR-011, ADR-024, ADR-045
**Governs:** `plugin/bin/adr-retire-check`, `plugin/lib/record.py`, `plugin/bin/adr-lint`, `plugin/scripts/lifecycle.mjs`, `plugin/scripts/adr-state.mjs`, `plugin/bin/adr-verify`, `plugin/templates/adr-archive-readme-template.md`, `plugin/skills/adr-retire/SKILL.md`
**Enforced-by:** `tests/record-identity.test.mjs::a date-slug archive passes adr-retire-check with each record named by its stem`
**Invalidates:** none — checked
**Served-path change:** An archive whose records are named `YYYY-MM-DD-slug.md` passes `adr-retire-check`, and the lifecycle's corpus reader lists those records, active and archived, where both answered "no ADR id" or nothing before. Records named `ADR-NNN-slug.md` read exactly as they do now. Records named `NNN-slug.md` keep their numbers, and become visible to `adr-retire-check`, which today enumerates only `ADR-*.md` and so fails an `NNN-slug` archive.

## Context

The TakeOnline infrastructure repository names its active records `YYYY-MM-DD-slug.md`, and on 2026-09-22 retired one exactly as `adr-retire` prescribes. `adr-retire-check` then printed `[FAIL] · 0 active · 0 archived · 0 governing` and `archive catalog row has no ADR id` (commit bf2c3c5 there). The PreToolUse artifact hook repeats that FAIL on every Bash call that touches those files, ending "Fix the artifact, not the gate". The only artifact fix available is renumbering frozen records.

No record in this corpus decides what a record's name must be. `plugin/skills/adr-write/SKILL.md:73` tells adopters "match existing repo naming". The rule lives only in code, re-implemented per gate, and this class has been repaired in place four times: BACKLOG §55 (a corpus the reader could not open), §66 (a record answered with another record's tasks), §190 (`NNN-slug` corpora invisible to three checks), and §192/§193 (a date read as a record number; a name-shaped year guard wrong in both directions). `adr-retire-check` is the member none of those fixes reached.

The class, enumerated on 2026-09-22 with:

    git grep -nE 'ADR[-_ ]?\??\??[(\[]?\\d|ADR-\\d|\(\\d\{[0-9],?[0-9]?\}\)|\(\?:adr\[' -- plugin/bin plugin/lib plugin/scripts

That command returned 27 lines in 7 files: `adr-lint` 10, `lifecycle.mjs` 7, `adr-retire-check` 3, `adr-debt` 2, `adr-next` 2, `adr-verify` 2, `run-shell-hook.mjs` 1. One of the 27, `run-shell-hook.mjs:526`, is a false positive (it matches a git file mode). The command cannot see a glob or a regex assembled from a template, and two cold reviews found seven such members by reading: `adr-next:503` (`glob("ADR-*.md")`), `plugin/scripts/corpus-report.mjs:76`, `plugin/scripts/eval-fixture.mjs:68` (`/^ADR[-_]?\d/`), `lifecycle.mjs:1816` (`ADR[-_ ]?0*${number}`), `facts-gate-dispatch.sh:258` (`ADR-*.md`), `plugin/scripts/adr-state.mjs:42/64/73` (`byNumber`), and lifecycle's path-segment rule `looksLikeRecord` (`:1640`, a directory named exactly `adr`).

The members this record takes:

- `plugin/bin/adr-retire-check`: `ADR_ID_RE` (`:61`) and every caller of it; active-corpus enumeration by `rglob("ADR-*.md")` (`:144`); catalog-row ids (`:233`); decision units (`:276`); obligations (`:165`); receipts (`:188-199`); `superseded by ADR-\d+` (`:537`); and `adoption_report` (`:315`), which `--adopt` and `qh-mcp` reach through the same functions.
- `plugin/scripts/lifecycle.mjs`: `ADR_FILE` (`:1280`) and `adrNumber` (`:1527`), whose date guard `^(?!\d{4}-\d{2}-\d{2})` excludes only hyphens; `recordFilesFromListing` (`:1648`) with `looksLikeRecord` (`:1639`), which never admits a record under `docs/adr-archive/`; `ARCHIVE_EFFECT` (`:1337`), `archiveDecisionEffect` (`:1351`) and the catalog-row link (`:1367`); the task claim at `:1816`; and `supersededBy` (`:1835`), which returns `"2026"` for a record superseded by a dated one, measured on two real TakeOnline records on 2026-09-22.
- `plugin/scripts/adr-state.mjs:42/64/73`: `byNumber`, so a supersession by a stem reads as dangling.
- `plugin/bin/adr-verify:2006` `record_number_of`: an unanchored `re.search(r"(?:adr[-_]?)?(\d{3,4})[-._]")` that reads `2026-07-15-x` as 2026. It feeds only `demoted_by` (`:2010`), where 2026 sits above any realistic `strictFrom` and so errs strict. A guard that stays unanchored moves the match one character on, to `026`, and reads 26, below any realistic cutoff, which demotes the task: the fail-open direction. The hyphen-only guard lifecycle uses does that on the hyphen spelling and still reads 2026 on `_` and `.`. Measured with the regex on 2026-09-22.

Who a change can affect, counted on 2026-09-22 across this machine's corpora: one date-slug corpus (TakeOnline infrastructure), one `NNN-slug` corpus (wcag, whose files are `001-slug.md` titled `# ADR-001: …`), and every other corpus numbered `ADR-NNN`, this one included. Only the first reads differently after this record.

## Existing Primitives Audit

- adr-lint already carries the rule this record needs, in three regexes: `RECORD_FILE_RE` `^(?:adr[-_]?)?(\d{1,4})[-._]`, `TASK_SHAPED_RE`, and `DATE_SHAPED_RE` `^\d{4}[-_.]\d{1,2}[-_.]` (`plugin/bin/adr-lint:3780-3784`). Its comment at `:3769-3779` and BACKLOG §193 record why a `(?:19|20)` year anchor was rejected: it admitted `1899-9-9-notes.md` and excluded a real `2000-13-x.md`. Reuse, by moving the three into `plugin/lib/record.py`, the shared grammar every Python gate loads (ADR-045), unchanged, with adr-lint importing them.
- The content test for "is this file a record" (a Status line plus `## Context` or `## Decision`) is lifecycle's `looksLikeRecord` (`lifecycle.mjs:1639-1646`), from BACKLOG §55. adr-lint's `record_files` (`:3819`) is name-based. `adr-retire-check` adopts the content test, without the `adr` path-segment condition, which is exactly what excludes an archive. Reuse.
- `underFrozenArchive` (`lifecycle.mjs:1031`) already decides, from the Lifecycle marker, whether a directory sits under a frozen archive; the task scanner trusts it. The corpus reader reuses it to admit archived records, rather than widening a directory-name rule. Reuse.
- `tests/archive-history-parity.test.mjs` already pins two implementations of one archive question to one answer. The JS and Python identity rules are pinned the same way. Reuse the pattern.
- `lifecycle.mjs` cannot import Python, so it keeps its own copy of the identity rule, pinned to the Python one by one fixture table. Reshape.

## Decision

A record's identity is decided in this order:

1. Its title, meaning the file's first `# ` heading line, when that line is `# ADR-N…`, is not task-shaped, and its number is not itself date-shaped: number `N`. So `# ADR 2026-07-15: …` gives no number from the title, and the name decides.
2. Otherwise its filename, when the name matches `RECORD_FILE_RE` and is neither `DATE_SHAPED_RE` nor `TASK_SHAPED_RE`: that number. So `ADR-012-x.md` and `012-color-contrast.md` are record 12, as adr-lint, adr-next and lifecycle read them today (§190). `adr_12_x.md` is record 12 too, as adr-lint reads it; adr-next and lifecycle do not read that spelling today, and aligning them is §252's.
3. Otherwise, when the name is `DATE_SHAPED_RE`: its exact stem, the filename without `.md`. `2026-07-15-app-tier-provisioning-codification` is an id, and no number is ever read out of it.
4. Otherwise the file has no identity by name. A file the content test admits but that has no identity is reported as an `advice:` line naming it, never counted and never dropped silently; it does not fail the gate. `tasks/` directories stay excluded from record enumeration, as today.

Numbers compare as numbers (`ADR-012` is `ADR-12`); stems compare exactly, as git names the file.

A numbered reference keeps today's rule: an `ADR-N` token not preceded or followed by a letter, digit or `_` (`adr-retire-check:191`), so `ADR-012-T3` and `ADR-012/…` still name record 12. A stem reference names a record only as a whole token or a whole path component, where a token is a run of `[A-Za-z0-9._-]` with trailing `.`, `,`, `;`, `:` and `)` trimmed, after backticks, directories and the `.md` suffix are stripped, and with either path separator (CLAUDE.md §7). So `…-defer` never names `…-defer-flock`, and all of these name the same dated record: the bare stem, `` `<stem>.md` ``, `` `docs/adr/<stem>.md` (2026-07-12) ``, and `` `docs/adr-archive/<stem>/<stem>.md` ``. A receipt that carries the path needs no other spelling; prose such as `(ADR 2026-07-15 app-tier-…)` beside it is not itself a reference. This governs catalog-row links, BACKLOG receipts, and `superseded by <id>`.

A file that is not itself a record (a task, a plan, a note) belongs, first, to the record its own heading names (its first two lines, as `adr_id_for_file` reads them today); otherwise to the nearest ancestor directory, below the archive or corpus root and never above it, whose name carries an id by the rule above, whether or not that id is an enumerated record (so `ADR-001-unit/README.md` with no record file still belongs to ADR-001, as `tests/gate-regressions.py:1080-1087` pins). A loose sibling `<stem>.<suffix>.md`, such as `<stem>.queries.md`, belongs to `<stem>`.

**What would make it fail:** any `ADR-NNN` fixture whose `adr-retire-check` output, or whose `adrCorpus` entry, changes; and any `NNN-slug` record whose number changes. Every existing archive and corpus test is that control, and the numbered fixture asserts a golden PASS line and golden counts rather than comparing against an earlier commit. An `NNN-slug` archive is expected to change, from FAIL to PASS. The date-slug fixture is the new positive case, and it mirrors TakeOnline's per-ADR directory, including `tasks/`, a `WAVE3-PLAN.md`, a loose `.queries.md` sibling, two records whose stems share a prefix, and the receipt and supersession spellings quoted above. A catalog row, receipt or supersession that resolves to no record must still be refused, and that is asserted.

## Alternatives Considered

- **Every name without an ADR number is a stem, `NNN-slug` included.** Rejected by the owner on 2026-09-22, after the cold review. The retire gate would call `012-x.md` "012-x" while adr-lint, adr-next and lifecycle call it record 12: two identity rules for one file, which is the disagreement this record exists to remove.
- **Require `ADR-NNN` and have adopters renumber.** Rejected. It rewrites records this corpus treats as history (CLAUDE.md §10), and `adr-lint` and `adr-debt` already accept these names, so the retire gate is the one that disagrees.
- **Skip records the gate cannot identify.** Rejected. It would report `0 archived` and pass an archive it never read, which is the could-not-look-reported-as-clean shape ADR-005 exists to prevent. Today it at least fails loudly.
- **A `.quality-harness.json` option naming the id pattern.** Rejected. The naming is already supported by the sibling gates without configuration.
- **A year-anchored date guard, `(?:19|20)\d{2}`.** Rejected, again: BACKLOG §193 measured it wrong in both directions, and unanchored it makes `adr-verify` fail open.
- **Unify identity across every gate now.** Rejected for this record. `adr-lint`'s cross-reference enumeration, `adr-next`, `corpus-report.mjs` and `facts-gate-dispatch.sh` work for numbered and `NNN-slug` corpora today, and rewriting them risks reopening §66 or §190. They are deferred with a pointer.

## Component / Boundary Impact

- `plugin/lib/record.py` owns the identity rule and the reference rule; adr-lint imports the regexes from it and behaves unchanged.
- `adr-retire-check` consumes them, and no longer carries its own id regex.
- `lifecycle.mjs` keeps its own copy of the rule, pinned to the Python one; `adrCorpus` records gain an `id`, archived records are read from the catalog at their frozen-archive root, and `adr-state.mjs` keys supersession by it.
- `adr-verify` reads a record number through the Python rule.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Archive catalog row id (`docs/adr-archive/README.md` first cell) | an ADR id, OR a link whose target is a record by the reference rule | adopter | `adr-retire-check`, `lifecycle.mjs` archive reader |
| `Decision effect` grammar | `superseded by <ADR id, or a dated record's stem or path>` | adopter | `adr-retire-check`, `lifecycle.mjs`, `adr-state.mjs` |
| BACKLOG receipt | names its record by ADR id, stem, or path | adopter | `adr-retire-check` |
| `adrCorpus` record | gains `id` (a number or a stem); `supersededBy` becomes an id | `lifecycle.mjs` | `adr-state.mjs`, the session notes |
| `plugin/templates/adr-archive-readme-template.md` | documents both spellings | this plugin | adopters |

The grammar is widened only; every row valid today stays valid.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `record_id` / the reference rule in `plugin/lib/record.py`, the fixture corpora and the identity table in `tests/record-identity.test.mjs` | T1 | T2, T3 | No: T2 and T3 add cases to the same file |

## Implementation

See `tasks/README.md`: three tasks. T1 moves the rule into the shared library and changes the retire gate. T2 makes the lifecycle corpus reader list dated records, active and archived, and read them by id, with `adr-state` following. T3 makes `adr-verify` read a record number through the shared rule.

## Consequences

- **Positive:** TakeOnline's archive passes. The PreToolUse artifact hook stops repeating a false FAIL on those files. The retire gate stops disagreeing with its siblings, and `supersededBy` stops calling a dated record 2026.
- **Negative:** the identity rule has two copies, Python and JS, because the hook cannot import the gate library. One fixture table runs both; a divergence is a test failure, not silence.
- **Neutral:** `adr-verify` stops calling a dated record 2026. Its verdicts change only where `strictFrom` is above 2026, which no corpus uses today. `NNN-slug` records keep their numbers everywhere.

## Out of Scope

- Replacing the per-gate id rules in `adr-lint`'s cross-reference enumeration, `adr-next` (`:152`, `:503`), `adr-debt`, `corpus-report.mjs:68` and `facts-gate-dispatch.sh:258` with the shared rule (deferred: docs/BACKLOG.md §252)
- Telling adopters how to name new records (permanent: boundary: `adr-write` already says match existing repo naming, and this record removes a gate that contradicted it)
- A configuration option for the id pattern (permanent: boundary: the owner's decision of 2026-09-22; the naming is supported without one)

## Risks

- Reopening §66 or §190. Stems are taken only from date-shaped names; `NNN-slug` keeps its number; every naming shape has a fixture, and the numbered corpora are the control.
- A stem shared by an active and an archived record. `adr-retire-check:509-512` refuses a duplicate id across both trees today, correctly, and keeps refusing it: a retired record must not also be active.
- A four-digit numbered name whose slug starts with a number, such as `0012-3-tier-cache.md` or `0007-12-factor-config.md`, matches `DATE_SHAPED_RE` and so becomes a stem. The owner kept adr-lint's date shape on 2026-09-22 rather than tighten it: lifecycle reads such a name as record 12 today and will read it as a stem, adr-lint already treats it as ambiguous and asks the title, and a title `# ADR-12` still gives 12 by step 1. A fixture pins the stem so the behaviour is chosen, not accidental.
- A name like `ADR-2026-07-15-x.md` or a year-sequence `ADR-2026-001-x.md` carries an ADR prefix, so step 2 reads 2026, as every gate does today, and two such names collide as duplicate ids. This record does not change that; it is named here so the invariant "no number from a date-shaped name" is not read as covering it.
- adr-lint's `record_files` (`:3864-3871`) drops a date-shaped name titled `# ADR-5`, because the title's 5 is not the name's 2026, while step 1 gives it 5. That divergence is left to §252.
- A prefix collision between two stems. The reference rule matches whole tokens only, and the fixture carries the real pair.
- The JS copy drifting from the Python rule. Both run on one fixture table in one test file.
- Case and separators. Stems compare exactly as git names them; references accept either separator; a Windows peer run covers the fixtures before release.

## Rollback

Revert the commits. The catalog grammar is only widened, so no archive written under the old grammar becomes invalid, and none written under the new one is read by anything else.

## Follow-ups

- [ ] Notify the TakeOnline infrastructure session with the release that carries this, so it can compare its hand-computed digest `b8a1842a…ec37` and drop its catalog limitation note.
