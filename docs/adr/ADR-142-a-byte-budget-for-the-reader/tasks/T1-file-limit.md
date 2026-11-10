# Task ADR-142-T1: Every read in a look stops at 512 KiB, and says so

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the README-size `unproven` reason; `over 512 KiB` entries in `incomplete`
**Consumes:** `incomplete` and the PARTIAL line (T4), `tests/helpers/decision-rows.mjs` (T4)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The cached readers and the archive-marker walks read through the 512 KiB bounded reader in Node and the core alike, and an
oversized task file or README is entered in `incomplete`, so the decision context warns instead of reading it whole or going
silent (ADR-142 Decisions 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/decision-corpus.mjs` | edit | `corpusReader().text` (:1042-1045) through `readRegularText(file, 512 * 1024)`; the README walk (:114, :120) the same; the README-size reason in `archiveDecisionEffect` (:748, :754) |
| `core/hooks/decisioncorpus.go` | edit | `dcReader.text` (:1696-1716) through `dcReadBounded(file, dcRecordLimit)`; the README-size state in `dcArchiveDecisionEffect` (:1815) |
| `core/hooks/orientation.go` | edit | `readRegularText` (:163-173) bounded at the same limit; its callers :201, :234 keep `unknown` on error |
| `tests/decision-file-limit.test.mjs` | add | Builds the oversized shapes, asserts Node's answer, and runs both Go tests over the same rows |
| `tests/mutations/plugin/scripts/decision-corpus.mjs.json` | edit | A mutant per bounded read: the limit dropped from the cached reader and from the README walk |
| `tests/mutations/core/hooks/decisioncorpus.go.json` | edit | The limit dropped from `dcReader.text` |
| `tests/mutations/core/hooks/orientation.go.json` | edit | The limit dropped from `readRegularText` |

## Ordered Steps

1. [S1] Confirm the failing test exists and is red (TDD red): write `tests/decision-file-limit.test.mjs` with four shapes in
   scratch git repositories — an Accepted record governing `src/big.js` only through an owned task file of 600 KiB; an
   archive README of 600 KiB carrying the Lifecycle line above a record that governs `src/a.js`; the same README at the
   repository root; and a README of 600 KiB under an archive-named directory read by `unmarkedArchives`. For the first it
   asserts the decision context for `src/big.js` is exactly `PARTIAL — what governs this file may be missing: over 512 KiB
   (<task path>)` and that `incomplete` names the task file; for the catalog README shapes (above a record), the UNPROVEN
   line with the size reason and the PARTIAL line. A fifth shape is a parity and replay row: an ordinary corpus that reads
   everything, plus `archive/README.md` of 600 KiB beside only `archive/tasks/T1.md`, no record under it, so only Node's
   archive-marker walk reads that README; it asserts Node's `incomplete` is empty, its look ok, and both readers print the
   same text for every row, with no PARTIAL line (ADR-142 Decision 1's boundary). Red: before the change the task file is
   read whole and `src/big.js` is governed.
2. [S2] Bound the Node reads: `corpusReader().text` and the two `underFrozenArchive` reads call `readRegularText(file, 512 *
   1024)`; an `EFBIG` enters `incomplete` with `over 512 KiB` through T4's sites, and from a README makes
   `archiveDecisionEffect` return `{ unproven: 'the README beside it runs past 512 KiB, so whether this is an archive is
   unknown' }`, any other failure the existing reason.
3. [S3] Bound the core's reads the same way: `dcReader.text` through `dcReadBounded`, `errDcTooBig` entered in `incomplete`
   with the same reason, from a README a catalog state `too-big` with the same sentence, `readRegularText` in orientation.go
   refused past the limit.
4. [S4] Run the new rows through `TestDecisionCorpusParity` and `TestDecisionContextReplay` from the new test; zero
   disagreements, and the warning for `src/big.js` byte-identical in both.
5. [S5] Add the catalogue mutants and record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/decision-file-limit.test.mjs 2>&1 | tee "$out" && grep -q '✔ an oversized task file or README is refused and warned about at the edit, in Node and the core alike' "$out" && node --test tests/decision-context-parity.test.mjs tests/decision-context-replay.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an oversized task file or README is refused and warned about at the edit, in Node and the core alike` | `tests/decision-file-limit.test.mjs` | The four shapes in Node, the PARTIAL line where scope was lost, and both Go tests over the same rows with zero disagreements | — | S1, S2, S3, S4 |
| `the archive-marker walk calls an oversized README unknown` | `tests/decision-file-limit.test.mjs` | `unmarkedArchives` in Node and the SessionStart core name the same directories over the oversized README | — | S2, S3 |
| `a README only the archive walk reads adds no PARTIAL, in Node and the core alike` | `tests/decision-file-limit.test.mjs` | The task-only archive with an oversized README: Node's `incomplete` empty, look ok, and the replay through `TestDecisionContextReplay` with zero disagreements and no PARTIAL line | — | S2, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the bounded `text` in both readers |
| 2 — selected | every task-file and README read in a look goes through it; the mutants drop the bound |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | the decision context before every edit, and adr-state, work-next, corpus-probe |

## Mutation Log

## Invariants

- A file not read is never read as empty: it is an error, cached, entered in `incomplete`, and handled as each caller handles
  an unreadable file today.
- The record read keeps its own bound and its reason (`over 512 KiB`).

## Risks

- A README past 512 KiB above many records turns them all UNPROVEN; the reason says why (ADR-142 Risks).
- The fixtures are synthetic; a real oversized README is met only by the outside run (CLAUDE.md §18).

## Stop Condition

Stop if any shape gives an empty decision context where a record's scope was refused: T4's line is then not reached, and no
limit lands without it. Stop also if a real corpus we can read has a README past 512 KiB above its records (then the
streamed alternative is the owner's call).

## Out of Scope

- The look's aggregate budget (T2).
- work-next's own bounded reads (ADR-142 Out of Scope).

## Verification Log
