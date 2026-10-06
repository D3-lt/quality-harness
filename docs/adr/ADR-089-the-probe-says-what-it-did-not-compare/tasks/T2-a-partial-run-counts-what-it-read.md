# Task ADR-089-T2: a PARTIAL run counts what it read, and the attestation says its look

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one shipped script, one new test file, campaign entries)
**Owner:** unassigned
**Produces:** attestation keys `look` and `notCompared`; `probe.readers.gitReason`
**Consumes:** `verdictMoves` returning `{ compared, notCompared, moves }` over a PARTIAL pair (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `verdictChanges over a partial pair`, `the look field`, `the notCompared count`, `the git failure reason`

## Goal

`corpus-probe --attest --since` counts verdict moves over a PARTIAL pair, carries `look` and
`notCompared`, and says when git could not run rather than that the plugin is not a checkout
(ADR-089 Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | edit | `verdictChanges` (`:663`) uses T1's `comparable`; `attestation` (`:676`) adds `look` and `notCompared` after `readinessUnproven` and before `verdictChanges`, and the git arm of `atReason` (`:689`); `readerFingerprint` (`:79`, `:106`) records `gitReason` when the `rev-parse` spawn has an `error`. `attestMain` (`:734`) is what selects `attestation` and is unchanged |
| `tests/probe-attest-partial.test.mjs` | add | the three tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/corpus-probe.test.mjs` and confirm no locked assertion pins the attestation's key list or its key order. If one does, stop (Stop Condition). Write the three tests in `tests/probe-attest-partial.test.mjs` and record the red run (TDD red). Red today: `verdictChanges` is null over the PARTIAL pair, and `look` is absent.
2. [S2] `attestation` adds:
   - `look`: the worse of `report.look` and `report.workNext?.look`, in the order ok < PARTIAL < UNPROVEN, or null when neither is a string;
   - `notCompared`: `verdictMoves`' count when `verdictChanges` is an object, else null.
   `verdictChanges` keeps exactly its three keys.
3. [S3] `readerFingerprint`: when the `rev-parse` result carries `error`, return `gitReason: 'git could not be run (<code>)'`, and leave `git` and `dirty` null. When git answered that this is not a checkout, add no field.
   `atReason`'s `!readers.git` arm then reads `` `${readers.gitReason}, so the readers' commit is unknown` `` when `gitReason` is set, and "the plugin is not a git checkout" otherwise. `readersOfRun` passes the field through.
4. [S4] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`:
   - make `verdictChanges` null under PARTIAL again;
   - drop `look`;
   - set `notCompared` to 0;
   - drop the `gitReason` arm.
   [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/probe-attest-partial.test.mjs 2>&1) \
  && for t in 'a partial attestation counts the verdicts both runs read and names the rest' 'an attestation carries the look of its run' 'git that could not run is not called a missing checkout'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/corpus-probe.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a partial attestation counts the verdicts both runs read and names the rest` | `tests/probe-attest-partial.test.mjs` | through `--attest --since` on saved reports, the earlier one with a different readers digest. ADR-089 Context's PARTIAL pair gives `verdictChanges: { compared: 1, passToFail: 1, failToPass: 0 }` and `notCompared: 1`. DIRTY twins: an UNPROVEN `since` gives `verdictChanges` and `notCompared` both null; the same readers give null (ADR-082's rule, unchanged) | none | S1, S2 |
| `an attestation carries the look of its run` | `tests/probe-attest-partial.test.mjs` | `look` is `ok`, `PARTIAL` or `UNPROVEN` as the report says. A report whose top `look` is ok and whose `workNext.look` is PARTIAL gives `PARTIAL`. A report with neither gives null | none | S1, S2 |
| `git that could not run is not called a missing checkout` | `tests/probe-attest-partial.test.mjs` | `readerFingerprint` with a `run` failing `ENOENT` gives `gitReason`. The attestation over a look-ok report carrying it says `git could not be run (ENOENT)…`. CLEAN twin: a `run` that answers status 128 (not a work tree) still says `the plugin is not a git checkout` | none | S1, S3 |
| `an attestation that compared nothing says null, never zero` | `tests/corpus-probe.test.mjs` | the existing ADR-082 test, locked and unchanged: an UNPROVEN `since` is still null | none | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `attestMain` calls `attestation`; the first test drives the CLI |
| 3 — the caller can discover it | `docs/corpus-reports/README.md`'s schema, which T3 updates |
| 4 — it is used | the next filed attestation carrying `look`; nothing measures this yet |

## Mutation Log

## Invariants

- `verdictChanges` never carries a fourth key.
- An UNPROVEN run, different corpora or the same readers give `verdictChanges: null` and `notCompared: null`.
- `at` is unchanged in every case it was set before.

## Risks

- attest-import refuses the new keys until T3 lands, so T2 and T3 ship in one release.

## Stop Condition

Stop and ask if a locked test pins the attestation's key list or order, or if the PARTIAL reproduction gives anything but `passToFail: 1`.

## Out of Scope

- Filing and release rules — T3.

## Verification Log
