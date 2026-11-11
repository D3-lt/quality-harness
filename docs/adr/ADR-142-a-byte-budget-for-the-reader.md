# ADR-142: The decision readers bound their reads in bytes and say what they did not read

**Status:** Withdrawn
**Date:** 2026-11-10
**Owner:** Zy
**Spec:** None — no spec stage; docs/BACKLOG.md §443 is the input
**Cross-references:** docs/adr/ADR-092-one-definition-of-a-record.md, docs/adr/ADR-137-the-decision-context-hook-runs-in-the-core.md, docs/adr/ADR-138-ci-runs-the-outside-run.md, plugin/scripts/decision-corpus.mjs, core/hooks/decisioncorpus_read.go, CLAUDE.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; each adds catalogue mutants on the reads it bounds and the line it prints
**Invalidates:** none — checked; ADR-092 Decision 5 is amended (a look also stops at a byte budget, and a task file or README not read makes it PARTIAL) and ADR-137 Decision 1 is amended (the hook text gains one line, in both readers alike); no task of either changes
**Served-path change:** In a repository with a decision corpus, the decision context before an edit (the core's `dcDecisionContext`, Node's `decisionContext`) says `PARTIAL — what governs this file may be missing` whenever the look did not read something that could carry scope (a record, task file or README it could not read or refused past 512 KiB, or a record, screen or byte budget that stopped it), where today it says nothing; and adr-state, adr-context, work-next and corpus-probe stop reading a task file or README past 512 KiB and a look past 128 MiB

## Context

BACKLOG §443 (the Codex review of 8d872045..980dd773, ADR-137 part A2): both decision readers bound a look in time, not in
bytes. Re-read on 2026-11-10 at ca71fd49:

- The bounded reads: a record is read through `dcReadBounded(file, dcRecordLimit)` (core/hooks/decisioncorpus_read.go:71-92,
  :703) and `readRegularText(file, 512 * 1024)` (plugin/scripts/decision-corpus.mjs:1294, :1594), at most 200 records a look
  (`dcRecordBudget`, `RECORD_BUDGET` :309); the content screen streams at most 64 MiB (`dcScreenBudget`
  decisioncorpus_read.go:24, `SCREEN_BUDGET` decision-corpus.mjs:313).
- The unbounded reads: the cached reader reads a file whole, `os.ReadFile` in `dcReader.text` (core/hooks/decisioncorpus.go:1696-1716)
  and `readFileSync` in `corpusReader().text` (decision-corpus.mjs:1042-1045), each failure and success kept for the look. Its
  callers are task files (decisioncorpus_read.go:738, :758; decision-corpus.mjs:1657, :1699) and archive READMEs
  (decisioncorpus.go:1748, :1762, :1815; decision-corpus.mjs:698, :702, :715, :719). The archive-marker walk reads READMEs whole
  too: `readRegularText(readme)` with no limit (decision-corpus.mjs:114, :120), which Node's `adrCorpus` runs after its record
  loop through `unmarkedArchives` (:1801), outside `corpusReader`; and the core's `readRegularText` (core/hooks/orientation.go:163-173,
  callers :201, :234), which only SessionStart reaches (`unmarkedArchives`, orientation.go:467): `dcAdrCorpus` never calls it
  (`grep -n 'unmarkedArchives\|underFrozenArchive' core/hooks/*.go`, 2026-11-10: orientation.go only).
- Uncharged reads: a file under a record directory skips the screen (decision-corpus.mjs:1456-1459; decisioncorpus_read.go:366)
  and costs up to 512 KiB before recognition rejects it (decisioncorpus_read.go:720, decision-corpus.mjs:1623), and the record
  budget charges no rejected file. Ten thousand notes under docs/adr are about 5 GiB of reads. The core's hook is abandoned at
  10 s (`decisionReaderBudget`, core/hooks/pending.go:9) and its process exits, so time is bounded and memory is not.
