# Task ADR-010-T2: strictFrom demotes a finding without changing the count

**Depends-on:** T1, T3
**Covers:** F-13, F-14, F-15, UC2-S1, UC2-S2
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** none
**Consumes:** `adr-verify --sweep` and its exit code (T1)

<**Depends-on names T3 as well, and that is a real edge rather than bookkeeping.** If this task lands
first and a `strictFrom` cutoff covers ADR-006/007/009, the three false successes become advice and
the sweep exits 0 — which is exactly the red state T3 needs to prove its repair. Ordering removes the
coupling; a review found it before it could waste an execution.>
**Data dependency:** hermetic

## Goal

A false success on a record below the configured `strictFrom` cutoff is reported as advice and does
not fail the sweep; the verdict line names `strictFrom`; and the counts are identical with and
without it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | read `strictFrom`, demote the exit code, name it in the verdict line |
| `tests/sweep.test.mjs` | edit | both directions of the cutoff, and the counts-unchanged assertion |
| `tests/mutations.json` | edit | one entry for the demotion, one for the counts-unchanged guarantee |

## Ordered Steps

1. **Confirm the failing tests first.** Add the two cutoff cases to `tests/sweep.test.mjs` and watch them go red: T1 fails on any false success regardless of record number, so the below-cutoff case fails on the exit code and the verdict-line case fails on the missing `[strictFrom]` marker. Confirm the below-cutoff case is red for the exit code, not because the fixture's record number was misparsed.
2. Read `strictFrom` from `.quality-harness.json` at the corpus's repository root, using the same resolution `adr-lint::strict_from_number()` uses — a corpus configuring it once must not need to configure it twice.
3. Demote: a false success on a record numbered below the cutoff is printed as advice; it stays in the numerator and in the printed list.
4. Name it: the verdict line carries `[strictFrom]` whenever the cutoff is in effect, so a demoted result is never mistaken for a clean one.
5. Assert the counts are byte-identical with and without the cutoff — only the exit code differs.
6. Record both mechanisms with `adr-verify --mutant`; both must be RED.

## Acceptance

```bash
set -o pipefail
node --test tests/sweep.test.mjs 2>&1 | tee /tmp/adr010-t2.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr010-t2.out
```

<`set -o pipefail` and `&&`, not `;` — and that is a correction, not a style choice. The
`… | tee X; ! grep …` form this project's own task template recommends returns **0 when the runner
never started**: the pipeline's status is `tee`'s, `;` discards it, and the absent runner's error
matches none of the grep patterns. Measured 2026-08-28: `nosuchrunner --test x` through the old form
exits 0, through this one exits 127. Twelve existing fences and the template still carry the old
form — docs/BACKLOG.md §46.>

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a false success below the strictFrom cutoff is advice, not a failure` | `tests/sweep.test.mjs` | exit 0; the finding is still printed | UC2-S1, F-14 |
| `a false success at or above the cutoff still fails` | `tests/sweep.test.mjs` | exit non-zero | UC2-S2, F-13 |
| `the verdict line names strictFrom whenever it is in effect` | `tests/sweep.test.mjs` | a demoted run is never mistaken for a clean one | F-14 |
| `strictFrom changes the exit code and nothing else` | `tests/sweep.test.mjs` | same corpus, two runs, identical counts and identical named claims | F-15 |
| `a malformed .quality-harness.json advises and does not silently demote` | `tests/sweep.test.mjs` | parity with `adr-lint`'s handling — two copies that disagree are worse than one | F-14 |
| `an unparseable record number is never treated as below the cutoff` | `tests/sweep.test.mjs` | a record named outside `ADR-NNN` must not be demoted forever and invisibly | F-14 |
| `an absent config leaves every finding at full strength` | `tests/sweep.test.mjs` | the default is strict; opting out is explicit | F-13 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | the `.quality-harness.json` read; the mutation on it must go RED |
| 3 — the caller can discover it | `strictFrom` is already documented in `adr-execute`'s skill body; this task adds the sweep to that sentence |
| 4 — it is used | nothing measures this yet — no adopting corpus exists to observe. Recorded rather than guessed |

## Class Sweep

**Class:** every gate that reads `strictFrom`, and whether each demotes only the exit code rather
than the finding.

```bash
grep -rn "strictFrom\|strict_from" plugin/bin plugin/scripts docs/adr
```

To be run and recorded at execution. Known at authoring: `adr-lint` is the only reader today, and its
documented rule is that the evidence chain is never demoted — a `done` row still needs its exit-0
entry whatever the cutoff says. This task must not weaken that: the counts stay whole.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-28 · 1f8aef0 · mutant killed · exit 1 · `plugin/bin/adr-verify` · the demotion removed: a record below the cutoff fails the sweep, which is the day-one red an adopting corpus turns the gate off over · acceptance-sha256:58682a5f05144b166f5d85e2930f5bbce30c38c64471e26cea4664e4edfc3bc5

## Invariants

- `strictFrom` changes the exit code only. Counts, the rate, and the list of named claims are identical with and without it.
- A demoted run always says `[strictFrom]`.
- A corpus with no `.quality-harness.json`, or one with no `strictFrom` key, behaves exactly as T1 left it.

## Risks

- `strictFrom` becomes the way a real false success is made to disappear. Mitigated by the counts-unchanged assertion and its mutation: the finding is still counted and still printed.
- Two gates resolve the config differently and a corpus is demoted by one and not the other. Mitigated by the Class Sweep and by reusing `adr-lint`'s resolution rather than writing a second one.

## Stop Condition

Stop if the cutoff cannot be resolved for a record whose id does not parse as a number — a record
named outside the `ADR-NNN` convention must not be silently treated as below the cutoff, because that
would demote it forever and invisibly. Ask before choosing a default.

## Out of Scope

- Changing what `strictFrom` means for `adr-lint`.
- Any new configuration key. This reuses the one that exists.

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-28 · b446577 · exit 1 · `set -o pipefail …` · acceptance-sha256:58682a5f05144b166f5d85e2930f5bbce30c38c64471e26cea4664e4edfc3bc5
  ```
        at Test.postRun (node:internal/test_runner/test:1537:19)
        at Test.run (node:internal/test_runner/test:1462:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:969:7) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: 'FALSE      exit 1 · /var/folders/cp/56m_2hr965zcc37hrln0_fz80000gn/T/qh-sweep-E8zEnb/docs/adr/ADR-002-old/tasks/T1.md\n\n1/1 recorded claims no longer hold (0 superseded, 0 unrunnable, neither counted).\n',
      expected: /names no ADR number|checked in full/i,
      operator: 'match',
      diff: 'simple'
    }
  ```
