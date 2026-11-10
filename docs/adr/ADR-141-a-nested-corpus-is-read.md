# ADR-141: The corpus gate admits what the reader's listing finds

**Status:** Accepted
**Date:** 2026-11-10
**Owner:** Zy
**Spec:** None — no spec stage; docs/BACKLOG.md §441 is the input
**Cross-references:** docs/adr/ADR-137-the-decision-context-hook-runs-in-the-core.md, docs/adr/ADR-092-one-definition-of-a-record.md, docs/adr/ADR-039-records-use-the-same-listing.md, docs/adr/ADR-034-a-corpus-root-is-a-question-not-an-empty-answer.md, docs/BACKLOG.md, CLAUDE.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T1 adds one catalogue mutant per runtime on the gate's nested arm
**Invalidates:** ADR-137 — Decision 1's "Its gates stay: no corpus, or a file outside the root, says nothing": "no corpus" now means no listed path that either the root list or the reader's listing arms admit; ADR-137's tasks are unchanged
**Served-path change:** An Edit of a file that a corpus below the repository root governs (`qh hook PreToolUse`, core/hooks/pending.go) gets the decision context a root corpus gets, and SessionStart's corpus-gated standing lines (an unmarked archive, mrw on PATH, a stale standalone copy) are said in a repository whose only corpus is nested, from the core and from Node's `sessionOrientation` alike.

## Context

BACKLOG §441, measured again 2026-11-10 over a scratch git copy of tests/fixtures/corpora/python-monorepo (corpus at
`services/api/docs/adr/`), with the core built from ca71fd493: Node's `decisionContext` for `services/api/duration.py` names
`services/api/docs/adr/ADR-001-durations-are-seconds.md`, while `qh hook PreToolUse` for an Edit of that file prints nothing
and exits 0. With an unmarked `services/api/docs/adr-archive/` added, `unmarkedArchives` names it, and both `qh hook
SessionStart` and Node's `sessionOrientation` print nothing.

