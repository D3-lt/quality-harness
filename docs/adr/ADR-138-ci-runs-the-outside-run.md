# ADR-138: CI runs the outside run, and a person reads only what changed

**Status:** Accepted
**Date:** 2026-11-03
**Owner:** Zy
**Spec:** None — no spec stage; the owner's decision of 2026-11-03 and docs/BACKLOG.md §453 are the inputs
**Cross-references:** docs/adr/ADR-064-corpus-chaos-is-the-release-loop.md, docs/adr/ADR-070-a-peer-attestation-is-imported-and-checked-against-its-commit.md, docs/adr/ADR-082-an-attestation-says-what-changed.md, docs/adr/ADR-118-main-lands-only-a-sha-ci-passed.md, docs/adr/ADR-126-one-run-per-release.md, CLAUDE.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; each adds mutants on the decision it implements
**Invalidates:** ADR-064 — "a release that changes a reader waits for a peer's run": a peer is now asked only when the readers' output changed on CI's corpora. ADR-082's regression veto is kept and widened: a verdict leaving PASS in CI's run vetoes as a peer's does
**Served-path change:** None — this ADR changes only release tooling and the release evidence; nothing an adopter's session runs changes

## Context

The owner, 2026-11-03: "let's stop at adding functionality … we need faster releases". Measured the same day on v3.8.67 and
v3.8.68: CI's landing run takes about 31 minutes (run 41653363871, 14:24 to 14:55), and the outside run that §18 requires took
hours each time. Every Windows peer was offline for most of the day; two macOS peer sessions refused to run cloned code until
their users approved it in those sessions; v3.8.68 changed one printed line in `plugin/scripts/qh-fetch.mjs` and still needed a
full peer run, because every file under `plugin/scripts`, `plugin/bin`, `plugin/lib`, `plugin/hooks` and `core/` counts as a
reader (`READER_PATHS`, scripts/release-evidence.mjs:384).

What the peer run is for is written down (.claude/rules/18-somebody-else-runs-it.md): on 2026-09-23 two Windows peers reading
the released readers' whole output over a corpus unlike ours found six defects in an hour, three of them in output no
structured expectation asserted. Two parts of that are separable. Running the readers on Windows over a corpus we do not own is
mechanical, and CI can do it on every landing. Reading what they said is not mechanical, and is only worth a person's time when
what they said changed. On 2026-11-03 a Windows peer's `--diff` over a 69-record corpus showed exactly that: seven advice lines
gone, one changed, every verdict held, and the peer read and explained them.

## Existing Primitives Audit

- `plugin/scripts/corpus-probe.mjs`: `--json`, `--attest`, and `diffReports` (corpus-probe.mjs:599), which explains how two
  reports differ over a chosen subset of their fields. Reused to explain; T1 adds the whole-report normalized comparison.
- `scripts/attest-import.mjs` (ADR-070): verifies an attestation's digests against its commit. Reused as the verification rule
  for a CI attestation.
- `scripts/release-evidence.mjs` `outsideRun` / `outsideRunEvidence` (release-evidence.mjs:293, 394): the outside-run question.
  Reshaped: a CI attestation from the landing run answers it when no reader output changed.
- `scripts/release-assets.mjs`: hands a run's CI-built cores to a runner; the CI job takes the candidate core from its own run
  the same way. `plugin/scripts/qh-fetch.mjs`: fetches a published core; the job takes the last tag's core with it.
- The landing run (ADR-126): every `land/<sha>` push is the full campaign. The new job is one more job in it.

## Decision

1. **A CI job runs the outside run on every landing.** In the landing run, a `windows-latest` job checks out the last tag and
   the candidate, takes the tag's core with `qh-fetch` and the candidate's from this run's own core assets, and runs
   `corpus-probe --json` with each over every corpus in a committed list: public repositories this one does not own, each
   pinned to a sha (`scripts/outside-corpora.json`), and the fixture corpora under `tests/fixtures/corpora`, taken from the
   candidate for both runs. It writes, per corpus, the candidate's attestation (`--attest ci-windows-<shape> --since`) and the
   comparison of the two runs, into one artifact, `outside-run.json`, whose contract is item 4.
2. **A person is asked only when the output changed.** `release-evidence` takes that artifact from the landing run and verifies
   it (item 4). When every expected corpus was probed exactly once, none could not run, no verdict left PASS, and the two
   normalized reports are equal on every corpus, the outside run is answered. When they differ on any corpus, it answers
   UNPROVEN, names the corpora and explains the difference with `diffReports`, and asks for a reading as it asks for a peer's run
   today; a filed peer attestation then answers it. A verdict that left PASS in CI's run vetoes the release whatever a peer
   filed (ADR-082's veto, applied across both sources).
3. **"Unchanged" is equality of the whole report, normalized**: every field the probe writes, compared after removing a closed
   list of run fields (the readers and native digests and identities, timings, load, dates, absolute paths of the scratch
   clones). The list sits in one function and its test names every excluded field; a field the probe adds later counts as
   output until someone names it a run field (§16: unrecognised is not safe). `diffReports` only explains a difference; it is
   never the test, because it compares a chosen subset (it skips `corpusReport` and reduces ready tasks to ids: the cold review
   of this record, 2026-11-03).
4. **The artifact proves its own comparison.** `outside-run.json` names the workflow run id, the candidate sha, the baseline:
   the last tag and its sha, as reachable from the candidate, both cores' identities, and per corpus its id, its pinned sha (or,
   for a fixture, its path and content digest), both reports' digests and the comparison's result. `release-evidence` requires
   the run to be the sha's landing run, the baseline to be the tag release-evidence itself names, and the corpus set to be
   exactly the committed list plus every fixture directory at the candidate: missing, duplicated, malformed, partial or
   uncompared entries are could-not-look, never answered.