- Silent scope loss, today: a task file that cannot be read gives its record none of its Affected Files and is dropped by the
  core (decisioncorpus_read.go:758-760) or kept only in `unreadTasks` by Node (decision-corpus.mjs:1699-1706), with look ok in
  both. A record stopped by the record or screen budget is named in `unreadable` with look PARTIAL, but `decisionContext`
  (decision-corpus.mjs:1926-1965) and the core's `context` (decisioncorpus_read.go:899-942) print neither look nor reason. So a
  file a record governs only through an unread task file, or only from beyond a budget, gets an empty decision context: the
  silence decision-corpus.mjs:1949-1953 warns against. A per-file limit alone would widen exactly that hole (the Codex review of
  this record, P1).

The class, enumerated 2026-11-10 at ca71fd49: `grep -n 'os\.ReadFile\|reader\.text(\|dcReadBounded(\|readRegularText('
core/hooks/decisioncorpus.go core/hooks/decisioncorpus_read.go core/hooks/orientation.go` (14 lines, the two definitions
included) and `grep -n 'readFileSync(\|readRegularText(\|reader\.text(' plugin/scripts/decision-corpus.mjs` (11 lines). Every
line is one of the reads above. Left out: work-next's own `readRegularText(file, 512 * 1024)` and `CANDIDATE_BYTES`
(plugin/scripts/work-next.mjs:179, :265), already bounded per file and outside a look.

What this repository costs, measured 2026-11-10 at ca71fd49 by wrapping `readSync` and `readFileSync` around one
`adrCorpus(root)` over git's listing (a scratch script, not committed): 140 records, look ok; 5,126,575 bytes through
`readSync` (3,221,131 of them the screen) and 6,770,013 through `readFileSync` in 440 cached reads, the largest a task file of
227,228 bytes. The largest listed README is docs/adr/README.md, 18,685 bytes.

The case spelling, measured 2026-11-10 on this Mac's case-insensitive APFS: for a file `d/ADR-001-x.md` asked as
`d/adr-001-x.md`, Go's `filepath.EvalSymlinks` returns the spelling asked, Node's `realpathSync.native` returns
`d/ADR-001-x.md`, and `os.SameFile` says the two are one file. `dcRealpath` (decisioncorpus.go:1436-1444) is
`nativeRealpath`, which is `EvalSymlinks` off Windows (core/hooks/realpath_unix.go:8) and the handle's final path on Windows
(BACKLOG §445). So an index listing one record in two case spellings is read once by Node and twice by the core
(`dcOnceByRealPath`, decisioncorpus_read.go:455-491, keyed at :478), and on macOS the core names the record twice.

## Existing Primitives Audit

- `dcReadBounded` / `readRegularText(file, limit)`: the per-file bound, refused by the bytes read, not a size asked first.
  Reused: the cached readers and the README walks call them instead of reading whole.
- `screenBudget` (`adrCorpus(root, { screenBudget })`, `dcAdrCorpus(root, tracked, screenBudget, platform)`): an injectable
  per-look byte budget whose spending names the first file it left and makes the look PARTIAL. Reused as the shape of the new
  aggregate: the same seam, the same `unreadable` entry with a reason, the same PARTIAL.
- `dcCorpusReader` / `corpusReader()`: one reader per look in both languages. Reshaped: it carries the look's byte counter and
  the list of files it could not read, and Node's `unmarkedArchives` is handed it when `adrCorpus` calls it.
- The UNPROVEN line of `decisionContext` (decision-corpus.mjs:1954-1958) and `context` (decisioncorpus_read.go:929): the
  existing way the hook says it could not tell. Reused as the model for the new line: one heading, the first cause, a count.
- `nativeRealpath` (realpath_windows.go:17): already canonical on Windows. Kept; the disk identity is added off Windows only.

## Decision

