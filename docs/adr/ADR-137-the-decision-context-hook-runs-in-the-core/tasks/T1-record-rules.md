# Task ADR-137-T1: The core's record rules answer as Node's do

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** `decisioncorpus.go` record rules
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Go versions of decision-corpus.mjs's record rules on the hook path (pathMatchesDeclaration, recordStatus and statusKind,
declaredGoverns, declaredEnforcement, gfmTableRows and the task-table path reading, recognisedAsRecord and the name arms,
recordId and referencesIn, the archive catalog effect) give the Node functions' answers on every row, including every row of
tests/fixtures/record-recognition.json.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/decisioncorpus.go` | add | The record rules |
| `core/hooks/decisioncorpus_parity_test.go` | add | Answers the rows (`QH_DECISION_CORPUS_ROWS`) |
| `tests/decision-context-parity.test.mjs` | add | Builds rows from the Node exports and record-recognition.json, runs the Go test |
| `tests/mutations/core/hooks/decisioncorpus.go.json` | add | A changed rule is noticed |

## Ordered Steps

1. [S1] Write `tests/decision-context-parity.test.mjs`: rows from the live Node exports over record-recognition.json's inputs and adversarial strings for each rule (Unicode case folding and whitespace, `.` at line separators, lookaround-dependent patterns, globs with `**`/`*`/`?` and case, typed matchers, fenced status sections, frontmatter, MADR bullets, catalog rows). Require "N rows compared, 0 disagreements". Confirm it fails first.
2. [S2] Port the rules into `core/hooks/decisioncorpus.go`; patterns that need lookaround are written as hand matchers.
3. [S3] Add catalogue mutants on the status kind, the glob's case folding, the catalog effect and a lookaround matcher; record two killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/decision-context-parity.test.mjs 2>&1 | tee "$out" && grep -q '✔ the core answers every record-rule row as the Node reader does' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the core answers every record-rule row as the Node reader does` | `tests/decision-context-parity.test.mjs` | Row-for-row parity, including record-recognition.json | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `core/hooks/decisioncorpus.go` |
| 2 — selected | T2 |
| 3 — discoverable | T3 |
| 4 — used | T3 |

## Mutation Log

## Invariants

decision-corpus.mjs, record.py and every locked test are unchanged.

## Risks

A rule exercised by no row can drift; the rows follow the Node tests and record-recognition.json.

## Stop Condition

Stop if a rule cannot be reproduced in Go without changing the Node reader; name it in the record.

## Out of Scope

- Reading a corpus (T2).

## Verification Log
