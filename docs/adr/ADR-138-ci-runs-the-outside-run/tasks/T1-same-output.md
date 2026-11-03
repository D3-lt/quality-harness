# Task ADR-138-T1: Two probe reports compare equal only when every recorded output is equal

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `sameOutput(before, after)`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`sameOutput(before, after)` in corpus-probe.mjs is true only when the two reports are equal after removing a closed list of run
fields (`RUN_FIELDS`: the readers and native digests and identities, timings, load, dates, the scratch clones' absolute paths).
Every other field, including ones added later, is compared whole.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | modify | `RUN_FIELDS` and the exported `sameOutput`, beside `diffReports` |
| `tests/probe-same-output.test.mjs` | add | Run-field-only differences are equal; a change in a field `diffReports` skips is not; a new field is not |
| `tests/mutations/plugin/scripts/corpus-probe.mjs.json` | modify | A widened run-field list is noticed |

## Ordered Steps

1. [S1] Write the failing test: two real `--json` reports of one fixture corpus, then copies differing only in run fields
   (equal), in `corpusReport.totals`, in an `adrNext` ready task's `unproven`, in a second adr-lint finding's text, and in a
   field neither names (each unequal), and the list's every entry named.
2. [S2] Implement `RUN_FIELDS` and `sameOutput`.
3. [S3] Add mutants on the list and the comparison; record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/probe-same-output.test.mjs 2>&1 | tee "$out" && grep -q '✔ two reports are the same output only when every recorded field but the run fields is equal' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `two reports are the same output only when every recorded field but the run fields is equal` | `tests/probe-same-output.test.mjs` | The closed list, both directions, fields diffReports skips | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `sameOutput` |
| 2 — selected | T2, T3 |
| 3 — discoverable | T2 |
| 4 — used | T3 |

## Mutation Log

## Invariants

`diffReports`, `--diff` and `--json` print exactly what they print today.

## Risks

A run field missed reads as output: the safe direction, a person asked.

## Stop Condition

Stop if a run field cannot be named by its path in the report.

## Out of Scope

- The probe recording more than one FAIL finding per record (permanent: boundary: a reader change; the record names the limit)
- The CI job (T2).

## Verification Log