What this does and does not protect, said plainly: it is a bounded regression check. On the listed corpora it guarantees that
nothing the probe records changed. It does not replace what a peer reading a corpus unlike ours protects: unfamiliar shapes,
defects already present in both versions, and output the probe never records (it keeps one FAIL finding per record, so a change
to a later finding is invisible to it). Those stay with peer runs and corpus chaos, asked for when output changed and run
voluntarily otherwise, and every shape they find becomes a fixture (§18), so the bounded check grows. Data that can show a miss
exists today: the fixture corpora, and the five public corpora surveyed 2026-11-03 (21, 9, 17, 38 and 46 ADR-like files).

## Alternatives Considered

- **Keep a peer run for every reader change.** Correct, and hours per release: on 2026-11-03 it depended on peers being online
  and on their users' approval. Rejected by the owner for release speed.
- **Narrow the trigger with a reviewed list of non-reader files** (qh-fetch, statusline, the review launcher). Rejected: a hand
  list over an open set of files is a classifier that goes stale silently (§16), and its failure direction skips a needed run.
  Measuring whether the output changed answers the same question for every file, including ones nobody listed.
- **CI attests, and nobody reads anything.** Rejected: it keeps the mechanical half of §18 and drops the half that found the
  defects (rule file, 2026-09-23).

## Component / Boundary Impact

- `plugin/scripts/corpus-probe.mjs`: gains an exported normalized-report comparison (T1). Ships, but no hook calls it.
- `.github/workflows/selftest.yml` and a new `scripts/outside-run.mjs`, `scripts/outside-corpora.json`: repository tooling (T2).
- `scripts/release-evidence.mjs`, `scripts/release.mjs`, CLAUDE.md §18 and its rule file: the release's evidence (T3).

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `sameOutput(before, after)` and `RUN_FIELDS` exports | new | corpus-probe.mjs (T1) | scripts/outside-run.mjs (T2), release-evidence (T3) |
| `outside-run.json` artifact of the landing run | new | the `outside run` CI job (T2) | release-evidence (T3) |
| `scripts/outside-corpora.json` | new | committed, reviewed | the CI job (T2) |
| Outside-run evidence rule | widened: a verified CI attestation with no output change answers it | release-evidence (T3) | release.mjs, the owner |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `sameOutput(before, after)` | T1 | T2, T3 | No — new export |
| `outside-run.json` | T2 | T3 | No — new artifact |

## Implementation

See `ADR-138-ci-runs-the-outside-run/tasks/README.md`.

## Consequences

- **Positive:** a release whose reader output did not change needs no person and no wait beyond CI; one whose output changed
  hands the reader a diff, not a whole report. Windows becomes a platform every release is probed on, not only when a peer is
  online.
- **Negative:** each landing run gains a Windows job (about the windows selftest's order, to be measured); the public corpora are
  fetched from GitHub on every landing. §18's exploratory protection is no longer asked for on every reader change: only when
  output changed. That is the owner's trade for release speed, made 2026-11-03.
- **Neutral:** peer runs and their attestations stay valid and are still asked for whenever output changed.

## Out of Scope

- Cutting CI's own wall-clock (the 28-minute Python coverage job is its longest) (deferred: docs/BACKLOG.md §459)
- Corpus chaos by peers (hostile shapes on scratch copies) stays voluntary and outside the release (permanent: boundary: it hunts new shapes, which this job then carries once they are fixtures)
- Running the job on macOS and Linux as well (permanent: boundary: §18 names the platform we cannot run; the matrix already runs every platform over the fixtures)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A pinned public corpus disappears or its sha is gone | Low | Med | The job says could-not-run for it; the release falls back to a peer run, never to "answered" |
| A fingerprint line kind is added and read as output | Med | Low | Fails toward asking a person; T1's test names the closed list |
| A reader change shows on no listed corpus | Med | Med | Same gap as one peer corpus; fixtures grow with every found shape (§18) |
| GitHub rate limits the clones | Low | Low | Shallow, blob-filtered clones of five repositories; could-not-run on failure |

## Rollback

Remove the job and revert release-evidence's CI branch: the peer-run path is untouched throughout, so the evidence rule
returns to today's.

## Follow-ups

- [ ] Measure the landing run's critical path before changing it (docs/BACKLOG.md §459)
