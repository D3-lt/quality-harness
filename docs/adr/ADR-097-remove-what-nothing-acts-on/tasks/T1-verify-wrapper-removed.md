# Task ADR-097-T1: `verify.mjs` is removed, and nothing shipped sends an agent to it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one script, one skill paragraph, one selftest line, three locked tests and their relocks)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the test file passes`, `the absence of the wrapper`

## Goal

`plugin/scripts/verify.mjs` no longer ships, and no shipped file, test or gate line names it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/verify.mjs` | delete | the wrapper nothing runs (ADR-097 Context) |
| `tests/mutations/plugin/scripts/verify.mjs.json` | delete | the catalogue file of a deleted source moves with it (CLAUDE.md §1) |
| `plugin/skills/quality-policy/SKILL.md` | edit | remove lines 51-54's instruction; say to run the project's check through `qh-check` |
| `scripts/selftest.sh` | edit | remove `node --check "$ROOT/scripts/verify.mjs"` |
| `tests/gate-rules.test.mjs` | edit | delete "the verification wrapper reports what the command it ran actually did" (locked by ADR-075 T2, ADR-091 T3) |
| `tests/lifecycle.test.mjs` | edit | delete "documented custom-validator wrapper executes through Node" (locked by ADR-068 T2) |
| `tests/package.test.mjs` | edit | drop `'verify'` from "importing a script runs its CLI on nobody" (locked by ADR-091 T3) |
| `tests/subtracted.test.mjs` | add | the test below |
| `docs/adr/ADR-068-git-refuses-in-a-linked-worktree-and-says-when-it-is-armed/tasks/T2-sessionstart-says-git-not-armed.md` | relock | `adr-verify --relock --replace-hashes` after the deletion is reviewed |
| `docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load/tasks/T2-a-campaign-runs-in-a-worktree.md` | relock | same |
| `docs/adr/ADR-091-the-catalogue-is-a-file-per-source/tasks/T3-the-catalogue-moves-in-one-commit.md` | relock | same; this also answers its open debt item about relocking ADR-075 T2 |

## Ordered Steps

1. [S1] Write `tests/subtracted.test.mjs` with the test below and record the red run (TDD red: the file still exists).
2. [S2] Delete the wrapper, its catalogue file and its selftest line; rewrite the skill paragraph.
3. [S3] Delete the two locked tests and change the third; then retake the lock maps of ADR-068 T2, ADR-075 T2 and ADR-091 T3 with `adr-verify --relock --replace-hashes`. A relock snapshots hashes and runs no fence: the deletions are proved by this task's test and the full gate. [proof: acceptance]
4. [S4] Record one killed mutant: restoring the skill's `verify.mjs` line turns the test red. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/subtracted.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - verify\.mjs is not shipped, and nothing shipped or tested names it")" = 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `verify.mjs is not shipped, and nothing shipped or tested names it` | `tests/subtracted.test.mjs` | the file is absent from `plugin/scripts/`, and `verify.mjs` appears in no file under `plugin/`, `scripts/` or `tests/` but this test; a fixture that names it is reported | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | n/a: a removal; the test scans every file that could select it |
| 3 — the caller can discover it | the quality-policy skill no longer names it |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- No gate's verdict changes: nothing read `verify.mjs`'s runs.

## Risks

- A relock records new hashes without running anything, so it can hide an unreviewed change to a locked test: relock only after the deletion is in the same diff, and review it there.

## Stop Condition

Stop and ask if any hook, gate or record other than those listed turns out to read `verify.mjs`.

## Out of Scope

- The other removals (T2, T3)

## Verification Log
