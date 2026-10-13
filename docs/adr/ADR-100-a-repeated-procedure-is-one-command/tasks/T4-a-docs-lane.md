# Task ADR-100-T4: A change only under docs/ runs the tests that read docs/, if a replay of 20 commits says it is faster and agrees

**Status:** withdrawn — measured 2026-10-13 at e6a00957 plus the uncommitted ADR-101 tree: the derived lane is 140 of 218 test files (1,732 tests) and took 270 s in one run, against the current fast list at 97 to 123 s on four runs that day; the ship rule needs the lane faster, so the 20-commit replay and the seeded faults were not run (BACKLOG §378) The time is not the only leg: the lane holds 8 of the list's 12 files (js-reading, gates, publish-command, qh-check-reads-the-ledger, test-locks, corpus-probe, attest-import, hook-goldens, the slowest among them) and 132 more, so it does strictly more work than the list and is not faster under any load.
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
2. [S2] The changed paths against `HEAD`, with renames split into their two sides: `git diff --name-only --no-renames HEAD` plus `git ls-files --others --exclude-standard`. All under `docs/` (none outside it, at least one) selects the docs lane; anything else, or a git answer it cannot get, selects the whole list. A rename out of `plugin/` into `docs/` names both paths, so it runs the whole list (the cold review of ADR-100 reproduced `git diff --name-only` printing only the destination).
3. [S3] The docs lane: every `tests/*.test.mjs` whose source names `docs/`, a quoted `'docs'` or `"docs"` path segment (`join(repoRoot, 'docs', 'adr')`, `tests/test-locks.test.mjs:20`), or lists tracked files (`ls-files`), derived at run time, plus `node scripts/mutate.mjs --stale`. The lane must include every member of today's list that reads `docs/`; the third test names `tests/test-locks.test.mjs`. The whole list is today's `fastCheck`, moved into the script unchanged.
4. [S4] Measure, in a worktree: (a) the last 20 commits whose `--no-renames` diff is only under `docs/`, the lane and the list run once each at every one, recording exit codes and seconds; (b) seeded docs faults on the newest of them, each of which the list turns red (rename a locked task file, remove a record's `## Decision` heading, delete a `docs/backlog-archive/` file a stub links, write a home path into a doc), and the lane must turn red on every one. Run at a load below the core count. [proof: human: the sign-off carries the 20-row table, the seeded-fault table, the load, and the medians]
5. [S5] Ship only if every replayed row's two exit codes agree, every seeded fault turns the lane red, and the lane's median is lower; then set `fastCheck`. Otherwise record both tables in the BACKLOG, delete the script and its test, and set this task's `**Status:** withdrawn — <the measurement that failed>`, which `adr-next` reads as terminal, so the fence below is not asked of a lane that was not shipped. [proof: human: the sign-off states which branch was taken and why]
6. [S6] Catalogue entries for S2 and S3, killed. [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/fast-check.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (a change only under docs runs the docs lane, and any other change runs the whole fast list|an untracked file outside docs widens the lane|the docs lane is every test file that names docs or lists tracked files|a rename out of plugin into docs runs the whole fast list)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 4
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a change only under docs runs the docs lane, and any other change runs the whole fast list` | `tests/fast-check.test.mjs` | the choice, both directions, and no change at all selects the whole list | — | S2 |
| `an untracked file outside docs widens the lane` | `tests/fast-check.test.mjs` | an untracked `plugin/x.mjs` beside a docs edit selects the whole list | — | S2 |
| `the docs lane is every test file that names docs or lists tracked files` | `tests/fast-check.test.mjs` | the derivation over fixture sources (a `docs/` literal, a quoted `'docs'` segment, an `ls-files` call, and a file with none), and over this repository it includes `tests/corpus-lint.test.mjs`, `tests/path-length.test.mjs` and `tests/test-locks.test.mjs` | — | S3 |
| `a rename out of plugin into docs runs the whole fast list` | `tests/fast-check.test.mjs` | a staged `git mv plugin/x.mjs docs/x.mjs` selects the whole list | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | `.quality-harness.json` `fastCheck`, set only by S5 |
| 3 — the caller can discover it | `qh-check --fast` prints the command it ran |
| 4 — it is used | the fast ledger's durations on docs-only trees after the switch |

## Mutation Log

## Invariants

- The full check before a push is unchanged.
- A change outside `docs/` runs exactly today's list.

## Risks

- A test reads `docs/` through a helper without naming it: the replay alone cannot see that, because those commits are on `main` and the list passed on them, so a subset of the list passes too (the cold review of ADR-100). The seeded faults of S4 (b) are the guard: each must turn the lane red.
- The replay costs about 20 x (100 s + the lane) of machine time: priced and run once, at a load below the core count (costly-runs).

## Stop Condition

Stop and ask if the lane and the list disagree on any replayed commit (that is a test the derivation missed, or a flaky one, and
either is a finding), or if the replay cannot run below the core count.

## Out of Scope

- A lane for any other directory.

## Verification Log
