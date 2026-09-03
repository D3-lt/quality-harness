# Task ADR-028-T2: Report a step whose declared proof no run ever names

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one gate plus its tests)
**Owner:** unassigned
**Produces:** the `adr-lint` advisory `a step whose proof is a named test has a run that names it` (T2)
**Consumes:** ` · steps:S1,S3` trailing Verification Log field (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a step whose declared proof is a named test and which no exit-0 entry names is reported`, `a task carrying no steps field at all is not reported as uncovered`, `the advisory never changes the lint verdict`

## Goal

`adr-lint` tells an author which ordered steps have no run behind them, using the proof map it
already parses and the log it already reads — and says nothing at all about a task that predates the
field.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | the advisory, over the existing `proof_map` and Verification Log readers |
| `tests/gates.test.mjs` | edit | the advisory's three cases, including both directions |
| `tests/mutations.json` | edit | two catalogue entries |

## Ordered Steps

1. [S1] Write the failing tests first, all three: a step with a test-row proof and no naming entry is REPORTED; a task with no `steps:` field anywhere is SILENT, not uncovered; and the advisory leaves the exit code alone. Confirm red. (TDD red.) [proof: acceptance]
2. [S2] Read the declared steps and their proof kinds from the existing `proof_map`, and the `steps:` values from the existing Verification Log parser. Reuse both — a second parser for either would be the duplicate-source-of-truth defect this corpus keeps finding. [proof: acceptance]
3. [S3] Report only where the declared proof is a NAMED TEST. A step proved by `[proof: acceptance]` is covered by the fence the entry already records, and one proved by `[proof: human: …]` or `[proof: mutation]` has its own lane — reporting those would be advice nobody can act on. [proof: acceptance]
4. [S4] Emit through `errors.advise(...)`, never `errors.append(...)`, and word it so it names the two counts it took and claims nothing about how many steps a task ought to declare. [proof: acceptance]
5. [S5] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/gates.test.mjs 2>&1 | tee /tmp/adr028-t2.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr028-t2.out \
  && python3 plugin/bin/adr-lint docs/adr/ADR-018-every-ordered-step-names-its-proof.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a step whose proof is a named test has a run that names it` | `tests/gates.test.mjs` | the gap this record was written for is reported | — | S1, S2, S3 |
| `a task with no steps field is silent, not uncovered` | `tests/gates.test.mjs` | "I could not look" is not "nothing was proved" (ADR-005), and no existing record becomes noisy | — | S1, S2 |
| `the step advisory does not change the lint verdict` | `tests/gates.test.mjs` | advisory stays advisory, so it cannot select for under-declaration | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the advisory string is in `plugin/bin/adr-lint` and the fence runs the gate |
| 2 — something selects it | `adr-lint` runs on every record; the acceptance fence lints a real one from this corpus |
| 3 — the caller can discover it | it prints in the same advisory block as ADR-022's mechanism advisory, which is where an author already looks |
| 4 — it is used | not observable from here — whether authors act on advice is not something this repository can measure, and a proxy would read like evidence |

## Mutation Log

## Verification Log

## Invariants

- The advisory never changes the exit code.
- A task carrying no `steps:` field anywhere produces no finding.
- Only steps whose declared proof is a named test are considered.
- The step list and the entry values are read through the existing parsers, not re-derived.

## Risks

- An author reads advice as a block and declares fewer steps, at which point the gate reports the resulting silence as coverage — the ADR-005 failure. Mitigated by S4's wording rule and by the test that the verdict is unchanged.
- The advisory is noisy on the existing corpus, where no entry carries the field. That is exactly what the second test forbids: absence is silence.

## Stop Condition

Stop if the advisory cannot be made silent for tasks that predate the field. A gate that lights up
every record in the corpus on the day it ships is one people learn to skim, and a skimmed check is
worth the same as no check.

## Out of Scope

- Making step coverage affect `done` (permanent: boundary: ADR-028's Decision keeps it advisory)
- Any judgement about whether the step's work was CORRECT — this sees skipped, never wrong (permanent: fact: two independent sessions produced perfectly conformant output that was wrong on 2026-09-03, and the residual is named in ADR-028's Consequences; citation: file `docs/adr/ADR-028-a-step-names-the-run-that-exercised-it.md:1`)
- Measuring whether a weak executor improves under this (deferred: docs/BACKLOG.md §114)