1. **A look that did not read something that could carry scope says so before the edit (mandatory).** Both readers keep,
   per look, an `incomplete` list in the order met: every file they could not read or refused that could carry scope — a
   record (the existing `unreadable` entries with a `reason` that are not aliases), a task file, a README read for a
   record's catalog (`catalogDirectoryFor` and `archiveDecisionEffect` in Node, `dcCatalogDirectoryFor` and
   `dcArchiveDecisionEffect` in the core, which both readers make for every record they read) — and the record, screen or
   byte budget that stopped the look. Only reads both readers make can enter it: Node's archive-marker walk
   (`unmarkedArchives` / `underFrozenArchive`, decision-corpus.mjs:99-126, :159-181, run at :1801) has no counterpart in the
   core's look, so a README that walk could not read or was refused never enters `incomplete`, `unreadable` or the look's
   PARTIAL; it is only `unknown` to the walk, as today. A non-empty list makes the look PARTIAL. Whenever it is non-empty,
   `decisionContext` and the core's `context` print, after every other group and whether or not any group printed,
   `PARTIAL — what governs this file may be missing: <reason> (<path relative to the root>)`, then `  (+N more)` when there are
   more, byte for byte alike. A look that read everything prints exactly what it prints today. This is not optional: the
   limits below turn a readable task file into an unread one, and without this line an accepted record's scope would vanish
   from the edit without a word (the Codex review of this record, P1). The list lives on the corpus, not on a record, so
   ADR-137's Node-only `unreadTasks` stays Node-only (Decision 5).
2. **A per-file bound on every read in a look.** The cached readers read through the bounded readers at 512 KiB
   (`dcRecordLimit`, the record limit): a task file or README past it is an error, cached like any failed read, treated as
   not read, and entered in `incomplete` with reason `over 512 KiB`. A README not read also makes `catalogDirectoryFor` stop at
   its directory and every record under it frozen with effect UNPROVEN, as an unreadable README does today
   (decision-corpus.mjs:703, :748, :754; decisioncorpus.go:1762, :1815). The walk goes up to the root, so a README over the
   limit anywhere between a record and the root does that to every record below it; the UNPROVEN reason names the size (`the
   README beside it runs past 512 KiB, so whether this is an archive is unknown`) instead of "could not be read", which it was
   not asked to be. The archive-marker walks (decision-corpus.mjs:114, :120; orientation.go:201, :234) take the same bound,
   and a README past it is `unknown`, as an unreadable one is.
3. **One byte budget per look, 128 MiB, over every read the look makes.** `adrCorpus(root, { byteBudget })` and
   `dcAdrCorpus(root, tracked, screenBudget, byteBudget, platform)` carry a counter charged at the read, by the bytes read,
   on a cache miss only: every record read (so a file recognition then rejects is charged), every cached read, and in Node the
   README reads of the `unmarkedArchives` walk that `adrCorpus` runs after its record loop (:1801), which is handed the look's
   reader instead of reading on its own. Those walk reads are charged, but a refusal or failure met there is not named: per
   Decision 1 it enters neither `unreadable` nor `incomplete`, so a budget first spent by the walk, after the record loop,
   leaves Node's answer as the core's. A read is refused, without opening the file, once the counter has reached the
   budget, so a look overshoots by at most one file (512 KiB). The first file refused by a read both readers make is named in
   `unreadable` (`byte budget: <N> bytes were read; this file and every later one were not read`) and in `incomplete`, the
   look is PARTIAL, and the record loop stops as it does at the record budget; the walk then finds every README `unknown`
   and names no archive, as ADR-092 Decision 11 does for an unknown one. The core's look has no such walk (Context), and
   SessionStart's walk is not a look, so it keeps only the per-file bound. The screen keeps its own 64 MiB: it streams and
   keeps nothing.
   The value: this repository's look read about 11.9 MB on 2026-11-10 (Context), 8.7 MB of it outside the screen; 128 MiB is
   about fifteen times that, and above the 100 MiB the record budget already allows record reads (200 × 512 KiB), so it binds
   only where cached reads and rejected files pile up. It fails, and says PARTIAL, on a corpus whose look reads more than
   128 MiB outside the screen — for example 2,100 task files of 64 KiB each, or 260 rejected half-megabyte notes under a record
   directory. No corpus we have run reaches it; the test that shows it spending injects a small budget.
