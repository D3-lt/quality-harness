# ADR-127: Every defect that escaped to someone outside is replayed against today's tests

**Status:** Accepted
**Date:** 2026-10-23
**Accepted:** 2026-10-23 by the owner ("accepted. use codex to review this adr"); amended the same day for the Codex review of the draft
**Owner:** Zy
**Spec:** None — no spec stage; the owner's instruction of 2026-10-23, "insource the Berken idea", after an outside product's launch measured its catch rate on bugs users had reported
**Cross-references:** CLAUDE.md, docs/BACKLOG.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md, docs/adr/ADR-126-one-run-per-release.md, scripts/mutate.mjs, scripts/inverse-hunks.mjs, scripts/release-evidence.mjs
**Governs:** None — declared by its tasks: their Affected Files create `scripts/escapes.mjs`, `tests/escapes/` and the tests, which a path here could not name before they exist.
**Enforced-by:** None — declared by its tasks; each adds a test and a campaign mutation.
**Invalidates:** none — checked: no accepted record measures or reports an escape rate, and nothing here changes a gate's verdict.
**Served-path change:** None — this ADR changes only measurement and reporting: `node scripts/escapes.mjs` reports, per escaped defect, whether the tests its fix added still notice the fix being reversed, and `release-evidence` prints that count as advice.

## Context

An outside product launched on 2026-10-21 with a retrospective evaluation built from bugs that users had reported: it replayed
235 of them across 33 products and counted how many its tool would have caught before release (76, against 37 and 28 for two
general models). Those figures are its own and unverified here. The method is what matters: measure a quality tool by the
defects that got past it, not by the tests its authors thought of.

This repository already holds that corpus and has never measured against it. CLAUDE.md §18 says every defect that reached
an adopter was in what a reader said about a corpus shaped unlike this one, and BACKLOG records each defect with who found it.
Measured 2026-10-23 over `docs/BACKLOG.md` and `docs/backlog-archive/`: 415 unique numbered sections, §1 to §415 with none
missing (headings repeat between the index and the archives, so the count is by section number). An origin search
(`Reported (from outside|on GitHub)`, `outside run`, a Windows check, a peer, corpus-chaos, an adopter, a Codex review) matched
203 lines, and the review of this record's draft found outside-found defects it misses (§55, §62, §95, §388: "Reported by",
"Reported <date> on GitHub", "An outside report"). So the boundary is every section, read; an origin search is a reading aid.

Two questions have no answer today:

- **Do the tests a fix added still notice that fix being undone?** A fix lands with a regression test (CLAUDE.md §4), but
  nothing re-checks, as the code moves, that the test still notices. A refactor that moves an observable turns the old test
  vacuous (§18), and a GREEN mutant is found only for the lines the catalogue names.
- **Which escapes have no regression at all?** Some fixes landed with a test of a helper, not of the boundary the report came
  through (§4), and some with none.

## Existing Primitives Audit

- `scripts/mutate.mjs` (ADR-075) runs a mutant in a worktree of the working tree (tracked changes and untracked files
  included, `plugin/scripts/worktree.mjs` `build`) under the heavy-run lease, with a baseline first, and reports RED, GREEN,
  STALE or UNPROVEN. Reuse: the worktree, the lease, the baseline-then-mutant order and the verdict vocabulary. Reshape: the
  mutant is a reverse-applied commit diff, not a from/to string.
- `scripts/inverse-hunks.mjs` already reverses hunks and treats a result it cannot establish as inconclusive (`:79`). Reuse
  its handling of a hunk that does not apply.
- `tests/mutations/<source>.json` is the catalogue shape `mutate.mjs --stale` validates. Reshape: an escape entry names a
  commit, paths, tests and a platform, so it lives in its own directory with its own validator.
- `scripts/release-evidence.mjs` already prints advice beside its verdict, and reads the landing run through `gh`. Reuse: one
  more advice line from that run; it never changes the verdict (CLAUDE.md §3).
