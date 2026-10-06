# Task ADR-089-T3: attest-import files the new keys, and release-evidence names them

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (two repository scripts, one document, one new test file, campaign entries)
**Owner:** unassigned
**Produces:** none
**Consumes:** attestation keys `look` and `notCompared` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the schema keys`, `the shape check of the new keys`, `the attested reason names what was not compared`, `the unchanged counting rule`

## Goal

attest-import files an attestation carrying `look` and `notCompared` and refuses a malformed one, and
release-evidence's `attested` reason names a PARTIAL look and a non-zero `notCompared` (ADR-089
Decision 4). The acceptance rule itself is unchanged.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/attest-import.mjs` | edit | `KEYS` (`:22`) gains `look` and `notCompared` after `readinessUnproven`; `check` (`:112`) refuses a `look` outside ok/PARTIAL/UNPROVEN/null, a `notCompared` that is not a non-negative integer or null, and a `notCompared` that is non-null beside a null `verdictChanges` |
| `scripts/release-evidence.mjs` | edit | the `attested` reason (`:306`) appends `look PARTIAL` and `<n> not compared` per attestation that carries them; `countsAsRun` (`:250`) and `regressedBy` (`:248`) are unchanged |
| `docs/corpus-reports/README.md` | edit | the schema block and the `verdictChanges` paragraph (`:28`, `:47-51`) describe `look`, `notCompared` and the PARTIAL comparison |
| `tests/attest-look.test.mjs` | add | the three tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py` on `tests/attest-import.test.mjs` and `tests/release-evidence.test.mjs`. On 2026-10-06 they held 8 and 24 locks; the new tests go in a new file. Write the three tests and record the red run (TDD red). Red today: attest-import refuses `look` as a key outside the schema.
2. [S2] Add the two keys to `KEYS` and their shape checks to `check`, each refusal numbered `2:` and naming the key and ADR-089, as `verdictChanges`' refusal does.
3. [S3] In `outsideRun`'s `attested` reason, append ` (look PARTIAL, <n> not compared)` or the half that applies, beside the existing `failToPass` note. An attestation without the keys reads exactly as today.
4. [S4] Update `docs/corpus-reports/README.md`'s schema block and paragraph. [proof: human: a reviewer reads the README's schema block and confirms it lists `look` and `notCompared` in `KEYS` order and says a PARTIAL pair is compared over the records both runs read]
5. [S5] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`:
   - drop `look` from `KEYS`;
   - accept any `notCompared`;
   - drop the reason suffix;
   - let `countsAsRun` accept `compared` 0, which the locked release-evidence tests in the fence's second command must kill.
   [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \
  && for t in 'attest-import files look and notCompared and refuses malformed ones' 'release-evidence names an unread part of an attested corpus' 'release-evidence refuses a partial run that regressed'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/attest-import.test.mjs tests/release-evidence.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `attest-import files look and notCompared and refuses malformed ones` | `tests/attest-look.test.mjs` | in a scratch repository with real digests, built as `tests/attest-import.test.mjs`'s `repository` helper builds one, attestations with `look: 'PARTIAL', notCompared: 6` and with both null are filed. DIRTY twins, each refused with nothing written: `look: 'partial'`; `notCompared: -1`; `notCompared: 1.5`; `notCompared: 2` beside `verdictChanges: null` | none | S1, S2 |
| `release-evidence names an unread part of an attested corpus` | `tests/attest-look.test.mjs` | `outsideRun` over a covering attestation with `look: 'PARTIAL'`, `verdictChanges: { compared: 17, passToFail: 0, failToPass: 0 }` and `notCompared: 6` is `attested`, and its reason includes `look PARTIAL` and `6 not compared`. CLEAN twin: one without the keys gives today's reason byte for byte | none | S1, S3 |
| `release-evidence refuses a partial run that regressed` | `tests/attest-look.test.mjs` | the same PARTIAL attestation with `passToFail: 1` is `unproven`, kind `regressed`, beside another attestation that attests: the PARTIAL count refuses as an `ok` one does | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `main` in attest-import calls `check`; `release-evidence`'s main calls `outsideRun` over `readAttestations` |
| 3 — the caller can discover it | `docs/corpus-reports/README.md`'s schema |
| 4 — it is used | the first filed attestation with `look`; nothing measures this yet |

## Mutation Log

## Invariants

- Every attestation already in `docs/corpus-reports/` passes `attest-import --check`'s shape rules exactly as before.
- `countsAsRun` and `regressedBy` are byte-identical.

## Risks

- The reason line grows; a release session reading it gains one clause per PARTIAL attestation.

## Stop Condition

Stop and ask if a locked test pins the `attested` reason's exact text, or if the owner has chosen ADR-089 Alternative (d), which changes `countsAsRun` and needs its own step.

## Out of Scope

- Alternative (d), a PARTIAL attestation counting only beside an `ok` one — the owner's decision (ADR-089 Follow-ups).

## Verification Log
