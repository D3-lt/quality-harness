# Task ADR-119-T5: Test hygiene

**Depends-on:** T1, T2, T3, T4
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `tests/helpers/remove.mjs`
**Consumes:** the test files T1, T2, T3 and T4 edit (T1, T2, T3, T4)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Tests remove their directories through one retrying helper, spawn bash through `testBash`, and `decision-corpus.mjs` stops
holding helpers that belong to its importers (BACKLOG §381 items 17, 19, 23).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/test-hygiene.test.mjs` | add | the sweeps, each with a planted dirty twin, and closed lists of the locked sites that only shrink |
| `tests/helpers/remove.mjs` | add | wraps `rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })` (`tests/unused-names.test.mjs:15`) |
| the unlocked test files of §380's class | edit | their removes go through the helper; S1 enumerates them |
| the test files with bare `bash` spawns | edit | `testBash` (`tests/helpers/bash.mjs`), unlocked files first; S1 enumerates them |
| `plugin/scripts/event-log.mjs` | edit | gains `walk`, `outsideRoot` (with its own local predicate) and `GIT_LISTING_BUFFER` |
| `plugin/scripts/decision-corpus.mjs` | edit | the three leave, and `GIT_LISTING_BUFFER` is imported back from `event-log.mjs` for its own use (:1494); the exported `inside` (:1153) stays, used at five sites there |
| `plugin/scripts/completion-rules.mjs`, `plugin/scripts/check-ledger.mjs`, `plugin/scripts/artifact-pass.mjs`, `plugin/scripts/tree-facts.mjs` | edit | import from `event-log.mjs` |

## Ordered Steps

1. [S1] Write `tests/test-hygiene.test.mjs` and record the red run. Enumerate §380's class (tests that start a session and remove their directory with no retry) and the bare `bash` spawns with a command, and record each count and the locked sites (`scripts/test-locks.py`) in the test's closed lists. Measured 2026-10-20 at 14bc3430: 34 bare-spawn lines in 9 files; the plan counted 33, and a bare `rmSync(` regex finds 709 lines in 216 files, which is not the class.
2. [S2] Add `tests/helpers/remove.mjs` and convert the unlocked files first. Measure how many bare removes sit inside locked bodies before relocking any; a remove in `after()` or in a module helper needs no relock.
3. [S3] Move the bare `bash` spawns onto `testBash`, unlocked files first.
4. [S4] Run `node scripts/orphan-sweep.mjs` for the exported `inside` first. Then move `walk`, `outsideRoot` and `GIT_LISTING_BUFFER` to `event-log.mjs`, the one module all four importers and `decision-corpus.mjs` already import, and point the importers at it. `outsideRoot` calls its own local predicate (`decision-corpus.mjs:32-35`), not the exported `inside` (:1153, which returns a relative path or null), so the local predicate moves with it. The exported `inside` moves only if the orphan check shows a caller outside `decision-corpus.mjs`; on 2026-10-20 `mrw read --grep` found no file importing it from there. If the sweep reports the export as an orphan, the `export` is removed (dead code is deleted or wired, CLAUDE.md §13).
5. [S5] Record a killed mutant for each sweep (a planted bare call is found) and for the move (an importer left on `decision-corpus.mjs`). [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs 2>&1) \
  && for n in "no test outside the locked list removes its directory without the retrying helper" \
      "no test outside the locked list spawns a bare bash" \
      "decision-corpus.mjs no longer holds walk, outsideRoot or GIT_LISTING_BUFFER"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && node scripts/orphan-sweep.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `no test outside the locked list removes its directory without the retrying helper` | `tests/test-hygiene.test.mjs` | the sweep over the git listing, with a planted bare remove found and a locked site that left the tree removed from the list | — | S1, S2 |
| `no test outside the locked list spawns a bare bash` | `tests/test-hygiene.test.mjs` | the same for `spawnSync('bash'`, `execFileSync('bash'`, `spawn('bash'` | — | S1, S3 |
| `decision-corpus.mjs no longer holds walk, outsideRoot or GIT_LISTING_BUFFER` | `tests/test-hygiene.test.mjs` | the three are exported by `event-log.mjs` and imported from it by every importer; `outsideRoot` answers as before for a path inside, outside and case-folded | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/test-hygiene.test.mjs` |
| 2 — something selects it | `scripts/selftest.sh` runs every `tests/*.test.mjs` |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every selftest, on every platform CI runs |

## Mutation Log

## Invariants

- Locked test bodies stay byte-identical unless relocked with the reason (CLAUDE.md §2).
- The closed lists only shrink.

## Risks

- A spawn converted to `testBash` on a POSIX host changes nothing there; the change is for a Windows host, which CI runs and this machine cannot.

## Stop Condition

Stop if moving the helpers to `event-log.mjs` would add an import cycle: the destination is then the owner's decision.

## Out of Scope

- The Windows hook goldens, item 23's second half (deferred: docs/BACKLOG.md §381)

## Verification Log