- `plugin/scripts/corpus-probe.mjs` and the outside runs of §18 are this repository's equivalent of simulating production: they
  run the readers over corpora nobody here owns. Not replaced, and not part of this record.

## Decision

1. **Every section is classified; every defect found outside is an entry.** For each of the 415 sections (and each one added
   later), `tests/escapes/README.md` lists the section with the defects it holds, each with an id `<section>-<n>`, and for each
   defect either an entry `tests/escapes/<section>-<n>.json` or the reason it is not an escape (found by this repository's own
   gate, a design note, withdrawn). An entry holds: the origin (`peer`, `windows`, `adopter`, `codex`, `github`); the release it
   escaped in (the newest tag that does not contain the fix); the fix commits, or `null` with why when none can be named; the
   paths to reverse; the test files and names the fix added; and the platforms those tests can observe it on.
2. **A replay measures the fix's own tests, and says only that.** `node scripts/escapes.mjs` takes the lease and, per entry,
   builds a worktree of the working tree (as ADR-075 does: local changes are measured), runs the named tests and requires each
   to be reported passing (the baseline), reverses the fix's commits newest first, all or none, limited to the entry's paths,
   and runs the named tests again. **SENSITIVE**: each named test was reported and at least one now fails. **INSENSITIVE**: all
   were reported and all pass. **UNPROVEN**, with its reason: no fix commit; a reverse diff that does not apply; a build or
   runner failure; a named test not reported, skipped, or not found; a red baseline; the entry's platforms exclude this one;
   the budget ran out. Each entry gets a fresh worktree, so nothing one entry reverses reaches the next.
3. **What a verdict does not say.** SENSITIVE is not "guarded": reversing a fix can also reverse a line an unrelated assertion
   reads. INSENSITIVE is not "could ship again": another test may catch the defect, or a later change may make the reversed
   lines unable to recreate it. Both say how the fix's own tests respond to the fix being undone, on one platform. An
   INSENSITIVE entry is a lead: it goes to BACKLOG §415, where a reproduction (a corpus, the reader, what correct output says)
   decides whether the defect can recur.
4. **The report is bound to what it measured.** The report carries the sha, the platform, a digest of the catalogue, whether
   it was the full catalogue or a `--case` selection, and every entry's verdict, with one line:
   `N escapes on <platform>: S sensitive, I insensitive, U unproven`.
5. **It runs once per landing, and it is advice.** One job of the land run, outside the campaign's shard matrix and not among
   main's required checks, runs the full catalogue on Linux under a budget (`QUALITY_HARNESS_ESCAPES_BUDGET_S`); an entry the
   budget did not reach is UNPROVEN. The job uploads the report as an artifact. `release-evidence` downloads it from the
   landing run it already reads, and prints its line and the INSENSITIVE entries as advice; a missing report, one for another
   sha, a partial one, or one whose catalogue digest differs prints that the count is unknown. It refuses nothing
   (CLAUDE.md §3), and the job is not part of the run's verdict either: `release-evidence` judges a run by its jobs and
   reads a skipped one as a failure, and a dispatched run (CLAUDE.md §13, step 3) skips a land-only job, so the `escapes`
   job is left out of the jobs a run is judged by, whether it passed, failed or was skipped.

