# ADR-064: Corpus chaos is the release loop

**Status:** Accepted
**Date:** 2026-09-24
**Owner:** zy
**Spec:** None — no spec stage. On 2026-09-24 the owner chose to make corpus chaos the main verification loop, to cap review rounds on heuristic readers at one per behaviour change, to record this strategy as a record and execute it, and to add fixture corpora for the shapes found in the wild.
**Cross-references:** ADR-005, ADR-063, `docs/BACKLOG.md`, `docs/corpus-reports/README.md`, `plugin/skills/corpus-chaos/SKILL.md`
**Governs:** `plugin/scripts/corpus-probe.mjs`, `plugin/scripts/reader-paths.mjs`, `plugin/skills/corpus-chaos/SKILL.md`, `docs/corpus-reports/README.md`, `scripts/chaos-fixture-sweep.mjs`, `tests/fixtures/corpora/**`
**Enforced-by:** `tests/corpus-probe.test.mjs::corpus-probe --diff names what changed between two runs of one corpus`
**Invalidates:** none — checked
**Served-path change:** A corpus-chaos runner probes once, then gets its diff against its own previous run, and its counts-only attestation, from two commands that read the saved report, where both were written by hand. Its report says which readers answered, whether they were committed, and how long each took. Nothing a session's gates say about its own work changes.

## Context

On 2026-09-24, outside runs of the readers over repositories this project does not own found every product defect of the day that reached an adopter:
- a Rust test reported absent while the lock had hashed it (BACKLOG §276);
- a bare PASS when nothing ran (§277);
- a fence change that never happened (§278);
- twelve leads over three new shapes (§279);
- four more leads from two repositories (§280), and eight more from nine repositories (§281).

Codex rounds over the same week found fewer findings each time, mostly lexer edge cases that each fix invited. The owner concluded that corpus chaos is where the defects are, and asked for it to be a loop rather than an occasional favour.

What the loop costs today, read from this repository on 2026-09-24:
- **Diffing is manual.** The probe has no diff mode (`plugin/scripts/corpus-probe.mjs`), so every comparison between two runs was done by a peer by hand: `unbacked` 15 → 47, `readinessUnproven` 3 → 2, an adrLint total moving 67/92 → 68/91 (the `found` fields of the 2026-09-24 attestations).
- **Attestations are transcribed.** The probe writes none. Eight files in `docs/corpus-reports/` carry `kind: hand`, and seven of the eleven written on 2026-09-24 carry `null` in `tasks` or `taskDirectories` because the report has no scalar to copy.
- **The probe's hash says nothing about the readers.** `probe.sha256` covers `corpus-probe.mjs` alone (`corpus-probe.mjs:44-46`), so attestations at four different `at` shas carried the same hash while the readers changed.
- **Slowness is unrecorded.** The report has no timing. A disk-walking lookup that took minutes on a large build tree (§281 item 4), and an adr-next run of 76 s against work-next's 60 s budget, were found only because a peer noticed.
- **Nothing pins a wild finding.** Every `expected.json` under `tests/fixtures/corpora/` was added in `c1f546a` and none since. None of the shapes found in the wild is in `tests/corpus-matrix.test.mjs`: Rust lexing, a PHP repository with several corpus roots, a pnpm workspace filter, an unmarked archive, a JS project with an inferred check. A fix is guarded by a unit test at best, and the matrix — the one check that runs every reader as a process on all three platforms — never sees the shape.

## Existing Primitives Audit

- `corpus-probe.mjs` already runs every reader as a process, redacts absolute paths from what it emits (`scrubber`, `publicPath`), and compares two readers within one run (`compareReaders`). Reuse: the diff re-applies the same scrubber to both reports. Caveat, measured by the cold review: record ids, task ids and `workNext.next` pass through unredacted today, so "scrubbed" means no absolute path, not no corpus content.
- `scripts/release-evidence.mjs` defines the reader surface (`READER_PATHS`, :292) and reads attestations (`readAttestations` :278, `outsideRun` :240, which reads `at`). Reuse: the constant moves into `plugin/scripts/reader-paths.mjs` so the shipped probe can import it — `scripts/` never ships — and release-evidence imports it from there. Its logic is unchanged. The attestation is written in the schema `outsideRun` already accepts.
- `tests/corpus-matrix.test.mjs` discovers fixture corpora by directory. Reuse: a new corpus is a directory and a reviewed `expected.json`. The matrix compares only some fields today, so T6 adds the two comparisons its corpora need.
- `scripts/backlog-record-sweep.mjs` is an advisory sweep over BACKLOG sections (`sections()`). Reuse its reader for the finding-to-fixture sweep.
- `plugin/skills/corpus-chaos/SKILL.md` already has a runner and an asker half, and already says a confirmed finding changes the reader and a field of `expected.json` (:76-78). Reshape: T5 extends that sentence rather than writing a second one, and T7 adds the loop's steps and the triage rule.

