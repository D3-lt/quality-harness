# Task ADR-094-T4: a write outside the repository is not an unseen write

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one predicate, its callers and tests)
**Owner:** unassigned
**Produces:** `unobservableWrites(log, root)` — counts only writes the repository could have been changed by
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an absolute path outside the root is not an unseen write`, `a relative or unplaceable path still is`, `the previous-session notice does not count an outside write`

## Goal

`unobservableWrites` skips an absolute `file.written` path outside the repository's root, as `unseenWriteSince` already does, so a write to a scratchpad no longer counts as work the check has not seen.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `unobservableWrites(log, root)` (`:6315`) uses `outsideRoot` (`:807`); every caller passes the root; the comment at `:5299-5304`, which records the opposite decision, is corrected |
| `tests/outside-root-writes.test.mjs` | add | two tests |
| `tests/mutations/plugin/scripts/lifecycle.mjs.json` | edit | two entries, one per `Rests-on` name |

## Ordered Steps

1. [S1] Write the two tests of the Tests table and record the red run (TDD red). Red today: the outside write is counted.
2. [S2] Reproduce before changing code: run a Write to a path outside the repository with the PostToolUse hook on, read the session log, and record whether `file.written` was appended with `observable: false` and what `previousSessionNotice` counts. Time the hook for an inside and an outside path on this machine. If the cost does not reproduce, say so in the sign-off: the Windows figure stays UNPROVEN until the outside run. [proof: human: the reproduction run and its timings are in the sign-off line]
3. [S3] Pass the root to `unobservableWrites` at every caller (enumerate them with `mrw read --grep 'unobservableWrites' plugin tests` and put the command and the count in the sign-off), skip an absolute path outside the root, and keep a relative or unplaceable path counted.
4. [S4] Record two killed mutants: drop the skip; make an unplaceable path skip as well. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/outside-root-writes.test.mjs 2>&1) \
  && for t in 'an absolute write outside the repository is not counted as unseen' 'a relative or unplaceable write path is still counted as unseen'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an absolute write outside the repository is not counted as unseen` | `tests/outside-root-writes.test.mjs` | a log with a `file.written` entry for a scratchpad path and `observable: false` gives zero, and the previous-session notice does not mention it; a path through a symlinked temp directory (`/tmp` resolves to `/private/tmp`) is placed correctly | none | S1, S3 |
| `a relative or unplaceable write path is still counted as unseen` | `tests/outside-root-writes.test.mjs` | the dirty twin: a relative path, a missing path and a path inside the root stay counted | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `previousSessionNotice` and the completion advice call `unobservableWrites`; dropping the skip turns the first test red |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | the three Windows sessions' counts after the change (the outside run); nothing measures this yet |

## Mutation Log

## Invariants

- A write whose place cannot be established is still counted: unplaceable is not outside (CLAUDE.md §16).
- `unseenWriteSince` is unchanged.

## Risks

- A symlinked or case-folded root misplaces a path; the test uses the same spellings `outsideRoot` already handles.

## Stop Condition

Stop and ask if a caller cannot know the root, or if the reproduction shows the entry is not recorded at all (then the premise is different and the task is dropped).

## Out of Scope

- The per-write hook cost on Windows, if it does not reproduce here (deferred: docs/BACKLOG.md §370)

## Verification Log
