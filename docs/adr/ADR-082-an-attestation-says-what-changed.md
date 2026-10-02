# ADR-082: An attestation says what its run changed

**Status:** Accepted
**Date:** 2026-10-02
**Owner:** Zy
**Spec:** docs/specs/2026-10-02-an-attestation-says-what-changed.md
**Cross-references:** docs/adr/ADR-064-corpus-chaos-is-the-release-loop.md, docs/adr/ADR-070-a-peer-attestation-is-imported-and-checked-against-its-commit.md
**Governs:** plugin/scripts/corpus-probe.mjs, scripts/attest-import.mjs, scripts/release-evidence.mjs, docs/corpus-reports/README.md, plugin/skills/corpus-chaos/SKILL.md
**Enforced-by:** `tests/release-evidence.test.mjs::an outside run whose own verdicts regressed does not attest a release`
**Invalidates:** none — checked. ADR-064 and ADR-070 define the attestation and its filing; this record adds one field and one rule over it, and leaves every filed attestation judged as before.
**Served-path change:** `corpus-probe --attest` (shipped) gains `--since` and a `verdictChanges` field; `release-evidence` (repository tooling) refuses a run whose verdicts regressed or that compared nothing.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-10-02-an-attestation-says-what-changed.md). Decision-relevant deltas:

- **What happened.** On 2026-10-02, two outside runs reported 3.7.0's false refusal through their `--diff` output. Their attest lines said `"disagreements":0`, `"found":""` (BACKLOG §338). Had the runners sent only the attestation, as the protocol asks, `release-evidence` would have accepted 3.7.0.
- **The class.** These are the readers and writers of an attestation's fields.
  - Enumerated 2026-10-02 with `git grep -n -E "readinessUnproven|'disagreements'|disagreements:" -- scripts plugin docs/corpus-reports/README.md` and `git grep -n -e '--attest' -- plugin scripts docs/corpus-reports/README.md`.
  - corpus-probe's `attestation` and its CLI (`corpus-probe.mjs:590`, `:646`, `:670`, `:683`), and `attest-import`'s `KEYS` and `check` (`attest-import.mjs:22`, `:102`).
  - `release-evidence`'s `outsideRun` (`release-evidence.mjs:241`).
  - The two documents that teach `--attest`: `docs/corpus-reports/README.md:42` and `plugin/skills/corpus-chaos/SKILL.md:40-49`.
  - Left out: `work-next`'s own `readinessUnproven`, a different field of a different reader that shares the name.
- **The comparison already exists.** `diffReports` (`corpus-probe.mjs:516-531`) prints every adr-lint verdict that moved. This record counts the same comparison rather than writing a second.

## Existing Primitives Audit

- **`diffReports`** (`plugin/scripts/corpus-probe.mjs:474`): its adr-lint arm becomes one exported comparison that it and `attestation` both call.
- **`readReport`** (`corpus-probe.mjs:632`): it reads the `--since` file, so an unreadable one exits 2, as an unreadable report does.
- **`check`** (`scripts/attest-import.mjs:102`): it already refuses unknown keys with numbered reasons, and the new field joins `KEYS` with a shape check.
- **`outsideRun`** (`scripts/release-evidence.mjs:241`): it already sorts covering attestations from the rest; the new rule filters the covering ones.

## Decision

- **corpus-probe.**
  - `attestation(report, label, { since })` adds `verdictChanges`, counted by one exported `verdictMoves(before, after)` that `diffReports` also uses for its verdict lines. The field is `{ compared, passToFail, failToPass }`, or null when there is no `since` or the reports are not comparable (F-1, F-2, F-3).
  - `--attest <label> <report> --since <earlier>` passes it through (F-4).
- **attest-import.** `verdictChanges` joins `KEYS`. It must be null, or exactly the three non-negative integer counts with `passToFail + failToPass <= compared` (F-7).
- **release-evidence.**
  - A covering attestation whose `plugin` is 3.8.0 or later counts only when `verdictChanges` is an object with `passToFail` 0.
  - Any covering one from 3.8.0 on with `passToFail` above 0 makes the verdict UNPROVEN of kind `regressed` (files and counts named), even when another run attests. When none counts and none regressed, it is `uncompared` (F-5, F-8).
  - Earlier attestations are judged as before, and a `failToPass` never refuses (F-6).
- **Docs.** README and the corpus-chaos skill teach `--since`.

This fails if a run with one PASS → FAIL still attests: the first UC2 test asserts the refusal, and its twin asserts the same run with none attests.

## Alternatives Considered

- **Ship the per-record verdicts in the attestation.** Rejected: they name records and reasons, which §6 keeps out of the repository.
- **Have release-evidence compare two attestations from the same runner.** Rejected: counts alone cannot show which records moved, and a runner whose second run fixes one record and breaks another reads as unchanged.
- **Count every advice line too.** Rejected for now: the probe report holds advice per record, but advice moves for benign reasons (the JSX advice of 3.7.2), and a gate on it would refuse correct releases.

## Component / Boundary Impact

None — internal to `plugin/scripts/corpus-probe.mjs` (shipped) and two repository scripts.

## Wiring & Contract Changes

Inherited from docs/specs/2026-10-02-an-attestation-says-what-changed.md §Contracts Touched; delta: the exported `verdictMoves` in `corpus-probe.mjs`.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `verdictChanges` in the attestation JSON | T1 | T2, T3 | No — new field |

## Implementation

See `docs/adr/ADR-082-an-attestation-says-what-changed/tasks/README.md`.

## Consequences

- **Positive:** an outside run that reports a regression in its own verdicts can no longer attest the release it regressed.
- **Negative:** from 3.8.0 a runner needs an earlier report of the same corpus to attest. One taken at the last tag serves.
- **Neutral:** the field is counts only, so the attestation still says nothing about which records moved.

## Out of Scope

Inherited from docs/specs/2026-10-02-an-attestation-says-what-changed.md §Non-Goals; delta: none.

## Risks

Inherited from docs/specs/2026-10-02-an-attestation-says-what-changed.md §Risks; delta: none.

## Rollback

Revert the commits. An attestation filed with the new field stays valid JSON; after a revert, `attest-import` would refuse to file another one with that key until it is removed.

## Follow-ups

- [x] Update the peer request text in the release memory to ask for `--since` with a report taken at the last tag (done 2026-10-02, in the outside-run-before-tag memory).
