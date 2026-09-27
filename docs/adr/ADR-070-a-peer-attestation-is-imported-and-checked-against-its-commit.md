# ADR-070: A peer's attestation is imported, and checked against its commit

**Status:** Accepted
**Date:** 2026-09-27
**Owner:** Zy
**Spec:** None — no spec stage; BACKLOG §301 Stage 5 (finding to fixture), its `attest-import` item
**Cross-references:** docs/adr/ADR-064-corpus-chaos-is-the-release-loop.md, docs/corpus-reports/README.md, docs/BACKLOG.md, CLAUDE.md
**Governs:** scripts/attest-import.mjs, docs/corpus-reports/README.md
**Enforced-by:** `tests/attest-import.test.mjs::an attestation is filed only when its digests are the ones its commit gives`
**Invalidates:** none — checked (ADR-064 keeps `release-evidence` reading `at` and its git ancestry, and puts "release-evidence reading the fingerprint" out of scope for good; this record checks the fingerprint when the file is MADE and leaves `release-evidence` unchanged)
**Served-path change:** None — this ADR changes only repository tooling (`scripts/`); nothing in `plugin/` changes.

## Context

A release that changes a reader needs an outside run (CLAUDE.md §18), attested by a file in `docs/corpus-reports/` that `scripts/release-evidence.mjs` reads. A peer runs `corpus-probe --attest` and pastes the JSON into a message; a maintainer then writes it into a file by hand. `release-evidence` reads only the file's `at` (ADR-064), so nothing checks the rest of what was typed.

**Measured 2026-09-27** over the 59 files in `docs/corpus-reports/`, recomputing at each file's `at` what the probe computes there (the probe's own digest, the readers fingerprint over the same directories and normalisation as `readerFingerprint`, and `plugin.json`'s version):
- 50 carry `kind: probe`: 41 agree on every field; 9 differ only in `plugin`, which was annotated by hand (`2.107.0 (main, pre-tag)`); none has a wrong `at`, probe digest or readers fingerprint.
- 9 carry `kind: hand`, a peer's pasted numbers with no digests to check.

In the 3.1.0 batch alone, six attestations were transcribed by hand from peers' messages. So the evidence has not been corrupted yet, but it is typed, and edited, where nothing would notice if a digest were wrong.

## Existing Primitives Audit

- `attestation(report, label)` in `plugin/scripts/corpus-probe.mjs` makes the JSON on the runner's machine. **Unchanged**; this record reads its output.
- `probeDigest` and `readerFingerprint` compute the two digests over files on a disk. **Re-derived from git** in `scripts/attest-import.mjs`, over the same `READER_DIRECTORIES` (`plugin/scripts/reader-paths.mjs`, imported, not copied) with the same skips and LF normalisation; the test proves the git-side value equals the probe's disk-side value on one checkout. Not moved into `plugin/`: it serves repository tooling only, and a shipped definition nothing shipped reaches is dead code (CLAUDE.md §13).
- `release-evidence`'s `readAttestations` / `outsideRun`. **Unchanged** (ADR-064's boundary).
- The `docs/corpus-reports/README.md` schema. **Kept** as the whitelist of keys.

## Decision

`node scripts/attest-import.mjs [--root <dir>] [--check] <file | ->` reads a peer's message as text and files the attestation in it, or refuses naming each reason. In order:
1. Every top-level JSON object in the text is found; exactly one may carry both `at` and `kind`. None, or more than one, is refused.
2. Its keys must be the README schema's (`date`, `at`, `atReason`, `plugin`, `kind`, `probeSha256`, `readers`, `platform`, `node`, `python`, `corpus` with `records`/`tasks`/`taskDirectories`/`countsFrom`, `couldNotRun`, `disagreements`, `readinessUnproven`, `runner`, `found`). Any other key is refused: what gets committed is an attestation, never a report (CLAUDE.md §6).
3. `kind` must be `probe`. A hand attestation has no digest to check and stays filed by hand.
4. `at` must be a full 40-hex sha and a commit in the repository; one the clone does not have is exit 3, "fetch it", never a refusal of the run.
5. `probeSha256` must equal the sha256 of `plugin/scripts/corpus-probe.mjs` at `at`; `readers` must equal the readers fingerprint computed from git at `at`; `plugin` must equal `plugin.json`'s version at `at`.
6. The file is named `<date>-<runner>-<plugin>-<at, 7 characters>.json`, the runner lowercased with anything outside `a-z 0-9 . -` made `-`; a file already holding the same `at` and `runner` is refused as a duplicate.
7. It is written as `JSON.stringify(attestation, null, 2) + '\n'`, keys in the schema's order. `--check` does every step but the write.

