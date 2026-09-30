# Task ADR-075-T3: A campaign in the checkout names who it exposes

**Depends-on:** T2
**Covers:** F-11, UC3-S1, UC3-S2, UC3-S3
**Estimated scope:** S (one listing, one line)
**Owner:** unassigned
**Produces:** none
**Consumes:** `--in-place` and `QUALITY_HARNESS_CAMPAIGN_CHILD` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `exposed processes are named`, `nobody exposed says nothing`, `an unreadable list is said`

## Goal

Before a run applies its first mutant in the checkout — `--in-place`, `--repoint --write` or `--narrow --write`, never the isolated child — it names every other process whose command line names the checkout, as advice, and runs. Where it cannot list processes, it says so and runs.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | the listing before the first mutant applied in the checkout |
| `tests/mutate-isolation.test.mjs` | edit | remove `todo` from the exposure test |

## Ordered Steps

1. [S1] Remove `todo` from the exposure test and record the red run with `adr-verify` (TDD red). [proof: acceptance]
2. [S2] Before the first mutant applied in the checkout, list processes with `ps -Ao pid=,args=`; `QUALITY_HARNESS_PROCESS_LIST` names another lister, the test's seam. Keep those whose arguments contain the root's real path, and drop this process, its ancestors and its children. For each one left, say "mutate: an in-place mutant is live for pid N (<command>)". The isolated child skips this, because its tree is private.
3. [S3] If the lister cannot start or exits non-zero, say "mutate: could not look for processes running this checkout (<reason>)" and run. Windows has no `ps`, so it takes this arm, and the test asserts that arm there instead of skipping: a skipped test prints `# SKIP`, which the Acceptance count would read as missing.
4. [S4] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/mutate-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (an in-place campaign names the processes running this checkout, and says when it could not look)' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an in-place campaign names the processes running this checkout, and says when it could not look` | `tests/mutate-isolation.test.mjs` | no line when nobody is exposed; both sleepers named; could-not-look (and only that arm on win32) | F-11, UC3-S1, UC3-S2, UC3-S3 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the listing and its test |
| 2 — something selects it | every run that applies a mutant in the checkout; deleting the call removes the line and the test goes red |
| 3 — the caller can discover it | the stderr lines |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- Nothing is refused for exposure (spec UC-3 postcondition; CLAUDE.md §3).

## Risks

- A process that names the checkout through a relative path or a symlink is not seen. The line is advice, and it says what it looked for.

## Stop Condition

Stop and ask if `ps` output differs between the macOS and Linux runners in a way the path match cannot absorb.

## Out of Scope

- A Windows lister (permanent: boundary: ADR-075 Out of Scope)

## Verification Log
