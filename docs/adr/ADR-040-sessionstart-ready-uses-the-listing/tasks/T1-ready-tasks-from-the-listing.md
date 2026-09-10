# Task ADR-040-T1: SessionStart inventories ready task dirs from the listing

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2, UC1-S3
**Estimated scope:** S (single file plus tests)
**Owner:** zy
**Produces:** listing-shaped `{ look, lines }` from `readyTaskLines`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`sessionOrientation` and `sessionStateNote` offer ready task directories the listing named; disk-only dirs are not in flight; git-fail is UNPROVEN.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `taskDirectories` / `readyTaskLines` / both SessionStart callers |
| `tests/lifecycle.test.mjs` | add | listed, gitignored, and git-fail ready-task fixtures |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Inventory task dirs from the listing; name UNPROVEN when git cannot list. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'SessionStart offers ready tasks the listing named|a disk-only task dir is not in flight|git cannot list is UNPROVEN, not no ready tasks' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `SessionStart offers ready tasks the listing named` | `tests/lifecycle.test.mjs` | listed tasks dir may be in flight | F-1, UC1-S1 | S1, S2 |
| `a disk-only task dir is not in flight` | `tests/lifecycle.test.mjs` | gitignored tasks dir is not offered, including `sessionStateNote` | F-1, UC1-S2 | S1, S2 |
| `git cannot list is UNPROVEN, not no ready tasks` | `tests/lifecycle.test.mjs` | rev-parse ok + ls-files fail is named UNPROVEN | F-1, UC1-S3 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-1 tests |
| 2 — something selects it | SessionStart calls `sessionOrientation` |
| 3 — the caller can discover it | `hooks.json` SessionStart |
| 4 — it is used | this repository's own sessions still name listed ready tasks |

## Mutation Log

## Invariants

- Disk-only `tasks/` is not in flight.
- Git-fail (listing null inside a repo) is UNPROVEN, not an omitted ready section.
- Not-a-repository stays no ADR reading.

## Risks

- A not-a-repo fixture tests the wrong git-fail member — git-fail requires rev-parse success.

## Stop Condition

A green F-31 test while SessionStart still `readdirSync`s, or UNPROVEN that only omits the ready section.

## Out of Scope

- `hasDecisionCorpus` (T2)
- Unify with `work-next` / `adr-next`

## Verification Log