Exit codes: 0 filed (or, with `--check`, would be); 1 refused, every reason listed; 2 usage; 3 could not look (`at` unknown to this clone, or git failed).

**What makes it fail.** In the test's scratch repository, an attestation whose digests the real `probeDigest` and `readerFingerprint` compute over that checkout must be filed, and filed byte-for-byte as described. Each of these must be refused and write nothing: one character changed in `readers` or in `probeSha256`, a `plugin` annotated as the nine above were, a report key beside the attestation, two attestations in one message, a short `at`, a `kind: hand`, and a duplicate. An `at` the scratch repository lacks must exit 3. Once built, `--check` over the 50 filed probe attestations must pass the 41 and refuse the 9 for their `plugin`, as the measurement above found; the counts are recorded in BACKLOG.

## Alternatives Considered

- **`release-evidence` verifies every attestation's fingerprint.** Rejected: ADR-064 put that out of scope permanently, because `at` and its ancestry are what place a run in history. A file made by this tool is checked once, at filing; a file edited afterwards is the residual named below.
- **A peer commits its own attestation here.** Rejected: a peer never edits another project's tree (the cross-session protocol), and its permission classifier decides what it may run.
- **Keep transcribing by hand.** Rejected on the measurement: six hand filings in one batch, and nine hand-edited fields already in the directory, with nothing able to notice a wrong digest.
- **Accept `kind: hand` with lighter checks.** Rejected for now: there is no digest to hold it to, so the tool would only format typing. It stays by hand, deferred below.

## Component / Boundary Impact

None — a new script in `scripts/`, repository tooling that never ships.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `scripts/attest-import.mjs` | new CLI | T1 | a maintainer filing a peer's run |
| `docs/corpus-reports/README.md` | "How to file one" names the command | T1 | the Asker role of `/quality-harness:corpus-chaos` |
| `CLAUDE.md` §18 | the filing step names the command | T1 | every session cutting a release |

## Inter-task Contracts

None — one task.

## Implementation

See `tasks/README.md`: T1.

## Consequences

- **Positive:** a filed probe attestation carries digests proven against its commit; filing is one command instead of a transcription.
- **Negative:** one more script to keep in step with the attestation schema; the whitelist and the README must change together.
- **Neutral:** `release-evidence` still trusts a file edited after import; the nine hand-annotated `plugin` fields stay as history.

## Out of Scope

- `release-evidence` reading the fingerprint (permanent: boundary: ADR-064, which this record keeps)
- A hand attestation, with no digest to check (deferred: docs/BACKLOG.md §301)
- An audit of every filed attestation in CI, which would also catch an edit after import (deferred: docs/BACKLOG.md §301)
- Rewriting the nine annotated `plugin` fields (permanent: boundary: the directory is evidence, and history is not rewritten, CLAUDE.md §10)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The git-side fingerprint drifts from `readerFingerprint`'s disk walk | Med | High | one test computes both over the same checkout and requires equality; `READER_DIRECTORIES` is imported, not copied |
| A pasted message holds a report's content | Low | High | the key whitelist refuses it and nothing is written |
| The peer ran a dirty or moved tree | Low | Med | the probe already sets `at` to null then; a null `at` is refused at step 4 |

## Rollback

None — repository tooling only; revert the commit. Files it wrote are ordinary files in `docs/corpus-reports/`.

## Follow-ups

- [ ] After the next release, count attestations filed by the tool against those filed by hand.
