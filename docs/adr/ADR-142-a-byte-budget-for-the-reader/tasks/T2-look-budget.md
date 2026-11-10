# Task ADR-142-T2: One byte budget per look, the archive walk included

**Depends-on:** T1, T4
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `adrCorpus(root, { byteBudget })`, `dcAdrCorpus(root, tracked, screenBudget, byteBudget, platform)`, `unmarkedArchives(root, listing, recognised, reader)`, the byte-budget reason
**Consumes:** `incomplete` and the PARTIAL line (T4), `tests/helpers/decision-rows.mjs` (T4), the bounded cached reader (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A look charges every record read, every cached read and, in Node, every README read of the `unmarkedArchives` walk
`adrCorpus` runs after its loop, by the bytes read, against one 128 MiB budget; once spent it opens nothing more, names the
first file it refused, and the decision context says PARTIAL, in Node and the core alike (ADR-142 Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/decision-corpus.mjs` | edit | `BYTE_BUDGET`; the `byteBudget` option of `adrCorpus` (:1526); the counter in `corpusReader()` and at the record read (:1594); `unmarkedArchives` (:159) and `underFrozenArchive` (:99-126) read through the look's reader when given one, and `adrCorpus` (:1801) gives it |
| `core/hooks/decisioncorpus_read.go` | edit | `dcByteBudget`; the argument of `dcAdrCorpus` (:664); the counter and an open count in `dcCorpusReader`, charged at `dcReadBounded` (:703); `dcDecisionContext` (:947) passes the constant |
| `core/hooks/decisioncorpus.go` | edit | `dcReader.text` charges and refuses through the look's counter |
| `core/hooks/decisioncorpus_parity_test.go` | edit | `dcpCorpusRecord` (:39-40) takes an optional byte budget from the row, defaulting to `dcByteBudget` |
| `core/hooks/decisioncorpus_replay_test.go` | edit | `TestDecisionContextReplay` (:45) reads an optional `byteBudget` per corpus |
| `core/hooks/decisioncorpus_budget_test.go` | add | `TestDcByteBudgetOpensNothingOnceSpent`: the reader's open count does not move after the refusal |
| `tests/decision-byte-budget.test.mjs` | add | Spends a small injected budget in Node, counts the files opened after it, and runs both Go tests over the same rows |
| `tests/mutations/plugin/scripts/decision-corpus.mjs.json` | edit | Mutants: the charge dropped from the cached reader, from the record read, from the walk; the refusal turned off |
| `tests/mutations/core/hooks/decisioncorpus_read.go.json` | edit | The charge dropped; the refusal turned off |

## Ordered Steps

1. [S1] Confirm the failing test exists and is red (TDD red): write `tests/decision-byte-budget.test.mjs` over a scratch corpus
   of three records with task files and an archive-named directory with a README listed after them, the budget set to the
   bytes of the first record and its tasks. It asserts Node's `unreadable` and `incomplete` hold `byte budget: <N> bytes were
   read; this file and every later one were not read` for the second record, the look is PARTIAL, the decision context for
   the second record's file is the PARTIAL line, and with the budget lifted that record governs its file. It wraps
   `openSync`, `readSync` and `readFileSync` (`syncBuiltinESMExports`, as the measurement in ADR-142 Context did) and asserts
   no file is opened after the refusal, the walk's README included. Red: `adrCorpus` has no such option.
2. [S2] Node: one counter per look in `corpusReader()`, charged by the bytes `readRegularText` read on a cache miss, the record
   read charged the same way; a read refused once the counter reached the budget throws a cached budget error before it
   opens; the record loop names the first refused file and stops; `adrCorpus` hands its reader to `unmarkedArchives`, whose
   README reads then charge the same counter and, once it is spent, come back `unknown`, never entering `unreadable` or
   `incomplete` (ADR-142 Decision 1: the core has no such walk). A row whose budget is first spent by the walk, after the
   record loop, asserts Node's look ok and the replay equal to the core's.
3. [S3] The core: the same counter in `dcCorpusReader`, shared by `dcReader.text` and the record read, the same refusal before
   any open, the same sentence; an open count on the reader for the test; `dcAdrCorpus` gains the argument and every caller
   passes it (`dcDecisionContext`, the two Go tests). The core's look has no archive walk (ADR-142 Context), so nothing else
   reads in it.
4. [S4] The new test hands its rows, with the injected budget, to `TestDecisionCorpusParity` (the `unreadable` reason compared
   byte for byte) and its replay to `TestDecisionContextReplay` (the decision context compared as text, PARTIAL line
   included); zero disagreements in both, and `TestDcByteBudgetOpensNothingOnceSpent` passes.
5. [S5] Add the catalogue mutants and record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/decision-byte-budget.test.mjs 2>&1 | tee "$out" && grep -q '✔ a look stops at its byte budget, opens nothing after it, and says PARTIAL, in Node and the core alike' "$out" && (cd core && go test -count=1 -run '^TestDcByteBudget' -v ./hooks/ 2>&1 | tee "$out") && grep -q '^--- PASS: TestDcByteBudgetOpensNothingOnceSpent' "$out" && node --test tests/decision-context-parity.test.mjs tests/decision-context-replay.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a look stops at its byte budget, opens nothing after it, and says PARTIAL, in Node and the core alike` | `tests/decision-byte-budget.test.mjs` | Node's entries, look and line; no open after the refusal, the walk included; both Go tests over the same rows, zero disagreements | — | S1, S2, S3, S4 |
| `a cached read is charged once` | `tests/decision-byte-budget.test.mjs` | A task directory shared by two records is charged once: a budget that admits it once reads both records | — | S2, S3 |
| `a file recognition rejects is charged` | `tests/decision-byte-budget.test.mjs` | Notes under a record directory spend the budget before the record listed after them | — | S2, S3 |
| `TestDcByteBudgetOpensNothingOnceSpent` | `core/hooks/decisioncorpus_budget_test.go` | The core's reader opens no file after the refusal | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the counter in both readers |
| 2 — selected | `dcDecisionContext` and `adrCorpus`'s default pass 128 MiB; `adrCorpus` hands the walk its reader; a mutant dropping any charge survives no row |
| 3 — discoverable | n/a: no declared interface; the option is internal like `screenBudget` |
| 4 — used | nothing measures this yet: no corpus we run reaches 128 MiB |

## Mutation Log

## Invariants

- A cache hit charges nothing; a refused read is cached as refused and opens nothing for the rest of the look.
- The screen's 64 MiB and the record budget of 200 are unchanged and keep their own reasons.
- SessionStart's archive walk, given no reader, reads as T1 left it.

## Risks

- Node and the core could count different bytes; both charge raw bytes read, before decoding or CR handling, and the parity
  row compares the reason, which holds the number.
- The fs wrap in the Node test is a double of the filesystem calls; it sees every open made through `node:fs`'s exports, which
  is how decision-corpus.mjs imports them, and the Go open count is a counter in the reader itself.

## Stop Condition

Stop if a measured corpus we run reads more than 64 MiB outside the screen: the value is then the owner's to set again.
What would make the criterion impossible to fail: a test budget larger than the scratch corpus; S1 sets it below the corpus's
bytes and asserts the lifted run reads more.

## Out of Scope

- The case identity (T3).
- A budget on SessionStart's walk (ADR-142 Out of Scope).

## Verification Log
