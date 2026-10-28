# ADR-099: SessionStart does not list ready tasks; work-next owns ready

**Status:** Accepted
**Date:** 2026-10-12
**Owner:** the owner (repository maintainer)
**Spec:** None — no spec stage; the owner decided on 2026-10-12, and the evidence is in Context. It reverses F-1 of `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md` (see Decision 5)
**Cross-references:** ADR-038, ADR-040, ADR-046, ADR-068, ADR-094, ADR-095, ADR-097, `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md`, `docs/BACKLOG.md`
**Governs:** `plugin/scripts/session-orientation.mjs`, `plugin/scripts/session-notes.mjs`, `plugin/scripts/ready-lines.mjs`, `core/hooks/orientation.go`
**Enforced-by:** `ADR-099 T1: the hook output names no ready task`
**Invalidates:** ADR-095 — Decision 6 (T6, the traced ready-task cache) and the clause of its Served-path change reading "SessionStart's 'ADR tasks in flight' lines come from an answer cached by the content of what produced them". Also reversed, by prose here because only the leading token is read: ADR-040 Decision 2 and 3 (`taskDirectories` and `readyTaskLines` as SessionStart's inventory) and its Alternative rejecting `work-next` for SessionStart ready; ADR-046 Decision 4 and the SessionStart half of Decision 5 (the UNPROVEN ready line and the render cap); ADR-094 Decision 2's member "the ADR tasks in flight" among the standing paragraphs. ADR-040 Decision 1 and 4 (the listing and `hasDecisionCorpus`) stand.
**Served-path change:** A session start, resume, compaction or clear, and the `qh_orientation` MCP tool, no longer say "ADR tasks in flight" or start `adr-next`; the compaction note no longer carries "ADR task in flight"; `work-next` is the one reader that says which task is ready.

## Context

The owner decided on 2026-10-12 to remove the SessionStart ready-task lines and the ADR-095 cache behind them, making `work-next`
the only owner of "ready". ADR-097 (2026-10-12) deferred exactly this to `docs/BACKLOG.md` §378 (`ADR-097:102`); this record is
where that deferral lands.

- **Where the lines come from (read 2026-10-12).** `sessionOrientation` calls `readyTaskLines(root, inside, listing, undefined,
  readyCache(root, listing))` (`plugin/scripts/session-orientation.mjs:105`), says a cache problem as a standing paragraph (`:107`)
  and the lines under "ADR tasks in flight:" (`:143-146`). The PreCompact note makes the same call (`plugin/scripts/session-notes.mjs:109-118`,
  "ADR task in flight: …"), and the compact SessionStart hands it back (`plugin/scripts/on-session-start.mjs:62`). The MCP tool
  `qh_orientation` returns the same text (`plugin/scripts/orientation.mjs:26`) and its description names it (`plugin/bin/qh-mcp:619`).
  `readyTaskLines` (`plugin/scripts/ready-lines.mjs:206-338`) runs `adr-next` per task directory, at most six, chosen by
  `taskDirectories` (`plugin/scripts/decision-corpus.mjs:338-399`); `surfaceReadyLines` (`ready-lines.mjs:47-72`) caps them.
  `readyCache` (`plugin/scripts/ready-cache.mjs:68`) runs the gate under `plugin/lib/trace_run.py` (`ready-cache.mjs:78`).
- **What only they use, enumerated 2026-10-12** with
  `mrw read --grep "from '\./ready-lines\.mjs'|from '\./ready-cache\.mjs'|trace_run|readyCache\(|readyTaskLines\(|surfaceReadyLines\(" plugin/ scripts/ tests/`
  and `mrw read --grep '\btaskDirectories\(|TASK_DIRECTORY_READ_CAP|\bcommandInCode\(' plugin/scripts/ scripts/`:
  - `ready-cache.mjs` is imported by `session-orientation.mjs:14` and `session-notes.mjs:15` only (and `tests/ready-cache.test.mjs:13`);
    `trace_run.py` is named by `ready-cache.mjs` only (and that test).
  - `readyTaskLines` and `surfaceReadyLines` are called by the two emitters only; `gateSaid`, `ownerCaveat`, `missingOwnerCaveat` and
    `EVIDENCED_SUMMARY` are private to them.
  - `taskDirectories`, `TASK_DIRECTORY_READ_CAP` and `newestTaskChange` (`decision-corpus.mjs:338-399`) are called from `ready-lines.mjs:225`
    and `:321` only (`corpus-probe.mjs:761` is a local variable of the same name). `commandInCode` (`plugin/scripts/corpus-text.mjs:153`) is
    called in `plugin/` from `ready-lines.mjs:296` only; `tests/chaos-e016066.test.mjs:444-451` calls it directly.
  - **Kept, because something else ships them:** `advisoryHeadline` (`lifecycle.mjs:13`), `resolvePython` (`corpus-probe.mjs:57`,
    `scripts/python-interpreter.mjs:22`) and `spawnGate` (`corpus-probe.mjs:57`, `work-next.mjs:25`) stay in `ready-lines.mjs`, so
    the file stays and the `Governs:` of ADR-038, ADR-040 and ADR-046 still resolve. `unmarkedArchives` stays (`session-orientation.mjs:116`).
- **Whether anyone acts on them.** The owner's measurement of 2026-10-12, over this repository's 17 main Claude Code transcripts:
  the SessionStart heading listed at least one task in 26 of 69 session starts, and the agent's next actions touched a listed task
  in 4 of those 26 (a loose path match between the listed task and the files of the next tool calls). This record did not re-take
  it; a count made while drafting found 18 main transcripts in that directory, 17 of them carrying the heading. The adopter survey
  (`docs/BACKLOG.md` §370, line 3621, 15 sessions, 2026-10-09) found "ADR tasks in flight" ignored in 10 of 15 sessions and the
  "+N more task directories: UNPROVEN" line in 8.
- **They disagree with `work-next`.** `work-next` counts only Accepted records (`plugin/scripts/work-next.mjs:26`, `corpusEligible`);
  the ready line offers a Proposed record's task with a caveat (`ready-lines.mjs:184-192`, recorded in `tests/goldens/readiness.json:10`).
  An outside run of 3.8.18 saw the line name a task `work-next` lists under `readyButClaimedDone` (`docs/BACKLOG.md:3640`), and a Rust
  workspace saw implemented records' tasks listed as ready (`:3638`). In this repository's own matrix, the orphan-tasks fixture
  expects SessionStart to say "T1 is ready" (`tests/fixtures/corpora/orphan-tasks/expected.json:51`) while `work-next` calls the same
  directory `readinessUnproven` (`:21-23`).
- **What they cost.** Measured 2026-10-11 (ADR-095 Context, a fresh clone of this repository, load 4 to 6 on 10 cores): SessionStart
  1.2 to 1.4 s, of which 1.0 to 1.4 s is six serial `adr-next` runs; the cache brought a second start to 117 ms (`docs/BACKLOG.md:3725`)
  at the price of `ready-cache.mjs` (193 lines), `trace_run.py` (292 lines) and 39 catalogue entries (18 and 21).
- **The spec binds three of the tests.** F-1 of `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md` (UC1-S1, UC1-S2,
  UC1-S3, `@implemented`, lines 57, 67, 77) names `tests/lifecycle.test.mjs` tests this record deletes. `spec-verify` has no tag that
  retires a fact (`plugin/bin/spec-verify:772` accepts `@draft`, `@spec`, `@implemented`), and ADR-097 deferred the post-edit hook for
  that reason. Nothing in the gate runs `spec-verify` over this repository's specs: `scripts/selftest.sh` does not, and
  `scripts/verdict-diff.sh:79-82` runs it on both sides of a comparison over the same tests. `python3 plugin/bin/spec-verify --spec
  docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md` printed `[PASS]` and exited 0 on 2026-10-12; after T1 it exits 2
  (bound test missing). The owner's decision is why this record proceeds where ADR-097 deferred.
- **Locks** (`python3 scripts/test-locks.py <file>`, 2026-10-12): `tests/ready-cache.test.mjs` 9 (ADR-095 T6 five, the withdrawn
  ADR-095 T2 four); in `tests/lifecycle.test.mjs` ADR-068 T2 locks the ten tests T1 deletes or changes (named in T1); 0 on
  `tests/archive-not-in-flight.test.mjs`, `chaos-315-ansi`, `chaos-315-codex-render`, `corpus-excludes-fixtures`, `corpus-link-loop`,
  `named-not-dropped`, `work-next-readiness`, `session-start-unreadable-owner`, `chaos-e016066` and `hook-goldens`. `tests/corpus-matrix.test.mjs`
  carries 7 locks (ADR-064 T6, ADR-087 T5, ADR-089 T1); T1 changes only its `expected.json` data, never the test.

- **Debt at authoring** (`python3 plugin/bin/adr-debt docs/adr`, 2026-10-12). Rows this record takes: ADR-097's "The SessionStart ready
  lines and the ADR-095 cache" (deferred to §378; §378's ADR-097 entry, `docs/BACKLOG.md:3735`, names ADR-097 but not this item);
  ADR-094's and ADR-094 T2's §372 leads on tasks of implemented or Proposed records listed as ready (moot: nothing lists them);
  ADR-095's, ADR-095 T2's and T6's "running the misses of the ready-line cache concurrently" (§378, `docs/BACKLOG.md:3716`; moot: no cache).
  T1 closes all of them in the backlog. Not taken: ADR-094's other §372 leads (injected prompts, per-call PreToolUse advice), ADR-095's
  decision-corpus and per-test-verdict items, ADR-097's post-edit hook, ADR-098's bare-mention item: none is about the ready lines.
The class: every shipped surface that says which ADR task is ready, other than `work-next` and `adr-next` themselves, and every
definition that exists only to feed one. Members in: the SessionStart orientation, the compaction note, `qh_orientation`, the cache
and its recorder, and the helpers listed above. Members left out: `work-next` (the owner of ready), `adr-next` (the per-directory
gate it and an MCP client still call), and `corpus-probe`'s `adrNext` section (a reader report, not an orientation).

## Existing Primitives Audit

- **`work-next`** (`plugin/scripts/work-next.mjs`, human and `--json`) already answers "what is ready" over every task directory, with
  the Accepted-only rule, `readyButClaimedDone` and `readinessUnproven`. Reused as the only answer; nothing is added to it.
- **`adr-next <tasks-dir>`** stays the per-directory gate, reachable over MCP as a reading tool (ADR-012).
- **The `work` skill** already runs `work-next` first, every time (`plugin/skills/work/SKILL.md:20`), and `plugin/README.md:44` names it.
- **`hasDecisionCorpus` and the could-not-look line** (`session-orientation.mjs:41-50`, `:108-110`) stay; only the line's words about
  ready tasks go.

## Decision

1. **SessionStart, the compaction note and `qh_orientation` name no ready task and start no `adr-next`.** `sessionOrientation` stops
   calling `readyTaskLines` and `readyCache`; the "ADR tasks in flight:" paragraph and the cache-problem paragraph are removed. The
   PreCompact note (`sessionStateNote`) loses its task line, so the compact SessionStart hands back only what the gates measured.
2. **No line points at `work-next` instead.** A session that wants to know what is ready runs `work-next` (or `adr-next <tasks-dir>`
   for one directory; over MCP, the `adr-next` reading tool). The `work` skill already sends an agent there first. A pointer is an
   always-on line every adopter pays for at every start (CLAUDE.md §19), and the lines it would replace were ignored in 10 of 15
   surveyed sessions; nothing measured says a pointer would be read more. What would reverse this: a measurement of sessions in a
   corpus that start a task without running `work-next` and pick the wrong one.
3. **The cache and its recorder are deleted:** `plugin/scripts/ready-cache.mjs`, `plugin/lib/trace_run.py`, their catalogue files and
   `tests/ready-cache.test.mjs`. `readyTaskLines`, `surfaceReadyLines`, `gateSaid`, `ownerCaveat`, `missingOwnerCaveat` and
   `EVIDENCED_SUMMARY` leave `ready-lines.mjs`; `taskDirectories`, `TASK_DIRECTORY_READ_CAP` and `newestTaskChange` leave
   `decision-corpus.mjs`; `commandInCode` leaves `corpus-text.mjs`. Whatever else the deletion leaves unreached in `plugin/` goes too.
4. **The could-not-look line stays, about corpus existence only:** when git cannot list the tree inside a repository, SessionStart still
   says so, as UNPROVEN, and still names corpus existence (ADR-040 Decision 4, F-2). The shadow-install notice is gated on the check,
   or a corpus, or a corpus that could not be looked for; a repository whose only ADR trace is a `tasks/` directory outside the five
   corpus names, with no check declared, no longer gets it.
5. **The records whose clauses this reverses are retired through the adr-retire stage (T2), after the removal, and none is edited in
   place** (the owner's condition for accepting this record, 2026-10-12). What that stage can and cannot do, read on 2026-10-12:
   - **It retires whole decision units only:** a record and its task directory, moved unedited with `git mv` and sealed by one SHA-256
     over every file beneath it, with a Decision effect of exactly `governing`, `superseded by <record>` or `withdrawn`
     (`plugin/skills/adr-retire/SKILL.md` steps 3 and 6-7; `plugin/templates/adr-archive-readme-template.md:20-27`;
     `plugin/bin/adr-retire-check:756-775`). There is no task-level or clause-level retirement and no "superseded in part" effect.
   - **None of the five records is untrue as a whole.** ADR-040 Decisions 1 and 4, ADR-046 Decisions 1-3, ADR-094's other decisions and
     ADR-095 Decisions 1 and 3-5 still govern code T1 keeps, so `superseded by ADR-099` would claim more than this record decides.
   - **So T2 archives ADR-040, ADR-046 and ADR-095 whole as `governing`**: the effect true of each whole record, "still authoritative but
     no longer worth current-format validation" (the skill's step 3). These are the three with a task whose delivered code T1 deletes
     (ADR-040 T1; ADR-046 T3, and T5 but its `posixListed` export; ADR-095 T6). Left active, ADR-095 T6 is `done` with a lock on tests
     T1 deletes, which current-format lint refuses (`plugin/lib/record.py:3942`, "locked test … vanished — done is refused"), and
     ADR-040's and ADR-046's `Enforced-by:` name deleted tests (advice, `plugin/bin/adr-lint:4018-4022`). Each archive row's Reason names
     the clauses ADR-099 reverses. T1 and T2 land in one commit, because between them the gate refuses ADR-095 T6.
   - **ADR-094 stays active.** Its reversed clause is one member of a list (Decision 2's "the ADR tasks in flight"), and nothing in it
     fails after T1.
   - **Named gaps, not worked around** (deferred to `docs/BACKLOG.md` §378, see Out of Scope): (a) a single task (ADR-095 T6, ADR-040 T1,
     ADR-046 T3 and T5) or clause (ADR-094 Decision 2's member) cannot be retired, and a frozen file cannot carry a note, so the partial
     reversal is said only in this record's `Invalidates:` and in the archive rows' Reason; (b) a spec fact cannot be retired:
     `spec-verify` accepts only `@draft`, `@spec` and `@implemented` (`plugin/bin/spec-verify:772`), and adr-retire moves ADR records,
     not specs, so F-1 of `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md` keeps `@implemented` bindings to deleted tests
     and `spec-verify --spec` on it exits 2 after T1.
   - **One rename before the move.** Archived, ADR-095's `tasks/T2-ready-lines-come-from-a-content-cache.md` is 132 characters, over the
     128 of `tests/path-length.test.mjs:20`, whose over-limit list is closed and whose archived units cannot be renamed (`:9-12`). T2
     shortens that one file name in the active tree, keeping its `T2-` prefix and README link (CLAUDE.md §7), before the unit is sealed.
6. **Locks.** ADR-068 T2's lock map is retaken with `adr-verify --relock --replace-hashes` after the deletions are in the diff, and so is
   ADR-092 T3's: its "task directories take the per-hop count and no name preference" (`tests/record-discovery.test.mjs:181-198`) loses
   the two `taskDirectories` asserts (`:194`, `:197`) and the import (`:12`), and keeps the `observe` assert (`:195-196`), which holds the
   same per-hop rule through `work-next`. That command snapshots hashes and runs no fence (`plugin/bin/adr-verify:2743`; its rows record
   `ms:` of the snapshot only); the deletions are proved by T1's own tests and the full gate. ADR-095 T6 is not relocked: every test its
   Tests table names is in the deleted file, so a relock would lock a file that is gone; T2 archives it with its record instead. The
   withdrawn ADR-095 T2 needs nothing: a lock is judged only for a `done` claim (`plugin/lib/record.py:3979-3983`). Widened by the owner
   on 2026-10-12, before T1's red run: the ADR-092 T3 relock, the `taskDirectories` test of `tests/listed-backslash.test.mjs`, a name
   scan that matches `taskDirectories` only as a call or an import (the word is also an attestation key, `scripts/attest-import.mjs:24`
   and `plugin/scripts/corpus-probe.mjs:761-774`, which stays), and the comment at `scripts/python-interpreter.mjs:24`.

**This fails if** a SessionStart (startup, resume, compact or clear) or `qh_orientation` in a corpus where `work-next` lists a ready
task says "ADR tasks in flight", "ADR task in flight" or "is ready —", or starts `adr-next`; if anything shipped still names
`readyTaskLines`, `readyCache`, `trace_run` or `commandInCode`, or calls or imports `taskDirectories`; or if a tree git cannot list stops
being named UNPROVEN with its corpus existence. Data that can produce each failure exists today: the fixture in T1 has a ready Accepted
task, and the existing `git cannot list is UNPROVEN, not no corpus` test corrupts the index.

## Alternatives Considered

- **Keep the lines and make them agree with `work-next`, by filtering to Accepted records** (BACKLOG §372 lead 2). Rejected: it copies
  `work-next`'s rule into a second reader, the duplicated knowledge that made them disagree, and the lines would still be ignored.
- **Print `work-next --json`'s ready list at SessionStart.** Rejected: `work-next` reads the whole corpus, which costs more per start than
  the six `adr-next` runs ADR-095 cached, and it is the same always-on paragraph the survey found ignored.
- **One SessionStart line pointing at `work-next`.** Rejected in Decision 2, with what would reverse it.
- **Remove the lines and keep the cache.** Not possible: the cache has no other caller, and an unreached definition fails the gate
  (CLAUDE.md §13, `scripts/orphan-sweep.mjs`).
- **Remove only the SessionStart paragraph and keep the compaction note's task line.** Rejected: the compact SessionStart is a
  SessionStart, the line makes the same claim with the same disagreement, and it would be the cache's last caller.
- **Two tasks, the cache first.** Rejected: the only order that leaves each commit green writes an uncached call into both emitters and
  deletes it in the next commit; one task does the same with no throwaway edit.
- **Reconcile the reversed records in place** (dated notes, `superseded` task statuses, trimmed `Enforced-by:`), as first drafted.
  Rejected by the owner on 2026-10-12 in favour of retirement through the adr-retire stage (Decision 5).
- **Archive the five records as `superseded by ADR-099`.** Rejected: each still governs code T1 keeps (Decision 5).

## Component / Boundary Impact

`session-orientation.mjs` and `session-notes.mjs` lose a section each and no longer depend on `ready-lines.mjs`'s readiness half or on
`ready-cache.mjs`. `ready-lines.mjs` keeps only the gate spawner, the interpreter probe and the advisory headline (its name now says less
than it holds; a rename is not part of this decision, see Out of Scope). `decision-corpus.mjs` and `corpus-text.mjs` each lose definitions
only this used. `work-next` becomes the single owner of "ready" with no change to it.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| SessionStart `additionalContext` | the "ADR tasks in flight:" paragraph and the ready-task-cache paragraph are removed; the could-not-look line names corpus existence only | T1 | the agent; `corpus-probe` `sessionStart.lines`; `tests/corpus-matrix.test.mjs` via `expected.json` |
| PreCompact note text (handed back at the compact SessionStart) | "ADR task in flight: …" removed | T1 | the agent after a compaction |
| `qh_orientation` MCP tool | its output loses the ready lines; its description stops naming "ADR tasks in flight" | T1 | MCP clients |
| `<state dir>/ready-cache/` | no longer read or written | T1 | none |
| `readyTaskLines`, `surfaceReadyLines`, `readyCache`, `taskDirectories`, `TASK_DIRECTORY_READ_CAP`, `commandInCode` | exports removed | T1 | tests only |
| `docs/adr-archive/README.md`, `docs/adr/README.md` | three `governing` archive rows; the active catalog links ADR-040, ADR-046 and ADR-095 to their archive paths | T2 | `adr-retire-check`, `adr-context`, `adr-state`, every reader of the catalog |
| `adr-retire-check` obligation receipts | read from the active root's `BACKLOG.md`, or, where it has none, the `BACKLOG.md` the active and archive roots share; a catalog pointer still names that one file and the receipt grammar is unchanged (the owner, 2026-10-12; its own commit, before T1 and T2) | `plugin/bin/adr-retire-check` | T2's ADR-095 row; any archive whose backlog sits beside its roots |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the removal: the code, tests and lines ADR-040 T1, ADR-046 T3/T5 and ADR-095 T6 delivered are gone | T1 | T2 | No — T2 retires the records that describe it; both land in one commit |

## Implementation

See `docs/adr/ADR-099-sessionstart-does-not-list-ready-tasks/tasks/README.md`: T1 (the removal), then T2 (the retirement).

## Consequences

- **Positive:** one reader says what is ready, so the hook and the router can no longer disagree; every session start in a corpus starts
  no `adr-next`; 485 lines of shipped code (`ready-cache.mjs` 193, `trace_run.py` 292) and 39 catalogue entries go with the cache, and the readiness half of `ready-lines.mjs`
  with its catalogue entries.
- **Negative:** a session that never runs `work-next` is not told a task is ready. An MCP client loses the ready lines from
  `qh_orientation` and has `adr-next` per directory, not `work-next` (Out of Scope). `spec-verify --spec` over the ADR-040 spec exits 2
  for UC1-S1 to S3 until a retirement tag exists. ADR-040, ADR-046 and ADR-095 are frozen: a later change to what they still govern
  (the listing, the dispatcher and `qh-mcp` relays, the hook memos) needs a new record, not an amendment.
- **Neutral:** what every gate judges is unchanged. The corpus probe's SessionStart lines change on every corpus with a ready task,
  which is a reader change under CLAUDE.md §18 (Follow-ups).

## Out of Scope

- Exposing `work-next` over MCP (permanent: boundary: ADR-012 exposes the reading gates; whether the router joins them is a separate decision nobody has asked for, and `adr-next` stays reachable)
- Sweeping the `<state dir>/ready-cache/` directories left on adopters' disks (permanent: boundary: at most 200 small entries per repository (`plugin/scripts/ready-cache.mjs:17-18`), under the repository's state directory, read by nothing after T1; a sweep would be code kept for a removed feature)
- Renaming `ready-lines.mjs` to match what is left in it (permanent: boundary: three records' `Governs:` name the file, and a rename is churn with no behaviour)
- A tag that retires a spec fact, so the ADR-040 spec's F-1 bindings can be closed rather than left naming deleted tests (deferred: docs/BACKLOG.md §378)
- Retiring part of a record (a single task such as ADR-095 T6, ADR-040 T1, ADR-046 T3 and T5, or a single clause such as ADR-094 Decision 2's member), which the adr-retire stage cannot do (Decision 5) (deferred: docs/BACKLOG.md §378)
- What `work-next` counts as ready, including whether "Accepted — implemented" in a Status means done (permanent: boundary: this record moves no rule into or out of `work-next`)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| An agent starts work without knowing a task is ready | Med | Low | the `work` skill runs `work-next` first; the measured action rate on the lines was 4 of 26 starts |
| A relock hides an unreviewed change to a locked test | Low | Med | relock only after the deletions are in the same diff and reviewed there; a relock proves nothing by itself (it runs no fence) |
| A record archived as `governing` stops reaching a reader that reads only the active tree (`adr-context`, or `work-next`'s spec coverage) | Med | Med | T2's fence checks both after the move and stops if either fails |
| Something outside this repository's tests reads the "ADR tasks in flight" text | Low | Low | the §18 outside run asks for the probe's whole output after T1 |
| Other sessions edit the same files (ADR-097 T1, committed as dbf53131 while this was drafted, edited `tests/lifecycle.test.mjs` and relocked ADR-068 T2) | High | Med | T1 depends on ADR-097-T1, re-runs `test-locks.py` at execution, and starts on a committed tree |

## Rollback

Revert T1's commit. No persistent state changes except that `<state dir>/ready-cache/` stops being written; a restored cache re-checks
every manifest before reusing it, so entries left from before are either valid or misses.

## Follow-ups

- [x] Owner decision: Accepted 2026-10-12, on the condition that the reversed records are retired through the adr-retire stage rather than reconciled in place (Decision 5, T2).
- [x] Outside run (CLAUDE.md §18) after T1 lands and before the tag: `corpus-probe.mjs --json` on a corpus we do not own, everything it printed, verbatim; its SessionStart lines are expected to lose the ready paragraph and nothing else.
  Done 2026-10-12, before the v3.8.22 tag, at its release commit `686ac9be`: `docs/corpus-reports/2026-10-12-laravel-react-monorepo-3.8.22-686ac9b.json` (look ok, 96 compared, no verdict moved) beside a PARTIAL PHP corpus; filed through `attest-import`.
