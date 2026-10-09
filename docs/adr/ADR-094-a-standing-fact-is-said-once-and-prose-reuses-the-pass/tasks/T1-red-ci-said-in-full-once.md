# Task ADR-094-T1: a red CI is said in full once, and a withheld snapshot says nothing

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one script, its tests and campaign entries)
**Owner:** unassigned
**Produces:** `redKey(state)` and the one-line red form in `plugin/scripts/branch-state.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a red run is keyed by its sha, conclusion and full failed set`, `a withheld snapshot stores nothing`, `the short red line is never stored as said`

## Goal

The per-prompt brief prints a completed failed run in full only when its key changes and as one line otherwise, and prints nothing past the cap, so `said` always holds the last text actually shown.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/branch-state.mjs` | edit | delete `withheldStamp` (`:661`) and its uses (`:857-865`); `redKey`, the capped full text, the one-line form; the age-free "refresh could not be started" line; `emitCachedBranchState` (`:779`) chooses between them; the store writer keeps `redKey` beside `said` across a refresh |
| `tests/branch-state.test.mjs` | edit | three tests beside the locked ADR-065 ones; the unlocked withheld assertions at `:981-991` change in place |
| `tests/mutations/plugin/scripts/branch-state.mjs.json` | edit | three entries, one per `Rests-on` name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/branch-state.test.mjs`, then write the three tests of the Tests table beside the locked ones and record the red run (TDD red). Red today: a red run is printed in full on every prompt, and a replaced snapshot past the cap is printed.
2. [S2] Delete `withheldStamp` and its two uses. Past the cap with a refresh running, print nothing and store nothing. With no refresh started, print one line without an age, compare it with `said`, and store it as `said`.
3. [S3] Add `redKey(state)`: the sha, the conclusion word and the sorted full list of failed job names. Store it beside `said`; keep it across a refresh as `said` is kept. In `emitCachedBranchState`, a red state whose key differs from the stored one prints in full (at most three job names, then "+N more", and the conclusion word); the same key prints `CI <sha7>: <conclusion>, N job(s), unchanged`; the short line is never stored as `said`. The full report at SessionStart is unchanged.
4. [S4] Keep the locked tests byte-identical. Where an unlocked assertion changes, change it in place. Where a lock names a line this task changes, relock through this record. [proof: acceptance]
5. [S5] Record three killed mutants: restore the stamp, compare the key on the capped text, drop the conclusion word. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/branch-state.test.mjs 2>&1) \
  && for t in 'a completed red CI is said in full once, then one unchanged line' 'a red CI whose failing jobs change past the third name is said in full again' 'a snapshot past the cap says nothing, and a refresh that could not start says so once'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a completed red CI is said in full once, then one unchanged line` | `tests/branch-state.test.mjs` | three prompts on the same red snapshot print the full text, then `CI <sha7>: failure, N job(s), unchanged` twice; the second and third are not stored as `said`; DIRTY twin: a refresh to the same red run does not reprint in full, a new sha does | none | S1, S3 |
| `a red CI whose failing jobs change past the third name is said in full again` | `tests/branch-state.test.mjs` | five failed jobs, then the same count with the fifth name swapped: the capped text is identical, the key differs, the brief prints in full; a `cancelled` conclusion prints the word and never "0 jobs" | none | S3 |
| `a snapshot past the cap says nothing, and a refresh that could not start says so once` | `tests/branch-state.test.mjs` | past the cap with a running refresh, two prompts print nothing and a replacement snapshot that expired prints nothing; with no refresh startable the age-free line prints once | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `main`'s brief path calls `emitCachedBranchState`; dropping the key comparison turns the first test red |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the hook's stdout |
| 4 — it is used | the survey sessions count their brief lines before and after (the outside run); nothing measures this yet |

## Mutation Log

## Invariants

- A red completed run is never silent: it prints on the first prompt after it changes and a line on every other.
- An unknown (could not look, run in progress) is said once per change, as before.
- Past the cap nothing about the old snapshot is shown; the brief never displays a stale answer (ADR-065).
- The locked ADR-065 tests stay byte-identical.

## Risks

- The cache writer keeps `said` across a refresh; `redKey` must be kept the same way, or the next refresh prints in full again. A test refreshes between two prompts.
- The one-line form hides job names the model could use; the full text returns when the key changes, and the full report at SessionStart still names them.

## Stop Condition

Stop and ask if a locked test fails and cannot hold by adding a test beside it, or if the store writer cannot keep a second field without changing the snapshot's key.

## Out of Scope

- Skipping the brief on injected prompts (deferred: docs/BACKLOG.md §372)
- Amending CLAUDE.md §15 (the owner's: ADR-094 Follow-up 1)

## Verification Log
