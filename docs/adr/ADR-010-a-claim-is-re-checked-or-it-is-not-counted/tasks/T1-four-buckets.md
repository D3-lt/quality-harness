# Task ADR-010-T1: four buckets, and a claim you could not check is in neither half

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-11, F-12, F-16, F-17, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5
**Estimated scope:** L (cross-boundary)
**Owner:** zy
**Produces:** `adr-verify --sweep <dir>` and the four-bucket report (T2, T3)
**Consumes:** none
**Data dependency:** hermetic — the fixture corpus is built by the test; the live corpus is never required

## Goal

`adr-verify --sweep <corpus-dir>` re-runs every distinct exit-0 claim, sorts each into held, false,
superseded or unrunnable, prints the rate over the first two and the other two beside it, and exits
non-zero when any claim is false.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the sweep, and the entry-line reader it needs |
| `plugin/bin/adr-verify` (usage/`--help` text) | edit | **what SELECTS the new mode.** A flag the parser honours and the usage text never advertises is discoverable only by reading the source — rung 3, and the rung this pipeline misses |
| `tests/sweep.test.mjs` | add | the fixture corpus and every bucket |
| `tests/mutations.json` | edit | one entry per mechanism: the bucket split, the dedupe, the superseded test, the unrunnable test, the write-nothing guard |
| `plugin/skills/adr-execute/SKILL.md` | edit | names the tools that read the evidence chain; the sweep belongs there or nobody running the lifecycle learns it exists |

## Ordered Steps

1. **Confirm the failing tests first.** Write `tests/sweep.test.mjs` against a temp fixture corpus and watch every case go red — there is no `--sweep`, so the spawn fails and each assertion fails for that reason. Confirm the reason is the missing flag, not a fixture typo, by running the same spawn by hand once.
2. Build the fixture corpus in the test: task files with a `## Acceptance` fence and a `## Verification Log`, covering one claim per bucket — a fence that passes, one that fails on its own terms, one whose recorded digest does not match its fence, one whose fence calls a command that is not on `PATH`, plus a task with no exit-0 entry at all.
3. Add the entry reader: parse exit-0 Verification Log lines for `(task, digest)`, reusing `adr-lint`'s grammar shape. Dedupe on the pair.
4. Partition: compare each entry's digest against `acceptance_digest(normalize_acceptance(fence))` for the task's current fence. Non-matching → superseded, no execution. **A task with no `## Acceptance` fence at all is superseded too** — there is nothing for the digest to equal.
5. **Refuse to recurse before running anything.** A fence whose text invokes `--sweep` is reported unrunnable, named as such, and never executed. Without this the sweep is unbounded — T3's own acceptance would make every later sweep re-enter itself.
6. Run each remaining re-checkable fence **under an explicit timeout**, resolving the shell with `resolve_bash()` rather than `bash_or_exit()`: an absent shell makes every claim unrunnable, and must not `sys.exit(2)` out of the report. A run that does not finish is unrunnable, never a verdict.
7. Classify a non-zero exit: `environment_failure()` matching → unrunnable, otherwise false. **Its contract is being reshaped here** — it exists never to downgrade a failure, and this downgrades one — so an assertion failure whose output merely mentions an environment string must not escape into unrunnable. The fixture carries that case.
8. Report: the rate over held + false; superseded and unrunnable on their own lines; every false claim named with its record, task and exit code. A corpus with no claim says so and does not print a rate.
9. Exit non-zero when any claim is false, zero otherwise.
10. Add the usage/`--help` line, and a test that fails if it is deleted.
11. Record each mechanism with `adr-verify --mutant`; every one must be RED before this task is done.

## Acceptance

