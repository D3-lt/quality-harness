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
| `core/hooks/decisioncorpus_replay_test.go` | add | Answers the replay rows (`QH_DECISION_CONTEXT_REPLAY`) and the unmarked-archive rows (`QH_UNMARKED_ARCHIVES_ROWS`) |
| `core/hooks/decisioncorpus_parity_test.go` | modify | T1's corpus-record rows are answered by the production reader, which now composes the rules |
| `core/hooks/orientation.go` | modify | `templatesDirectory` and `archiveDirectoryName` match over `asciiLower`, as JavaScript's `/i` without `u` does (BACKLOG §439's class) |
| `tests/decision-context-replay.test.mjs` | add | Copies each corpus into a scratch git repository and writes Node's answers; the unmarked-archive rows |
| `tests/mutations/core/hooks/decisioncorpus_read.go.json` | add | A changed reader step is noticed |
| `tests/mutations/core/hooks/decisioncorpus.go.json` | modify | The archive walk is noticed by the replay |
| `tests/mutations/core/hooks/orientation.go.json` | modify | Go's `(?i)` folding returned to either name rule is noticed |

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
- 2026-11-01 · 77d6a9545* · mutant killed · exit 1 · `core/hooks/decisioncorpus_read.go` · the cut at five lets a sixth record through: six records governing src/many.js, Node names five and (+1 more), Go named all six and still said (+1 more) · acceptance-sha256:af2cf55b1d7cd3c64738d418eb4beb3d1a42d20958d218bb03b837f3d2604ab1
- 2026-11-01 · 77d6a9545* · mutant killed · exit 1 · `core/hooks/decisioncorpus_read.go` · the unproven arm is dropped: for src/u.js, declared by a frozen record its catalog has no row for, Node said UNPROVEN and named docs/adr-archive/ADR-004-orphan.md, Go said nothing · acceptance-sha256:af2cf55b1d7cd3c64738d418eb4beb3d1a42d20958d218bb03b837f3d2604ab1

## Invariants

Rows come from Node live; a corpus whose rows are all empty fails the test.

## Risks

The clone of this repository makes the test slow; its budget is set by the test (CLAUDE.md §7).

## Stop Condition

Stop if a corpus cannot be replayed without editing a locked test.

## Out of Scope

- Switching the hook (T3).

## Verification Log
- 2026-11-01 · 77d6a9545* · exit 1 · `set -o pipefail …` · acceptance-sha256:af2cf55b1d7cd3c64738d418eb4beb3d1a42d20958d218bb03b837f3d2604ab1 · ms:44978 · test-lock-sha256:438f22a417488d31ea1d7ac522c9e2b41e5c44ceba2af260aed3db6d76fd9207 · test-lock-file:docs/adr/locks/438f22a417488d31ea1d7ac522c9e2b41e5c44ceba2af260aed3db6d76fd9207.lock
  ```
  --- last 10 line(s) of stdout (of 86 after folding 88 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 1,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-01 · 77d6a9545* · exit 0 · `set -o pipefail …` · acceptance-sha256:af2cf55b1d7cd3c64738d418eb4beb3d1a42d20958d218bb03b837f3d2604ab1 · ms:46426
- 2026-11-01 · 77d6a9545* · exit 0 · `set -o pipefail …` · acceptance-sha256:af2cf55b1d7cd3c64738d418eb4beb3d1a42d20958d218bb03b837f3d2604ab1 · ms:44962
- 2026-11-01 · 77d6a9545* · exit 0 · `set -o pipefail …` · acceptance-sha256:af2cf55b1d7cd3c64738d418eb4beb3d1a42d20958d218bb03b837f3d2604ab1 · ms:44540
