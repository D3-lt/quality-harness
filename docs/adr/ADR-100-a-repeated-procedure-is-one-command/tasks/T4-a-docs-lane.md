# Task ADR-100-T4: A change only under docs/ runs the tests that read docs/, if a replay of 20 commits says it is faster and agrees

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one new repository script, its tests, the declared `fastCheck`, a measurement)
**Owner:** unassigned
**Produces:** `scripts/fast-check.mjs`; the replay measurement
**Consumes:** none
**Data dependency:** needs the last 20 docs-only commits of this repository, replayed in a worktree
**Proof map:** v1
**Rests-on:** `a change outside docs/ runs the whole list`, `an untracked path counts`, `the lane is derived from the test sources`

## Goal

`fastCheck` runs a docs lane when every changed path is under `docs/`, and today's list otherwise, and the switch ships only if
the lane agrees with the list on the last 20 docs-only commits and is faster.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/fast-check.mjs` | add | the lane choice, the derivation and the run |
| `tests/fast-check.test.mjs` | add | the three tests below |
| `.quality-harness.json` | edit, only if S5 passes | `fastCheck` becomes `node scripts/fast-check.mjs` (what selects the lane) |
| `tests/mutations/scripts/fast-check.mjs.json` | add | entries for the lane choice and the derivation |

## Ordered Steps

1. [S1] Write `tests/fast-check.test.mjs` and run the Acceptance fence red. [proof: acceptance]
2. [S2] The changed paths against `HEAD`: `git diff --name-only HEAD` plus `git ls-files --others --exclude-standard`. All under `docs/` (none outside it, at least one) selects the docs lane; anything else, or a git answer it cannot get, selects the whole list.
3. [S3] The docs lane: every `tests/*.test.mjs` whose source names `docs/` or lists tracked files (`ls-files`), derived at run time, plus `node scripts/mutate.mjs --stale`. The whole list is today's `fastCheck`, moved into the script unchanged.
4. [S4] Measure: list the last 20 commits whose diff is only under `docs/`; in a worktree at each, run the lane and the list once each, at a load below the core count, recording exit codes and seconds. [proof: human: the sign-off carries the table of 20 rows, the load, and the medians]
5. [S5] Ship only if every row's two exit codes agree and the lane's median is lower; then set `fastCheck`. Otherwise record the table in the BACKLOG, delete the script and its test, and mark this task with the measurement. [proof: human: the sign-off states which branch was taken and why]
6. [S6] Catalogue entries for S2 and S3, killed. [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/fast-check.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (a change only under docs runs the docs lane, and any other change runs the whole fast list|an untracked file outside docs widens the lane|the docs lane is every test file that names docs or lists tracked files)$')" = 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a change only under docs runs the docs lane, and any other change runs the whole fast list` | `tests/fast-check.test.mjs` | the choice, both directions, and no change at all selects the whole list | — | S2 |
| `an untracked file outside docs widens the lane` | `tests/fast-check.test.mjs` | an untracked `plugin/x.mjs` beside a docs edit selects the whole list | — | S2 |
| `the docs lane is every test file that names docs or lists tracked files` | `tests/fast-check.test.mjs` | the derivation over fixture sources, and over this repository it includes `tests/corpus-lint.test.mjs` and `tests/path-length.test.mjs` | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `.quality-harness.json` `fastCheck`, set only by S5 |
| 3 — the caller can discover it | `qh-check --fast` prints the command it ran |
| 4 — it is used | the fast ledger's durations on docs-only trees after the switch |

## Mutation Log

## Invariants

- The full check before a push is unchanged.
- A change outside `docs/` runs exactly today's list.

## Risks

- A test reads `docs/` through a helper without naming it: the replay's agreement rule is the guard, and the derivation errs wide.
- The replay costs about 20 x (100 s + the lane) of machine time: priced and run once, at a load below the core count (costly-runs).

## Stop Condition

Stop and ask if the lane and the list disagree on any replayed commit (that is a test the derivation missed, or a flaky one, and
either is a finding), or if the replay cannot run below the core count.

## Out of Scope

- A lane for any other directory.

## Verification Log