What would make it fail as a measurement: a section left out (T1's test requires every section number from 1 to the highest
to be in the README); an UNPROVEN counted as sensitive (it is its own count); a baseline or reversed run whose named tests did
not all report (UNPROVEN); a report from another sha or a partial run read as the release's (unknown). Data exists today to
send each verdict either way: §405 to §414's fixes have their tests in the tree, and at least one older fix is known to have
been tested at a helper rather than the boundary (§4's rule exists because of it).

## Alternatives Considered

- **Revert each fix on its own release tag and run the suite of that day.** Answers "did the gates of that day miss it",
  which is true by definition for an escape. Rejected because it measures nothing that can still change.
- **Hand-write a reproduction per escape (a corpus, a reader command, an oracle).** Closer to the outside product's method,
  and the only way to say a defect can recur. Rejected for the first cut because each is a new fixture nobody has checked,
  while the fix's own tests are reviewed and in the tree. Kept for INSENSITIVE entries (§415).
- **Fold escapes into the mutation catalogue.** One campaign, one report. Rejected because a mutant there is a from/to string
  on one line and a fix is a commit across files; the validator and the verdict would both have to change shape.
- **Measure HEAD only.** Grades committed tests after local changes, which ADR-075 rejected for the same reason.

## Component / Boundary Impact

`scripts/escapes.mjs` is new repository tooling beside `scripts/mutate.mjs` and ships nothing. It reads `tests/escapes/`, git,
and the worktree and lease helpers. `scripts/release-evidence.mjs` gains one advice line read from the landing run. The
workflow gains one job. No plugin file changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `tests/escapes/README.md` and `tests/escapes/<section>-<n>.json` | new catalogue | T1 | `scripts/escapes.mjs`, `tests/escapes.test.mjs` |
| `node scripts/escapes.mjs [--case <id>] [--json <file>]` | new command | T2 | the owner, the land job |
| the escapes report: sha, platform, catalogue digest, full or partial, per-entry verdicts | new JSON | T2 | the land job's artifact, `release-evidence` (T3) |
| the `escapes` job and its `escapes-report` artifact | new job | T3 | `release-evidence` |
| `release-evidence` advice line | new line | T3 | the person releasing |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the escape entry schema and the README classification | T1 | T2 | No: new |
| `escapes.mjs` and its report | T2 | T3 | No: new |

## Implementation

See `tasks/README.md`: T1 the catalogue, T2 the replay, T3 the job and the advice in `release-evidence`.

## Consequences

- **Positive:** a number for how many outside-found defects' own tests still notice their fix undone, and a named list of
  those whose tests do not.
- **Positive:** an INSENSITIVE entry is found before an adopter finds its defect a second time.
- **Negative:** one more job per landing, two runs of each entry's tests in a fresh worktree; bounded by its budget, and not
  a required check.
- **Neutral:** an UNPROVEN entry whose reverse diff no longer applies is re-pointed as a STALE mutant is.

## Out of Scope

- Simulating production for the plugin's adopters (permanent: boundary: the outside runs of CLAUDE.md §18 and corpus-chaos are this repository's equivalent, and they stay as they are).
- Hand-written reproductions for INSENSITIVE entries (deferred: docs/BACKLOG.md §415).
- Replaying on Windows or macOS (deferred: docs/BACKLOG.md §415).
- Escapes recorded only in another repository's corpus (permanent: boundary: CLAUDE.md §6, nothing derived from another repository's corpus is committed here).
- A refusal on an INSENSITIVE escape (permanent: boundary: CLAUDE.md §3 lists the sanctioned refusals, and an escape count is advice).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A fix commit also changed unrelated code, so its reverse diff trips an unrelated assertion (a false SENSITIVE) | Med | Med | the entry names the paths to reverse, and the verdict says only what the fix's tests did |
| A reverse diff breaks the build rather than restoring the defect | Med | Low | a build or runner failure is UNPROVEN, never SENSITIVE |
| Classifying 415 sections drifts from the BACKLOG | Med | Low | T1's test requires every section number to be in the README, and each listed defect to be an entry or an exclusion |
| The job outgrows its budget | Med | Low | a budget, with unreached entries UNPROVEN; measured on the first land run, sharded if needed |

## Rollback

None — repository tooling only: revert the implementing commits, which removes `scripts/escapes.mjs`, `tests/escapes/`, the
`escapes` job and its artifact, the advice line, the tests and catalogue entries for them, and the §2 command line together;
no plugin file, ledger or contract a user sees changes.

## Follow-ups

- [ ] §415: a reproduction for each INSENSITIVE entry, and replays on Windows and macOS.