The gate decides it, not the reader. `hasDecisionCorpus` (core/hooks/orientation.go:66, list at :31; Node
plugin/scripts/session-orientation.mjs:41, list at :39) is true only for a listed path at or under a root `docs/adr`,
`docs/specs`, `docs/decisions`, `adr` or `specs`. The reader (`recordFilesFromListing`, decision-corpus.mjs:1405; Go
`dcRecordFilesFromListing`, decisioncorpus_read.go:304) discovers a record by three arms: its name (`ADR_FILE`,
`CANONICAL_NAME`, `SPEC_NAME`), a listed directory segment matching `RECORD_DIRECTORY` (decision-corpus.mjs:1142; Go
`dcRecordDirectory`, decisioncorpus.go:1422), or the disk (a directory's real path, then a 64 MiB content screen). Two
answers to "is there a corpus here" is the defect.

The class, enumerated 2026-11-10 with `git grep -n 'hasDecisionCorpus\|CORPUS_DIR_NAMES\|corpusDirNames' -- plugin core tests
scripts` (39 lines in 10 files):

- Definitions: core/hooks/orientation.go:31, :66; plugin/scripts/session-orientation.mjs:39, :41, and `danglingCorpusLinks`
  (:55-65), the list's other reader.
- Callers: PreToolUse, core/hooks/pending.go:21; SessionStart, core/hooks/orientation.go:464; Node's `sessionOrientation`,
  session-orientation.mjs:107, which serves `orientation.mjs` (the `qh_orientation` MCP tool).
- Tests: core/hooks/decisioncorpus_parity_test.go:179 and tests/decision-context-parity.test.mjs:593-614 (locked, ADR-137 T1,
  T4); tests/lifecycle.test.mjs:1624-1653 (locked, ADR-068 T2, ADR-099 T1); tests/listed-backslash.test.mjs:27-31 (no lock).
- Catalogue: tests/mutations/plugin/scripts/session-orientation.mjs.json:109 and :149 pin the signature and the caller line;
  tests/mutations/core/hooks/orientation.go.json:87 pins `listedPath`.
- A copy: tests/helpers/node-hooks/session-orientation.mjs:39-107, the retired Node hook kept as a test helper.

No test reaches the PreToolUse gate: core/hooks/pending_test.go holds only `TestDecisionReaderWithin`. tests/record-by-name.test.mjs:51-56
attributes record directories to "lifecycle's CORPUS_DIR_NAMES" in a comment; the rule it describes is `RECORD_DIRECTORY`.

What widening changes, measured 2026-11-10 by evaluating today's gate and the proposed listing-arms predicate over 18 listings
on `linux` and `win32` (a scratch script over the shipped regexes): a pure replacement would turn true into false for
`docs/specs/feature.md`, `docs/adr/README.md` alone, `docs/adr/notes.txt`, a bare listed `docs/adr` (a tracked link, the §350
C10 shape) and, on win32, `docs\decisions`, `docs\specs` and `specs\a\b.md`; and would turn false into true for
`services/api/docs/adr/ADR-001-x.md`, `docs/posts/001-intro.md` and, on win32, `src\docs\adr\x.md` and `docs\adrs\x.md`.

## Existing Primitives Audit

- `recordFilesFromListing` / `dcRecordFilesFromListing`: their first two arms read the listing alone. **Reshaped:** those two
  arms become one predicate each runtime exports, `recordArmOfListed(norm)` (Node) and `dcRecordArmOfListed(norm)` (Go),
  which the discovery loop and the gate both call; the loop keeps its disk arms after it.
- `corpusEligible` / `dcCorpusEligible`: reused inside the predicate (`.md`, no README, no `tasks` or `templates`, nothing
  under an uninteresting directory), so `node_modules/x/docs/adr/a.md` stays outside the gate as it is outside the reader.
- `CORPUS_DIR_NAMES` / `corpusDirNames`: **reused unchanged** as the gate's root arm and as `danglingCorpusLinks`' list.
- The parity harness (`TestDecisionCorpusParity`, rows from Node through `QH_DECISION_CORPUS_ROWS`): reused; new rows come from
  a new test beside the locked one.

## Decision

1. **The gate is the root list OR the reader's listing arms.** `hasDecisionCorpus` answers true when a listed path is at or
   under a root corpus directory (unchanged) or when `recordArmOfListed` admits it: named like a record, or under a directory
   segment `RECORD_DIRECTORY` matches, after `corpusEligible`. A nil listing is still `UNPROVEN`. Nothing that is true today
   turns false.
2. **One predicate per runtime.** The discovery loop and the gate call the same function, so the reader's listing arms and the
   gate cannot drift apart again; the Go function mirrors the Node one row for row through the parity harness.
3. **The disk arms stay out of the gate.** Neither a directory's real path nor the content screen is consulted: the gate stays
   a pure function of the listing (CLAUDE.md §8, ADR-039), and SessionStart opens no record content (CLAUDE.md §19, ADR-092
   Decision 11). A record found only through a symlinked directory or only by the screen still gets no context.
4. **`danglingCorpusLinks` is unchanged.** It asks the disk whether a root corpus directory is a broken link, for work-next's
   "No QH corpus" message; a nested link would need a walk of the disk, which the listing-only rule above refuses.

What would make this fail: python-monorepo's Edit of `services/api/duration.py` still printing nothing from `qh hook
PreToolUse`, or a nested unmarked archive still unnamed at SessionStart. Both are red today (Context) and are T1's and T2's
fences. The rows that must not change are the locked lifecycle and parity tests and listed-backslash's POSIX row, which stay
in the fences.

## Alternatives Considered

- **Replace the root list with the listing arms.** Rejected: measured above, it turns spec-only corpora (`docs/specs`), a
  README-only `docs/adr` and a tracked `docs/adr` link from true to false, which silences SessionStart lines those repositories
  get today; the BACKLOG asked for a widening, not a narrowing.
- **Ask the reader unconditionally** at PreToolUse, now that it starts no process (ADR-137). Rejected: the reader's reads are
  bounded in time, not bytes (BACKLOG §443), so every Edit in every repository, with or without a corpus, would pay the screen
  of up to 64 MiB; and SessionStart could not do the same without opening record content (§19).
- **The full discovery predicate, disk arms included.** Rejected: Decision 3; the gate would depend on the disk and the parity
  rows, which run over an empty scratch directory, would answer on ENOENT.
- **Only the directory arm, not the name arms.** Considered for the noise cost: `ADR_FILE` admits any `NNN-` markdown, so
  `docs/posts/001-intro.md` turns the gate on. Rejected: a second, narrower predicate is the defect this record removes, and
  the cost is bounded (Consequences).

## Component / Boundary Impact

None — internal to the decision reader and the two hooks' gate in each runtime (plugin/scripts/decision-corpus.mjs,
plugin/scripts/session-orientation.mjs, core/hooks). The predicate's one reason to change is what the listing says a record
looks like, which the reader already owns.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `recordArmOfListed(norm)` / `dcRecordArmOfListed(norm)` | new export: `'name'`, `'directory'` or null | decision-corpus.mjs, decisioncorpus_read.go (T1) | the discovery loop, `hasDecisionCorpus` (T1) |
| `hasDecisionCorpus` | admits a nested corpus; signature unchanged | session-orientation.mjs, orientation.go (T1) | PreToolUse, SessionStart, `qh_orientation` |
| PreToolUse `additionalContext` | said for an Edit a nested corpus governs | core/hooks/pending.go (T1) | the agent's session |
| SessionStart standing lines | said where the only corpus is nested | orientation.go, session-orientation.mjs (T2) | the agent's session; corpus-probe's `sessionStart` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `hasDecisionCorpus` admitting a nested corpus | T1 | T2 | No — widens only |

## Implementation

See `ADR-141-a-nested-corpus-is-read/tasks/README.md`.

## Consequences

- **Positive:** a monorepo whose decisions live beside a service gets the same edit-time context and SessionStart lines as one
  that keeps them at the root; the gate and the reader share one definition of a listed record.
- **Negative:** a repository with numbered markdown and no decision corpus (`docs/posts/001-intro.md`) now passes the gate:
  each Edit runs the reader, which recognises no record there and says nothing, and SessionStart may say the mrw line or a
  stale-copy notice it did not before. Bounded: those lines are standing lines, said once per context (ADR-122).
- **Neutral:** what readers say changes, so CLAUDE.md §18's outside run applies before the release. corpus-probe records no
  PreToolUse output, and the python-monorepo fixture has no archive, so ADR-138's probe job may report no difference; the peer
  run is `qh hook PreToolUse` and SessionStart over a nested corpus by hand (Follow-ups).

## Out of Scope

- The disk arms of discovery in the gate (permanent: boundary: Decision 3, the gate stays listing-only and opens no content)
- `danglingCorpusLinks` for a nested link (permanent: boundary: Decision 4, it would need a disk walk)
- The retired Node hook copy in tests/helpers/node-hooks/session-orientation.mjs (permanent: boundary: a test helper that never ships (CLAUDE.md §1), and no test runs it over a nested corpus: `git grep python-monorepo` outside the fixture finds none)
- `adr-next` recursing more than one level into nested corpora (deferred: docs/BACKLOG.md §469)
- The comment at tests/record-by-name.test.mjs:51-56 naming CORPUS_DIR_NAMES for record directories (permanent: boundary: prose in a test, not behaviour; named here, not edited)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The extraction changes what the reader discovers | Low | High | The predicate is the loop's own two arms moved; the locked parity and replay tests compare both runtimes over every fixture corpus |
| Numbered markdown opens the gate in a repository with no corpus | Med | Low | The reader says nothing for a non-record; standing lines are said once per context |
| A catalogue entry pinning the gate or the moved arms goes STALE or GREEN | Med | Med | Three decision-corpus.mjs entries pin the inline arms (:231, :1190, :1250); T1 S6 re-anchors them and S7 runs every catalogue mutant on the four refactored files |
| The Go mirror drifts from Node on a platform row | Low | Med | New parity rows on `linux` and `win32` for every measured flip |

## Rollback

Revert the two tasks' commits: the gate returns to the root list, the discovery loop to its inline arms. No state is persisted.

## Follow-ups

- [ ] The §18 outside run: a peer runs `qh hook PreToolUse` and SessionStart over a nested corpus and pastes the output verbatim
- [ ] Whether corpus-probe should record a PreToolUse decision context per corpus, so ADR-138's probe job can see this surface