4. **One identity per file on disk.** Off Windows, `dcOnceByRealPath` keys a file with one hard link by its device and inode,
   so two listed spellings of one directory entry are one file, as Node's `realpathSync.native` makes them; a file with more
   than one hard link keeps the real-path key, since Node keeps two hard links apart. Which spelling is kept is unchanged
   (`better()`, the name arm, then fewer links, then the first listed).
5. **No new record field in the core.** ADR-137 left `unreadTasks` and `taskFiles` Node-only because the hook never reads
   them (ADR-137 Context). The hook now needs to know that a task file was not read, not whose it was, so the corpus-level
   `incomplete` list of Decision 1 carries it in both readers and the per-record fields stay as ADR-137 left them.

What would make this fail: a parity or replay row where Node and the core disagree on a corpus holding an unreadable or
oversized task file, an oversized README, a spent byte, record or screen budget, or a case-variant listing; or a context that
is empty where any of those stood between the look and a governing record. Those corpora are built by the tests; none exists
in a corpus we own, which is why each task injects its own.

## Alternatives Considered

- **Limits now, the PARTIAL line as an owner's option later** (this record's first draft, Decision 5 open with T4 awaiting
  it). Rejected after the Codex review of the draft (P1): the limits create silent scope loss on their own, so a limit
  shipped without the line is a fail-open. The line is part of the decision and lands first (T4).
- **Say PARTIAL only for budgets, not for a task file or README that was not read.** Rejected for the same reason: an
  unreadable task file loses scope exactly as a budget does, and it is the case the per-file bound creates.
- **Per-file bound only.** Rejected: ten thousand files of 500 KiB pass it one by one, about 5 GiB a look.
- **Aggregate budget only.** Rejected: `os.ReadFile` and `readFileSync` read the whole file before a counter sees a byte, so
  one huge README spends memory past any aggregate.
- **Leave the `unmarkedArchives` walk outside the budget**, as the first draft did. Rejected (the Codex review, P2): it runs
  inside every `adrCorpus` look, after the loop, and would keep reading whole READMEs once the budget was spent.
- **Charge the screen's 64 MiB for everything.** Rejected: on this repository the screen streams 3.2 MB already, and one
  counter would let a large note tree starve the record reads that matter; two budgets each say which one ran out.
- **An aggregate set at 64 MiB.** Rejected: below the 100 MiB the record budget already permits, so a corpus of 200 large
  records that reads whole today would turn PARTIAL.
- **Read an oversized README as a stream for the Lifecycle line only.** Rejected for now: a second reader whose bytes still
  need charging, for a file no corpus we know holds; the UNPROVEN direction is the safe one (ADR-005).
- **A disk identity by device and inode for every file.** Rejected: Node keeps two hard links of one file apart, so the core
  would answer differently there.
- **Lower-case the real path where the filesystem folds case.** Rejected: APFS also ignores Unicode normalisation, which a
  lower-casing does not model; the inode answers what the disk says.
- **Give the core `unreadTasks`** as the BACKLOG framing suggested. Rejected: ADR-137 kept it Node-only for want of a reader;
  the corpus-level list answers what the hook needs (Decision 5).

## Component / Boundary Impact

None — internal to the decision readers (`plugin/scripts/decision-corpus.mjs`, `core/hooks/decisioncorpus*.go`) and the
archive-marker walks beside them (`core/hooks/orientation.go`). Each keeps one reason to change: what a look reads, and
saying what it did not.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| decision context text | the PARTIAL line when `incomplete` is non-empty | T4 | the agent's session before an edit; adr-context `--hook` |
| `incomplete` on the corpus (`adrCorpus(...).incomplete`, `dcCorpus.incomplete`) | new, non-enumerable in Node like `discovery` | T4 | the renderers; adr-state may print it later |
| look | PARTIAL also when a task file or README was not read | T4 | adr-state, work-next, corpus-probe |
| `adrCorpus(root, { byteBudget })` | new option, default 128 MiB | decision-corpus.mjs (T2) | adr-state, adr-context, work-next, corpus-probe, the parity tests |
| `dcAdrCorpus(root, tracked, screenBudget, byteBudget, platform)` | new argument | decisioncorpus_read.go (T2) | `dcDecisionContext`, the Go parity and replay tests |
| `unmarkedArchives(root, listing, recognised, reader)` | optional look reader | decision-corpus.mjs (T2) | `adrCorpus` (:1801); SessionStart callers pass none |
| `decisionContext(paths, root, corpus)` | optional corpus, as `decisionsGoverning` takes | decision-corpus.mjs (T4) | the new tests |
| `unreadable[].reason`, `incomplete[].reason` | new reasons: the README size, the byte budget | T1, T2 | adr-state, work-next, corpus-probe output |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `incomplete` and the PARTIAL line | T4 | T1, T2 | No — new |
| `tests/helpers/decision-rows.mjs` | T4 | T1, T2, T3 | No — new |
| `byteBudget` option and argument | T2 | — | No — new, defaulted |

