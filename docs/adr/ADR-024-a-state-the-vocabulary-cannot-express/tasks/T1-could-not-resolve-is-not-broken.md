# Task ADR-024-T1: Say "could not resolve", not "broken", when that is what happened

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** the `UNRESOLVED` verdict word and the kinds it covers
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`adr-debt` reports a pointer it could not resolve as `UNRESOLVED`, naming both readings and the
declaration that settles them, and keeps `BROKEN` for the defects it can actually determine.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-debt` | edit | the single print site that chooses the word from `resolve()`'s `kind`, and the summary line that counts it |
| `tests/gate-rules.test.mjs` | edit | the fixtures; this corpus has zero such pointers, so a fixture is the only way to reach the branch |

## Ordered Steps

1. [S1] Write the failing fixtures first: a pointer naming a record this corpus does not have is reported `UNRESOLVED` and NOT `BROKEN`; an empty pointer and a malformed disposition still say `BROKEN`. (TDD red.)
2. [S2] Split the verdict word at the print site by `kind`: `empty` and `malformed` keep `BROKEN` because the defect is in the text in front of the gate; an unresolved record id becomes `UNRESOLVED`.
3. [S3] Make the `UNRESOLVED` line name both readings and the remedy — a typo, or a target owned elsewhere that T2's disposition declares. A verdict a reader cannot act on is what §85 is about, and this must not add another. [proof: acceptance]
4. [S4] Leave the exit code at 1 for an undeclared `UNRESOLVED`. Assert it, because a softer word that also stopped failing CI would turn a red row into a silent one — the opposite of the fix. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/gate-rules.test.mjs 2>&1 | tee /tmp/adr024-t1.out \
  && ! grep -qE "no tests to run|^not ok|# fail [1-9]" /tmp/adr024-t1.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-debt resolves the pointers it can, and reports the ones it cannot` | `tests/gate-rules.test.mjs` | an unresolved record id reports UNRESOLVED, names both readings, and still exits 1 | — | S1, S2, S3, S4 |
| `a target another repository owns is declared, not called broken` | `tests/gate-rules.test.mjs` | empty and malformed keep BROKEN, so the change is not "stop reporting" | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two fixtures above |
| 2 — something selects it | the print site is on `adr-debt`'s only reporting path; the mutation on the exit code proves the path is reached |
| 3 — the caller can discover it | the message names the remedy, and T2's disposition is what it points at |
| 4 — it is used | this corpus has zero such pointers by measurement, so nothing here will exercise it — the reporting corpora will. Stated rather than glossed: no telemetry, and the next report is the signal |

## Mutation Log

- 2026-09-02 · 6973422 · mutant survived · exit 0 · `plugin/bin/adr-debt` · an unresolvable record id would go back to being called BROKEN, a claim the gate cannot make · acceptance-sha256:1f3fcfc5517aec32b1415531ba9f7bf8ee4373fd91b4f335ad67afd9965c473b
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-02 · 9204e43 · mutant killed · exit 1 · `plugin/bin/adr-debt` · an unresolvable record id would go back to being called BROKEN, a claim this gate cannot make · acceptance-sha256:48efeb9f4ea6f96f6a7cc92dcebf4cefc637fafbaf81485df1dffaa117124f0c

## Invariants

- A gate never says BROKEN for something it could not determine (ADR-005, CLAUDE.md §3).
- An undeclared unresolved pointer still exits 1; the word changes, the consequence does not.
- `empty` and `malformed` keep their verdict, because those the gate CAN determine.

## Risks

- Renaming a verdict could read as softening it. Mitigated by asserting the exit code in the same test, so a change that also stopped failing would go red.

## Stop Condition

Stop if `resolve()` turns out not to distinguish an unresolved record id from a path that matched
nothing — the two would need different words and this task assumes one call site can tell them apart.

## Out of Scope

- The `(external: …)` disposition, which is T2
- Following a pointer into another repository (the parent ADR's Out of Scope says why)

## Verification Log
- 2026-09-02 · faacfb3 · exit 0 · `set -o pipefail …` · acceptance-sha256:1f3fcfc5517aec32b1415531ba9f7bf8ee4373fd91b4f335ad67afd9965c473b · ms:5120
- 2026-09-02 · 21a7a04 · exit 0 · `set -o pipefail …` · acceptance-sha256:48efeb9f4ea6f96f6a7cc92dcebf4cefc637fafbaf81485df1dffaa117124f0c · ms:8796
