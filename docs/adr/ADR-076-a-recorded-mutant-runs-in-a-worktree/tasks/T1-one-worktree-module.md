# Task ADR-076-T1: One worktree module, shipped, with an ownership contract any caller can keep

**Depends-on:** none
**Covers:** F-8
**Estimated scope:** M (a move, a CLI, an ownership record, one new test file)
**Owner:** unassigned
**Produces:** `build`, `remove`, `sweep`, `addOwned` and the `owner.json` contract in `plugin/scripts/worktree.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a worktree is built of the working-tree content`, `a leftover worktree is swept once its owners end`, `a recorded group keeps its tree`, `the CLI prints one JSON line`, `a setup failure removes the tree`

## Goal

`plugin/scripts/worktree.mjs` owns building, removing and sweeping a worktree of a checkout's working-tree content at `<git-common-dir>/qh-campaigns/<id>/tree`, as a module and as a CLI, with an ownership record any caller — a Node campaign, a Python gate — keeps before starting a process in the tree; `scripts/mutate.mjs` imports it instead of keeping its own copy (ADR-076 Decision, "One mechanism, shipped" and "Ownership").

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/worktree.mjs` | add | `build`, `remove`, `sweep`, `addOwned`, and the CLI `adr-verify` calls |
| `scripts/mutate.mjs` | edit | import the module; delete `campaignHome`, `sweepCampaigns`, `overlayTracked` and the build steps it moves; keep the child handshake, the selection hand-over and the cache |
| `tests/worktree.test.mjs` | add | the module and the CLI over a fixture repository |
| `tests/mutations.json` | edit | repoint ADR-075's entries to the moved code; add this task's |
| `docs/adr/ADR-076-a-recorded-mutant-runs-in-a-worktree.md` | edit | add `plugin/scripts/worktree.mjs` to **Governs:** once it exists |

## Ordered Steps

1. [S1] Write `tests/worktree.test.mjs` and see it fail: no module exists (TDD red). [proof: acceptance]
2. [S2] Move the build (stash or HEAD, `worktree add`, the untracked copy with a caller-given exclusion list, which the campaign fills with its lock, journal and cache, and the tracked-bytes overlay), `campaignHome`, `sweepCampaigns` and removal into `plugin/scripts/worktree.mjs`, each exported, with ADR-075's comments moved with them. Every setup step after `worktree add` removes the tree when it fails.
3. [S3] The ownership record: `build --owner <pid>` writes `<id>/owner.json` before `worktree add`; `addOwned(id, { group })` / `{ job }` (and `add-owned <id> --group N | --job ID` on the CLI) records a process before it starts. The sweep removes an `<id>` only when the owner and every recorded group or job has ended, and leaves an unreadable `owner.json` alone for a day.
4. [S4] The CLI: `build <root> --owner <pid> [--exclude <path>…]` prints one JSON line (`{ tree, id, builtMs, overlaid }` or `{ error }`) and exits 0 or 2; `add-owned`; `remove <id>`; `sweep <root>`. Then add `plugin/scripts/worktree.mjs` to ADR-076's **Governs:**, which cannot name a file before it exists.
5. [S5] Make `scripts/mutate.mjs` import them; `tests/mutate-isolation.test.mjs` stays green unchanged.
6. [S6] Repoint the ADR-075 catalogue entries whose code moved, and run every entry on both files, uncached and to completion (CLAUDE.md §18: a moved observable turns the old site's tests vacuous). [proof: mutation]
7. [S7] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/worktree.test.mjs tests/mutate-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a worktree holds the checkout.s working-tree content|a leftover worktree is swept once no owner lives|a recorded process group keeps its worktree from the sweep|the CLI builds and removes a worktree and says why it could not|a setup failure after worktree add removes the worktree|the campaign.s own files are never copied into its worktree)' "$T")" -eq 6
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a worktree holds the checkout's working-tree content` | `tests/worktree.test.mjs` | an uncommitted edit, an untracked file, a deletion and CRLF bytes under `eol=lf` are all in the tree | F-8 | S2 |
| `a leftover worktree is swept once no owner lives` | `tests/worktree.test.mjs` | a live owner keeps it; a dead one lets the sweep remove it and say so | F-8 | S3 |
| `a recorded process group keeps its worktree from the sweep` | `tests/worktree.test.mjs` | owner dead, recorded group alive: the sweep keeps the tree (POSIX); on Windows a live job pid keeps it | F-8 | S3 |
| `the CLI builds and removes a worktree and says why it could not` | `tests/worktree.test.mjs` | one JSON line; outside git, `{ error }` and exit 2 | F-8 | S4 |
| `a setup failure after worktree add removes the worktree` | `tests/worktree.test.mjs` | an injected overlay failure and an injected untracked-copy failure each leave no registered tree | — | S2 |
| `the campaign's own files are never copied into its worktree` | `tests/worktree.test.mjs` | the exclusion list reaches the untracked copy | — | S2, S5 |
| `a campaign leaves the working tree byte-identical and its mutants never appear there` | `tests/mutate-isolation.test.mjs` | the campaign still isolates through the moved code | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the module and its tests |
| 2 — something selects it | `scripts/mutate.mjs` imports it; T2 and T3 call it |
| 3 — the caller can discover it | the CLI's JSON line |
| 4 — it is used | every isolated campaign |

## Mutation Log

## Invariants

- `scripts/mutate.mjs`'s behaviour and output are unchanged (ADR-075).
- Nothing under the OS temp root is used for a tree (ADR-075: `plugin/scripts/lifecycle.mjs:347`).
- The sweep never removes a tree while any process it knows of may still work in it.

## Risks

- The move leaves an ADR-075 catalogue entry vacuous. S6 runs them all, uncached.

## Stop Condition

Stop and ask if a moved function cannot be exported without changing what the campaign prints.

## Out of Scope

- The campaign's child handshake and selection hand-over (permanent: boundary: they stay in `scripts/mutate.mjs`)

## Verification Log