## Implementation

See `ADR-142-a-byte-budget-for-the-reader/tasks/README.md`. Order: T4 (the line), then T1 (the per-file bound), then T2 (the
budget), with T3 (the identity) after T1.

## Consequences

- **Positive:** a look's memory is bounded (128 MiB plus one file); nothing a look leaves unread is silent at the edit; the
  core and Node name a case-variant listing alike.
- **Negative:** a corpus with a task file that cannot be read, or past a budget, prints the PARTIAL line on every edit until
  it is fixed; a README past 512 KiB between a record and the root makes every record below it UNPROVEN; the output of five
  readers changes, so a release needs CLAUDE.md §18's outside run.
- **Neutral:** no corpus measured so far reaches either bound; this repository's look reads everything, so its edits print
  nothing new.

## Out of Scope

- work-next's own per-file reads (plugin/scripts/work-next.mjs:179, :265) (permanent: boundary: already bounded at 512 KiB and `CANDIDATE_BYTES`, outside a look)
- A streamed Lifecycle-line read of an oversized README (permanent: boundary: Alternatives Considered — UNPROVEN is the safe direction, and a streamed reader is a second read to charge)
- The core carrying `unreadTasks` (permanent: boundary: ADR-137 kept it Node-only; Decision 5)
- A byte budget on SessionStart's archive walk (permanent: boundary: it is not a look; each README there is bounded at 512 KiB, Decision 2)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A persistently unreadable task file makes every edit print the PARTIAL line | Med | Low | The line names the file and the reason; it is the case where silence was wrong; it is one line (CLAUDE.md §19) |
| A look turned PARTIAL by an unread task file changes what work-next or adr-state say | Med | Med | T4 replays every fixture corpus and this repository through both renderers, and asks `scripts/test-locks.py` before any test changes; the outside run (§18) reads other corpora |
| A real root or docs README past 512 KiB makes a whole corpus UNPROVEN | Low | High | The reason names the size; this repository's largest is 18,685 bytes |
| 128 MiB is spent by a real corpus | Low | Med | It says PARTIAL at the edit and names the first file; the value is fifteen times this repository's look |
| A case-variant spelling of a hard-linked file is still named twice by the core | Low | Low | Named here; it needs a hard link and an index git would not usually build |
| Node and the core charge different byte counts (decoding, CR handling) | Med | Med | Both charge raw bytes read before decoding; a parity row spends the budget on the same file in both |
| A locked parity or replay test would have to change | Low | Low | New tests beside them; only unlocked helpers (dcpCorpusRecord, TestDecisionContextReplay) take the new argument |

## Rollback

Revert the tasks' commits: the line and the `incomplete` list go, the cached readers read whole again, the byte budget and its
reasons go, and `dcOnceByRealPath` keys by real path. No state is persisted.

## Follow-ups

- [x] CLAUDE.md §18 outside run before the release that carries these tasks (CI's outside-run job, ADR-138): moot, withdrawn unexecuted (Outcome)

## Outcome

Withdrawn 2026-11-11 before any task ran: the owner stopped development of quality-harness and froze the repository
(docs/BACKLOG.md §473). No code changed under this record; its tasks stay as written, unexecuted.
