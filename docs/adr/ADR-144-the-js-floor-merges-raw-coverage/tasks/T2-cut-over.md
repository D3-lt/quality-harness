# Task ADR-144-T2: The required JavaScript floor runs the sharded raw form with recalibrated floors

**Depends-on:** T1
**Awaiting-decision:** the owner, on T1's five runs in docs/BACKLOG.md §459: cut `coverage floor` over to the sharded raw form with floors recalibrated from those runs, or remove the probes and keep the serial native floor
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** `coverage.sh --js --raw <n>`, `--root <dir>` (T1); the five runs' figures in docs/BACKLOG.md §459 (T1)
**Data dependency:** needs T1's five runs, c8 fetchable through `npx` for the runner tests (red, never skipped, without it), and one landing run after the switch
**Proof map:** v1
**Rests-on:** `the plan's four slices and three thresholds`, `the floor's exit on a breached threshold`, `the floor's exit on a failing slice`, `the floor's exit on a failed merge`, `the probes removed from the workflow`, `the required check's name`

## Goal

`bash scripts/coverage.sh --js` holds the floor on the four-slice raw measurement through c8's own threshold check, with floors
taken from T1's serial raw figures, and fails on a breached floor, any failing slice and a failed merge; the native serial command,
the probe jobs and the compare job are gone; `coverage floor` keeps its name.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/coverage.sh` | edit | `--js` runs `--raw 4` and enforces through c8; the native command, its lcov and its serial-determinism comment go; new floors, dated, with their source runs |
| `.github/workflows/selftest.yml` | edit | The probe and compare jobs removed; `coverage floor` unchanged in name and command, its lcov upload removed |
| `tests/coverage-floor-raw.test.mjs` | add | The floor's plan, and the enforcing runner over T1's fixture trees |
| `tests/mutations/scripts/coverage.sh.json` | edit | Dropping a threshold from the merge is noticed |
| `docs/BACKLOG.md` | edit | §459: the first landing after the switch, and the item's disposition |

## Ordered Steps

1. [S1] Write the failing tests first (TDD red): `bash scripts/coverage.sh --js --plan` plans four raw slices and a c8 merge
   that carries `--check-coverage` with the lines, branches and functions floors, and no `--experimental-test-coverage`; and the
   enforcing runner through `--root` over T1's fixture trees: the two-arm tree exits 0 at floors it meets and 1 with
   `QUALITY_HARNESS_JS_BRANCHES=100` on a one-arm tree, naming the breach as a floor; a failing first slice and a corrupted profile
   each exit 1 naming the cause, never as a breached floor.
2. [S2] Recalibrate: each floor is the integer part of the lowest of T1's five serial raw figures for its metric (ADR-144
   Decision 5), written in coverage.sh with the run ids and the date. [proof: human: the owner reads the five figures against the new floors]
3. [S3] Switch `--js` to the raw sharded form, keeping a failing test reported as a failing test, and remove the probe and compare
   jobs and the lcov artifact.
4. [S4] Add the mutant and record one killed per mechanism in Rests-on. [proof: mutation]
5. [S5] Land, and record the first landing run after the switch: its id, `coverage floor`'s duration and figures, and the
   landing's minutes from run creation to its last required check.
   [proof: human: docs/BACKLOG.md §459 holds the run id, the job's duration and figures, and the landing's minutes]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/coverage-floor-raw.test.mjs 2>&1 | tee "$out" && grep -q '✔ the floor is held on the sharded raw measurement' "$out" && grep -q '✔ the floor fails a breached threshold, a failing slice and a failed merge, each named' "$out" && ! grep -q 'coverage raw' .github/workflows/selftest.yml && grep -q '"context": "coverage floor"' .github/rulesets/main.json
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the floor is held on the sharded raw measurement` | `tests/coverage-floor-raw.test.mjs` | Four slices, the c8 threshold check with all three floors, no native command | — | S1, S3 |
| `the floor fails a breached threshold, a failing slice and a failed merge, each named` | `tests/coverage-floor-raw.test.mjs` | Through the real runner over fixture trees: exit 0 at a met floor; exit 1 for a breach, a failing first slice and a corrupted profile, each with its own message | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the raw form as `--js`'s command |
| 2 — selected | the `coverage floor` job, a required check (.github/rulesets/main.json:19) |
| 3 — discoverable | coverage.sh's header comment |
| 4 — used | every landing run; §459's first run after the switch |

## Mutation Log

## Invariants

- The required check's name is `coverage floor`, and the ruleset is not changed.
- A failing test is never reported as a breached floor (coverage.sh:115-131), and neither is a failed merge.
- A floor moves only with its measured figures, the run ids and the date beside it.

## Risks

- The new floors read as a lowered bar: the script and §459 name the tool change and the runs they came from.
- A rare disagreement the five runs did not show: nothing serial runs after the switch, so each landing's figure is compared with
  T1's five serial raw figures in §459, and a move over 0.02 on a tree whose tests and plugin did not change is investigated.

## Stop Condition

Stop when the owner has not chosen the cut-over (Awaiting-decision), when T1's criterion failed, or when the first landing after
the switch takes longer than the 14 minutes ADR-144 Decision 4 set for the job: revert this task's commit.

## Out of Scope

- Raising the floors above the measured figures (permanent: boundary: a floor is a ratchet just under what is measured, coverage.sh:9-11)

## Verification Log
