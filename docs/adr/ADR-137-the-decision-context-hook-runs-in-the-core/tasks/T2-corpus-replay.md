# Task ADR-137-T2: The core's decision context matches Node's over real corpora

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** Go `decisionContext`
**Consumes:** `decisioncorpus.go` record rules (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A Go `decisionContext(file, root)` built on the git listing gives the exact text Node's decisionContext gives, for every path
of every replayed corpus.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/decisioncorpus_read.go` | add | Discovery, budgets, reading, archives, task attribution, decisionsGoverning and the text |
| `core/hooks/decisioncorpus_replay_test.go` | add | Answers the replay rows (`QH_DECISION_CONTEXT_REPLAY`) |
| `tests/decision-context-replay.test.mjs` | add | Copies each corpus into a scratch git repository and writes Node's answers |
| `tests/mutations/core/hooks/decisioncorpus_read.go.json` | add | A changed reader step is noticed |

## Ordered Steps

1. [S1] Write `tests/decision-context-replay.test.mjs`: copy every tests/fixtures/corpora/* corpus, tests/fixtures/ok's archive and tests/fixtures/foreign into scratch git repositories (never in place: `fixtures` is an uninteresting directory and in place every answer is empty), plus a `git clone` of this repository into the test's temporary directory (CLAUDE.md §9). For each, rows are every tracked path, every path a record declares, and paths nothing governs; each row's answer is Node's decisionContext text. Require "N rows compared, 0 disagreements" and that some rows have non-empty answers in each corpus that has governing records. Confirm it fails first.
2. [S2] Implement the reader in Go, reusing orientation.go's listing.
3. [S3] Add mutants on the five-per-group cut, the archive walk, the unproven arm and the reading budget; record two killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/decision-context-replay.test.mjs 2>&1 | tee "$out" && grep -q '✔ the core gives the decision context Node gives over every replayed corpus' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the core gives the decision context Node gives over every replayed corpus` | `tests/decision-context-replay.test.mjs` | Byte-exact text per path per corpus | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | Go `decisionContext` |
| 2 — selected | T3 |
| 3 — discoverable | T3 |
| 4 — used | T3 |

## Mutation Log

## Invariants

Rows come from Node live; a corpus whose rows are all empty fails the test.

## Risks

The clone of this repository makes the test slow; its budget is set by the test (CLAUDE.md §7).

## Stop Condition

Stop if a corpus cannot be replayed without editing a locked test.

## Out of Scope

- Switching the hook (T3).

## Verification Log
