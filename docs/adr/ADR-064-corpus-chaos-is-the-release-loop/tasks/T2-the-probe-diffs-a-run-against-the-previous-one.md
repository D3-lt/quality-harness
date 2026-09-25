# Task ADR-064-T2: The probe diffs two saved reports

**Depends-on:** T1, T4
**Covers:** none — no spec
**Estimated scope:** M (one pure function, one mode)
**Owner:** unassigned
**Produces:** `corpus-probe --diff <before.json> <after.json>`
**Consumes:** `probe.readers` (T1), `timings[]` (T4)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a changed verdict is named`, `an unchanged report says nothing changed`, `no absolute path leaves the runner`, `an unreadable run is never compared`

## Goal

`corpus-probe --diff <before.json> <after.json>` runs nothing. It reads two saved reports and prints only what changed:
- `probe.readers`;
- the counts;
- the adrLint verdict and reason, by file;
- the `ready`, `unbacked` and `readinessUnproven` sets;
- `couldNotRun` and `disagreements`;
- SessionStart lines added and removed;
- any timing that at least doubled AND grew by at least 1000 ms, so load noise on a fast reader is not a line.

Every value from either file goes through the probe's scrubber again before it is printed, because an older probe's scrubber leaked Windows paths.

Two identical reports print one line saying nothing changed. A field present in only one report is named as missing from the other, never compared as empty. Two reports whose `corpora` differ print that, and are not compared. So do two where either `look` is not `ok`.

Exit 0 when both files parse, whatever changed. Exit 2 with the reason when either does not parse.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | edit | `diffReports(before, after)`, pure; a `--diff` arm in the argument parser taking two values; the header comment's usage (:20) and `usage()` (:331) |
| `tests/corpus-probe.test.mjs` | edit | the tests below |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the test(s) below and see each fail on an assertion (TDD red).
2. [S2] Add `diffReports` over two parsed reports, emitting scrubbed lines only. Wire `--diff <before> <after>` into `main` before any probe run, and add it to both usage sites.
3. [S3] Run the fence green, and record mutants with `adr-verify --mutant`: drop the adrLint verdict comparison; report every field as changed; skip the re-scrub. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/corpus-probe.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (corpus-probe --diff names what changed between two runs of one corpus|corpus-probe --diff over two identical reports says nothing changed|corpus-probe --diff re-scrubs its inputs and never compares an unreadable run)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `corpus-probe --diff names what changed between two runs of one corpus` | `tests/corpus-probe.test.mjs` | two reports differing in the readers, one adrLint verdict, one `unbacked` member and one timing past its floor produce exactly those four lines; a timing that doubled by under 1000 ms produces none; run through `main` as a process, so the mode is reachable | none | S1, S2 |
| `corpus-probe --diff over two identical reports says nothing changed` | `tests/corpus-probe.test.mjs` | the same report twice prints the no-change line and nothing else; a report missing `unbacked` is named as lacking it | none | S1, S2 |
| `corpus-probe --diff re-scrubs its inputs and never compares an unreadable run` | `tests/corpus-probe.test.mjs` | a report carrying `C:\Users\…` and a POSIX home path prints neither; different `corpora` and a `look: UNPROVEN` report each print the reason and no comparison | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `diffReports` |
| 2 — something selects it | the `--diff` arm in `main` |
| 3 — the caller can discover it | both usage sites and the corpus-chaos skill (T7) |
| 4 — it is used | every runner in the batch's chaos round |

## Mutation Log

## Invariants

- The diff prints no absolute path.
- `--diff` spawns nothing and writes nothing.

## Risks

- A report from an older probe lacks new fields; the diff names them instead of reading them as empty.

## Stop Condition

Stop and ask if a useful diff needs a value the scrubber cannot make path-free.

## Out of Scope

- Diffing two reports of different corpora (permanent: boundary: the runner diffs its own corpus; a mismatch in `corpora` is reported, not compared)

## Verification Log