## Decision

Corpus chaos becomes a release step with four mechanical parts and one rule.

1. **The report says which readers answered.** `probe.readers` is `{ sha256, git, dirty }`: a sha256 over the LF-normalised text of every reader file (the plugin's `scripts`, `bin`, `lib` and `hooks`, the directories `READER_PATHS` names), in sorted path order; the plugin checkout's commit when the plugin root is the top of a git work tree, else `null`; and whether any reader file differs from that commit. The commit is a separate field, never hashed in, so the fingerprint moves only when a reader does.
2. **The runner diffs two saved reports.** `corpus-probe --diff <before.json> <after.json>` runs nothing and prints only what changed. It re-applies the scrubber to both, so no absolute path leaves; repository-relative paths and reader text do, which is why a report is never committed (CLAUDE.md §6).
3. **The probe writes the attestation from a saved report.** `corpus-probe --attest <label> <report.json>` runs nothing and prints the attestation in the `docs/corpus-reports/README.md` schema, so no count is transcribed. Its `at` is the report's `readers.git` only when `readers.dirty` is false; otherwise `null` with the reason, because `release-evidence` compares commits and cannot see a runner's uncommitted reader edits.
4. **Every reader spawn is timed.** The report carries `timings[]` (reader, scrubbed target, `ms`) for every spawn, including one that failed, and `slowest[]`, the five longest.

So a runner probes once and runs two cheap commands: `corpus-probe <root> --json > new.json`, `corpus-probe --diff old.json new.json`, `corpus-probe --attest <label> new.json`.

The rule: **a confirmed wild finding changes the reader AND lands in a fixture corpus's `expected.json`**. An advisory sweep names every BACKLOG section after §282 whose heading says it was reported from an outside run and whose body names no fixture corpus and no waiver; earlier sections are history and are not rewritten (CLAUDE.md §10). Three fixture corpora are added now, for the shapes found this week. The peer protocol in the skill says:
- probe once per batch, from a checkout at the release-candidate sha;
- ask every runner for the diff and the attestation;
- triage each lead into one of four classes.

A false refusal or a fail-open is fixed in the batch. Wording goes to the next batch. The corpus's own problem is told to its owner. Behaviour that is by design is recorded.

**What would make it fail:**
- `--diff` over two reports that differ in a verdict, a set, the readers or a timing past its floor reports nothing — or reports a difference between two identical reports;
- `--diff` prints an absolute path that one of its inputs carried;
- `--attest` emits an attestation `outsideRun` does not accept, or one with a commit in `at` for a report taken over uncommitted reader edits;
- the fingerprint does not change when any reader file changes;
- a fixture corpus's `expected.json` does not fail when the reader it pins is reverted.

Each has a test or a mutant in its task. The criterion is valid for a probe run over a git repository; over a directory git cannot list the probe already reports `look: UNPROVEN`, and the diff says so rather than comparing.

## Alternatives Considered

- **Keep corpus chaos as an occasional, hand-run favour.** Rejected: that is what this week was, and every comparison and attestation cost a peer's hand work.
- **`--diff` and `--attest` as flags on a probe run.** Rejected by the cold review: a runner following the steps ran the probe three times (recorded runs took 60 s to 584 s), and a combined run had two JSON documents competing for stdout. Both read a saved report instead.
- **Commit peers' reports and diff them here.** Rejected: a report is another repository's content, and CLAUDE.md §6 forbids committing it. The diff runs on the runner's machine.
- **Generate fixtures from reports automatically.** Rejected for the same reason, and because an `expected.json` is reviewed, never snapshotted (`tests/fixtures/corpora/README.md`). A fixture is authored from the finding's shape, not copied from the corpus.
- **Make release-evidence read the fingerprint instead of `at`.** Rejected: `at`'s git ancestry check proves the run saw every reader change, which a content hash alone cannot place in history. The fingerprint is for the diff and for a human reading two attestations.
- **Keep a second copy of `READER_PATHS` in the probe.** Rejected: duplicated knowledge nothing would notice drifting. The constant moves; both sides import it.
- **Keep reviewing heuristic readers until no finding remains.** Rejected by the owner on 2026-09-24. One round per behaviour change, and residuals recorded.

## Component / Boundary Impact

- `plugin/scripts/reader-paths.mjs` is new: the reader directories, imported by the probe and by `scripts/release-evidence.mjs`.
- `plugin/scripts/corpus-probe.mjs` gains `probe.readers`, `timings[]`, `slowest[]`, and two modes that read saved reports (`--diff`, `--attest`); it still writes nothing into the probed repository.
- `plugin/skills/corpus-chaos/SKILL.md` gains the loop's steps and the triage rule.
- `docs/corpus-reports/README.md` names `--attest` as the way an attestation is made.
- `scripts/chaos-fixture-sweep.mjs` is new and advisory; it ships nowhere (it is under `scripts/`, not `plugin/`).
- `tests/fixtures/corpora/` gains three corpora; `tests/corpus-matrix.test.mjs` gains two comparisons.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `READER_PATHS` | moves to `plugin/scripts/reader-paths.mjs` | `reader-paths.mjs` | `corpus-probe.mjs`, `scripts/release-evidence.mjs` |
| probe report `probe.readers` | new field `{ sha256, git, dirty }` | `corpus-probe.mjs` | `--diff`, `--attest`, a human |
| probe report `timings[]`, `slowest[]` | new fields | `corpus-probe.mjs` | `--diff`, a human |
| `corpus-probe --diff <before> <after>` | new mode; reads two reports, runs nothing, exit 0 (2 when a file does not parse) | `corpus-probe.mjs` | a peer runner |
| `corpus-probe --attest <label> <report>` | new mode; reads one report, runs nothing, prints an attestation | `corpus-probe.mjs` | `docs/corpus-reports/`, `release-evidence.mjs` (logic unchanged) |
| fixture corpora | three new directories with `expected.json` | this repository | `tests/corpus-matrix.test.mjs` |
| matrix comparisons | `reasonMatches` per adrLint file; every `workNext` key an `expected.json` names | `tests/corpus-matrix.test.mjs` | the fixture corpora |

Every report field is additive; a report written before this record still parses, and `--diff` against one says which fields it lacks.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `probe.readers` | T1 | T2, T3 | No |
| `timings[]` | T4 | T2 | No |
| `--diff` and `--attest` | T2, T3 | T7 | No: T7 documents them |

## Implementation

See `tasks/README.md`: seven tasks in three waves. T1 and T4 extend the report; T2 and T3 add the two modes over saved reports; T5 adds the rule and its sweep; T6 adds the three fixture corpora; T7 writes the protocol into the skill.

## Consequences

- **Positive:** a peer's run costs one probe and two cheap commands. A finding stays pinned on every platform. A slow reader is visible in the report instead of being noticed by chance. An attestation cannot attest uncommitted readers.
- **Negative:** three more corpora for the matrix to run on every CI platform, at a cost T6 measures and records. `expected.json` files have to be kept in step when a reader's answer changes on purpose. A runner on an installed plugin cache gets `at: null`, so an attestation needs a checkout.
- **Neutral:** release-evidence's logic is unchanged, and so is what any gate says about a session's own work.

## Out of Scope

- Changing `--sweep`, which runs a corpus's fences (permanent: boundary: it needs the corpus owner's approval, and this record changes only what the probe reports)
- Release-evidence reading the fingerprint (permanent: boundary: `at` and git ancestry prove the run saw every reader change; see Alternatives)
- Committing any peer's report or deriving a fixture from its content (permanent: boundary: CLAUDE.md §6)
- A scheduled or automatic peer run (permanent: boundary: a peer's permission classifier and its user decide whether foreign code runs, and a schedule cannot)
- Redacting record ids and task names from the report (permanent: boundary: the report stays on the runner's machine; only the attestation, which carries none, is committed)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `--diff` re-emits an absolute path an older report leaked | Med | High | the diff re-scrubs both inputs; a test feeds it a report carrying one |
| an attestation claims readers the runner did not run | Med | High | `at` is `null` when `readers.dirty` is true or the plugin is not a checkout; a test covers both |
| an `expected.json` pins an accident rather than a decision | Med | Med | reviewed, per the fixtures README; each pinned value names the BACKLOG section it came from |
| the fingerprint changes between two runs of the same readers | Med | Low | the walk skips `__pycache__`, `.pyc` and dotfiles; a CRLF copy hashes as its LF twin |
| peers stop answering once asked every batch | Med | Med | one request per batch, at one sha, with one template; "could not run" is a useful answer |

## Rollback

Revert the commits. Every report field is additive and every mode is new; no attestation already filed stops being read.

## Follow-ups

- [ ] T6 step 2 asks for the matrix's added time per platform, read from a CI log; the corpora land in this push, so it is recorded in `tests/fixtures/corpora/README.md` from that push's run (deferred: docs/BACKLOG.md §286).