```bash
set -o pipefail
node --test tests/sweep.test.mjs 2>&1 | tee /tmp/adr010-t1.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr010-t1.out
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
| `a claim whose fence still passes is counted as held` | `tests/sweep.test.mjs` | held bucket; rate 0 over 1 | UC1-S1, F-7 |
| `a claim whose fence no longer passes is named and fails the sweep` | `tests/sweep.test.mjs` | false bucket; the task is named; exit non-zero | UC1-S2, F-7, F-13 |
| `an entry whose digest no longer matches its fence is superseded` | `tests/sweep.test.mjs` | superseded bucket; neither half; no execution | UC1-S3, F-8 |
| `a fence the machine could not run is not a false success` | `tests/sweep.test.mjs` | unrunnable bucket; neither half; never false | UC1-S4, F-10 |
| `a corpus with no claim reports no rate rather than a clean one` | `tests/sweep.test.mjs` | the empty case does not report success | UC1-S5, F-12 |
| `two entries proving the same fence are one claim` | `tests/sweep.test.mjs` | dedupe on `(task, digest)` | F-9 |
| `every claim lands in exactly one bucket and the four sum to the total` | `tests/sweep.test.mjs` | the partition is total and disjoint | F-11 |
| `a sweep leaves the corpus byte-identical` | `tests/sweep.test.mjs` | the read-only mode writes nothing — hashes every file before and after | F-16 |
| `--sweep is named in the usage text` | `tests/sweep.test.mjs` | rung 3: the mode is discoverable without reading the source | — |
| `a fence that invokes the sweep is reported unrunnable and never executed` | `tests/sweep.test.mjs` | the recursion guard — the fixture would not terminate without it | F-10, F-11 |
| `a fence that does not finish is unrunnable, not a verdict` | `tests/sweep.test.mjs` | the timeout; a hung fence reaches a bucket | F-10, F-11 |
| `a task with an exit-0 entry and no Acceptance fence is superseded` | `tests/sweep.test.mjs` | totality: this input had no bucket before review | F-8, F-11 |
| `an assertion failure that merely mentions an environment string is still false` | `tests/sweep.test.mjs` | the reshaped `environment_failure()` contract cannot launder a real failure | F-10 |
| `a human-observed entry is not a claim` | `tests/sweep.test.mjs` | it carries no digest, so it cannot be re-checked or counted | F-5 |
| `a multi-line fence is re-checked whole, not by its first line` | `tests/sweep.test.mjs` | the entry shows line one; the digest covers all of it | F-6 |
| `superseded and unrunnable are printed even when zero` | `tests/sweep.test.mjs` | a bucket that vanishes when empty reads as a bucket that does not exist | F-11 |

**Shapes the fixture must carry, enumerated rather than recalled**, because each is a state the
recording path can already produce: a task with several exit-0 entries; a task whose only entries are
non-zero (TDD red) and which therefore has no claim; a `human-observed` entry, which carries no
digest and is not a claim; a multi-line fence, whose entry shows only line one; and a task with a
Verification Log but no `## Acceptance` fence at all.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | the argument parser; the mutation on it must go RED |
| 3 — the caller can discover it | the usage/`--help` line, with a test that fails when it is deleted |
| 4 — it is used | to be recorded at execution: the sweep's own output over the live corpus, with its wall time |

## Class Sweep

**Class:** every verdict this project reports that has a "could not determine" case, and whether that
case is kept out of the ratio.

```bash
grep -rn "UNPROVEN\|UNRUN\|PARTIAL\|superseded\|unrunnable" plugin/bin plugin/scripts scripts | grep -v '^Binary'
```

To be run and recorded at execution. Known at authoring: `mutate.mjs` has `UNPROVEN` (ADR-006),
`spec-verify` has `UNRUN`/`PARTIAL` (ADR-005), and this task adds two more. The sweep is how a fourth
one added later without the same discipline becomes visible.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->

## Invariants

- A sweep writes nothing. The corpus is byte-identical afterwards.
- A fence naming `--sweep` is never executed. The sweep cannot re-enter itself.
- Every fence runs under a timeout; a run that does not finish is unrunnable.
- `environment_failure()` may move a claim to unrunnable only when the fence's own failure is environmental — never because its output happens to contain a matching string.
- Superseded and unrunnable are in neither half of the ratio, and both are printed even when zero.
- The four buckets are disjoint and sum to the distinct claim count.
- `environment_failure()` and `bash_or_exit()` are reused, never re-implemented.
- No model verdict anywhere in this path.

## Risks

- The sweep shares a process with the mode that writes evidence. Mitigated by the byte-identical test and a mutation on its guard.
- The superseded and unrunnable branches have nothing in the live corpus to fire on, so a green run over the real corpus proves nothing about them. Mitigated by the fixture and by requiring a RED mutation for each.
- A fixture fence that calls a missing command may be classified differently across platforms. Mitigated by asserting the BUCKET, not the message, and by using a name no platform ships.

## Stop Condition

Stop if `environment_failure()` cannot distinguish a missing-tool failure from a genuine test failure
on the fixture — that would make the unrunnable bucket a place for real defects to hide, which is
worse than not having it. **What would make this criterion impossible to fail:** a fixture whose
"unrunnable" case also fails its assertions would be classified either way and prove nothing, so the
fixture's unrunnable fence must be one that would otherwise PASS.

## Out of Scope

- `strictFrom` demotion — that is T2's job.
- Repairing the three claims that currently fail — that is T3's job.
- Resolving `Governs:` against the tree. (deferred: docs/BACKLOG.md §45)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
