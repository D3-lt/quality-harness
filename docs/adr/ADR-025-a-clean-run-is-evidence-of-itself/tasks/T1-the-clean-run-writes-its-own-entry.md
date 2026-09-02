# Task ADR-025-T1: Write the Verification Log entry the clean run earned

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** the merged `--mutant` invocation writing both logs
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`adr-verify --mutant` appends the `## Verification Log` entry its clean fence earned, through the
same writer the plain path uses, before it applies the mutant.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the clean-run branch at `:1257` gains the entry write, calling the existing writer rather than a second spelling of the grammar |
| `tests/evidence-chain.test.mjs` | edit | this file owns the log grammar and the `--mutant` lane, so the regression belongs beside them |
| `tests/mutations.json` | edit | one catalogue entry: deleting the entry write must fail a test |

## Ordered Steps

1. [S1] Write the failing test first: a `--mutant` run on a task whose Verification Log is empty leaves exactly one entry in it, with the same grammar the plain path writes — date, sha, exit code, displayed command, `acceptance-sha256`, `ms:`. Confirm red before touching the gate. (TDD red.)
2. [S2] Call the existing Verification Log writer from the clean-run branch, passing the clean run's own returncode, output and elapsed time. Do not re-derive the digest or re-format the row; a second spelling of the grammar is the drift this task's Invariants forbid. [proof: acceptance]
3. [S3] Write the entry only where NO MUTANT FENCE RUNS AFTERWARDS — after the verdict on the mutating path, and before the refusal on the clean-fence-failed path, which applies no mutant. Written earlier, this file's own bookkeeping joins the tree the mutant's fence reads, so the clean run and the mutant run differ in two things instead of one and ADR-016's premise is broken. Assert a mutant that must SURVIVE still comes back a survivor. [proof: acceptance]
4. [S4] Record a non-zero clean run too, then let the existing `UNPROVEN` refusal proceed unchanged — today that path writes nothing and loses the one observation it made. Assert both: the entry is present AND the exit code is still non-zero. [proof: mutation]
5. [S5] Assert the negative direction: a plain `adr-verify` run still writes exactly one entry and no Mutation Log row, so the merge did not make the two paths the same command. [proof: acceptance]

## Acceptance

```bash
set -o pipefail
node --test tests/evidence-chain.test.mjs 2>&1 | tee /tmp/adr025-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr025-t1.out \
  && node scripts/mutate.mjs --case 'a mutant run records the verification entry' 2>&1 | tee /tmp/adr025-t1b.out \
  && grep -q "1/1 mutations were noticed" /tmp/adr025-t1b.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a mutant run records the verification entry its clean fence earned` | `tests/evidence-chain.test.mjs` | one entry, plain-path grammar, written by the `--mutant` invocation | — | S1, S2 |
| `the entry survives the mutant that is applied after it` | `tests/evidence-chain.test.mjs` | the write precedes the source change and the restore does not undo it | — | S3 |
| `a failing clean fence is recorded before it is refused` | `tests/evidence-chain.test.mjs` | the observation is kept and the UNPROVEN exit is unchanged | — | S4 |
| `a plain run still writes no mutation row` | `tests/evidence-chain.test.mjs` | the two paths did not collapse into one | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests above |
| 2 — something selects it | the clean-run branch is on `--mutant`'s only path to a verdict; the catalogue mutant deletes the write and a test fails |
| 3 — the caller can discover it | `adr-verify --help` and the `adr-execute` skill, which T2 updates |
| 4 — it is used | every Mutation Log row recorded from now on has a Verification Log entry beside it at the same sha, which is observable in the task file rather than inferred |

## Mutation Log

## Invariants

- One writer for the entry grammar. The `--mutant` path and the plain path never format a row independently, and ADR-020's `ms:` and the `acceptance-sha256` digest come from the same code on both.
- Every entry written records a run that happened in this process on the tree in front of it. Nothing is reused, cached, skipped or inferred — that is the property that leaves ADR-010 untouched.
- ADR-016 is unchanged: the clean fence still runs, still must pass, and still gates the mutant.
- The tree a mutant's fence reads differs from the clean baseline in the mutation and nothing else. The verification entry is never written between the two runs.

## Risks

- Writing to the task file before the mutation interacts with ADR-002's restore journal, which is why S3 asserts on an applied-and-restored mutant rather than on a clean run only.

## Stop Condition

Stop if the clean run turns out NOT to be the same observation the plain path records — a different
normalization, cwd, environment or timeout would mean the two rows are not interchangeable, and the
record's central claim is then false rather than merely narrow.

## Out of Scope

- Changing when the clean run is taken, or whether it gates the mutant — ADR-016 owns that
- The `adr-execute` guidance, which is T2
