# Spec: An attestation says what its run changed

> **Date:** 2026-10-02 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-082 (`docs/adr/ADR-082-an-attestation-says-what-changed.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** BACKLOG §338, §337; ADR-064 (outside-run attestation); ADR-070 (attest-import); CLAUDE.md §18

## Problem

An outside run is the evidence `release-evidence` requires before a reader ships (§18). It is filed as a counts-only attestation, and nothing in that attestation says whether the run's verdicts got worse. On 2026-10-02 a runner's `--diff` showed two of its records go adr-lint PASS → FAIL against 3.6.1, while its attest line said `"disagreements":0` and `"found":""` (BACKLOG §338). `disagreements` counts adr-next/work-next readiness splits (`compareReaders`, plugin/scripts/corpus-probe.mjs), not verdicts. `release-evidence` would have accepted that run for a release that falsely refused the runner's corpus.

## Goal

An attestation carries how many of the corpus's adr-lint verdicts moved since the runner's earlier report. `release-evidence` does not count a run whose verdicts regressed, or a new-format run that compared nothing.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Outside runner | human role (a peer session) | attest a run without sharing its report (§6) |
| `corpus-probe --attest` | system | turn a saved report into a counts-only attestation |
| `attest-import` | system | file an attestation after checking it against its commit |
| `release-evidence` | system | decide whether an outside run covers the sha being released |

## Use Cases

### UC-1: Outside runner attests a run against an earlier one

- **Trigger:** a runner has two saved reports of one corpus · **Preconditions:** both are corpus-probe reports
- **Main flow:**
  1. `corpus-probe --attest <label> <after> --since <before>`
  2. The attestation carries `verdictChanges: {compared, passToFail, failToPass}`.
- **Failure paths:** a. the two reports cannot be compared (different corpora, or one did not look) → `verdictChanges: null`, never zeros. b. no `--since` → `verdictChanges: null`.
- **Postconditions:** the counts come from the same comparison `--diff` prints.

### UC-2: Maintainer asks release-evidence about a sha

- **Trigger:** `release-evidence <sha>` · **Preconditions:** reader files changed since the last tag
- **Main flow:**
  1. Only attestations that cover the sha are read (as today).
  2. An attestation from plugin 3.8.0 on counts only when `verdictChanges` is an object with `passToFail` 0.
- **Failure paths:**
  a. Any covering attestation from 3.8.0 on reports a regression → UNPROVEN, naming those files and their counts, even when another run attests.
  b. Every covering attestation from 3.8.0 on carries no `verdictChanges` → UNPROVEN, saying it compared nothing.
- **Postconditions:** an attestation from before 3.8.0 is judged exactly as before.

## Scenarios

### UC1-S1 [happy] An attestation counts the verdicts that moved [@implemented] → `tests/corpus-probe.test.mjs::an attestation counts the adr-lint verdicts that moved since an earlier report`

```gherkin
Given an earlier report with three records PASS, FAIL, PASS and a later one with FAIL, PASS, PASS
When the later report is attested with --since the earlier one
Then verdictChanges is {compared: 3, passToFail: 1, failToPass: 1}
```

### UC1-S2 [failure] Nothing compared is null, never zero [@implemented] → `tests/corpus-probe.test.mjs::an attestation that compared nothing says null, never zero`

```gherkin
Given a report attested without --since, or against a report of another corpus
When the attestation is built
Then verdictChanges is null
```

### UC1-S3 [happy] The command line attests with --since [@implemented] → `tests/corpus-probe.test.mjs::corpus-probe --attest --since prints the verdict changes`

```gherkin
Given two saved reports on disk
When corpus-probe --attest x after.json --since before.json runs
Then it exits 0 and prints the attestation with its verdictChanges
```

### UC2-S1 [failure] A run whose verdicts regressed does not attest [@implemented] → `tests/release-evidence.test.mjs::an outside run whose own verdicts regressed does not attest a release`

```gherkin
Given the only covering attestation is from 3.8.0 with passToFail 1
When release-evidence judges the outside run
Then it is UNPROVEN, naming the file and the count
```

### UC2-S2 [failure] A new-format run that compared nothing does not attest [@implemented] → `tests/release-evidence.test.mjs::an attestation from 3.8.0 on must say what it compared`

```gherkin
Given the only covering attestation is from 3.8.0 with verdictChanges null
When release-evidence judges the outside run
Then it is UNPROVEN, saying the run compared nothing
```

### UC2-S3 [happy] Older attestations and recoveries still attest [@implemented] → `tests/release-evidence.test.mjs::an older attestation, or a run that only recovered verdicts, still attests`

```gherkin
Given an attestation from 3.7.2 with no verdictChanges, or one from 3.8.0 with passToFail 0 and failToPass 2
When release-evidence judges the outside run
Then it is attested, and the recovery is named in the reason
```

### UC2-S4 [failure] attest-import refuses a malformed verdictChanges [@implemented] → `tests/attest-import.test.mjs::attest-import files verdictChanges and refuses a malformed one`

```gherkin
Given an attestation whose verdictChanges carries a key outside its schema or a non-count
When attest-import checks it
Then it is refused with the reason, and a well-formed one is filed
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | `attestation(after, label, { since: before })` carries `verdictChanges: {compared, passToFail, failToPass}`. `compared` counts the adr-lint records present in both reports; `passToFail` counts those that were PASS and are anything else now (FAIL or could not run); `failToPass` counts the reverse. | `tests/corpus-probe.test.mjs::an attestation counts the adr-lint verdicts that moved since an earlier report` | @implemented | |
| F-2 | With no `since`, or reports that `diffReports` would not compare (a `look` other than ok, or different corpora), `verdictChanges` is null, never zeros. | `tests/corpus-probe.test.mjs::an attestation that compared nothing says null, never zero` | @implemented | |
| F-3 | The verdict comparison is one function both `diffReports` and `attestation` call, so the line `--diff` prints and the count an attestation carries cannot disagree. | `tests/corpus-probe.test.mjs::an attestation counts the adr-lint verdicts that moved since an earlier report` | @implemented | |
| F-4 | `corpus-probe --attest <label> <report> --since <earlier>` prints that attestation and exits 0; an unreadable `--since` file exits 2 as an unreadable report does. | `tests/corpus-probe.test.mjs::corpus-probe --attest --since prints the verdict changes` | @implemented | |
| F-5 | In `outsideRun`, a covering attestation whose `plugin` is 3.8.0 or later counts only when `verdictChanges` is an object with `passToFail` 0. Any covering one from 3.8.0 on with `passToFail` above 0 makes the verdict UNPROVEN of kind `regressed`, naming each such file with its count, even when another run attests: a regression one corpus reports is not outvoted by a corpus that did not see it. When none counts and none regressed, the verdict is UNPROVEN of kind `uncompared`. | `tests/release-evidence.test.mjs::an outside run whose own verdicts regressed does not attest a release` | @implemented | |
| F-6 | An attestation whose `plugin` is before 3.8.0, or not a version, is judged exactly as before. A `failToPass` alone never refuses; the attested reason names it. | `tests/release-evidence.test.mjs::an older attestation, or a run that only recovered verdicts, still attests` | @implemented | |
| F-7 | `attest-import` accepts `verdictChanges` as null or as an object of exactly `compared`, `passToFail`, `failToPass`, each a non-negative integer with `passToFail + failToPass <= compared`, and refuses anything else with a numbered reason. | `tests/attest-import.test.mjs::attest-import files verdictChanges and refuses a malformed one` | @implemented | |
| F-8 | From 3.8.0 a covering attestation must say what it compared: one with `verdictChanges` null does not attest. | `tests/release-evidence.test.mjs::an attestation from 3.8.0 on must say what it compared` | @implemented | |

## Domain

An outside run is a pair of probe reports over one corpus, and an attestation is its counts-only summary. `verdictChanges` is the movement of the adr-lint verdicts between the two reports.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `corpus-probe --attest` CLI | add `--since <report>` | outside runners; the peer request text in the release memory |
| attestation JSON (`docs/corpus-reports/*.json`, README schema) | add `verdictChanges` | `attest-import`, `release-evidence` |
| `release-evidence` verdict | two new UNPROVEN kinds, `regressed` and `uncompared` | the release chain (§13.5) |

## Non-Goals

- Carrying any record path, title or reason in the attestation: it stays counts only (§6).
- Re-deriving the counts in `attest-import`: the reports never leave the runner, so the counts are the runner's, like every other count.
- Comparing spec-verify or work-next verdicts: the probe report carries only adr-lint per-record verdicts today.
- Rewriting attestations already filed: they predate the field and are judged as before.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A real fix that turns a wrong PASS into a right FAIL (a stale row now caught) blocks a release | Med | Med | The refusal names the file and count. The maintainer files a fresh run whose earlier report already carries that FAIL, or asks the runner to confirm the row is stale and re-attest against a report taken after the fix. |
| A runner without an earlier report cannot attest a 3.8.0 run | Low | Med | They take a report at the last tag first; the peer request text says so. |

## Open Questions

## Verify

```bash
spec-verify --spec docs/specs/2026-10-02-an-attestation-says-what-changed.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Spec and ADR, or a patch? | non-behavioral | Spec + ADR (owner, 2026-10-02) |
| 2 | Which counts? | F-1 | passToFail and failToPass over adr-lint records, with compared |
| 3 | What does a run with nothing to compare carry? | F-2 | null, never zeros |
| 4 | Which attestations does the rule bind? | F-6 | those from the release that ships it (3.8.0) on |
