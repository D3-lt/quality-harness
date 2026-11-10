# Task ADR-141-T2: SessionStart speaks for a nested corpus

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** none
**Consumes:** `hasDecisionCorpus` admitting a nested corpus (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

In a repository whose only corpus is nested, SessionStart names an unmarked archive beside it, from the core and from Node's
`sessionOrientation`, and BACKLOG §441 is closed with the class command.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/nested-corpus.test.mjs` | edit | `SessionStart names an unmarked archive beside a nested corpus`, for both runtimes |
| `tests/mutations/core/hooks/orientation.go.json` | edit | A mutant at the SessionStart caller (:464) that leaves `corpusLook` at `"false"` |
| `docs/BACKLOG.md` | edit | §441 closed, pointing at ADR-141, with the class command and its count |

## Ordered Steps

1. [S1] Write the failing test first (TDD red): copy python-monorepo into a scratch git repository, add an unmarked
   `services/api/docs/adr-archive/ADR-000-old.md`, and assert that `qh hook SessionStart` (with `QUALITY_HARNESS_NO_MRW=1`) and
   Node's `sessionOrientation` both name `services/api/docs/adr-archive`. Red at ca71fd493: `unmarkedArchives` names it and
   both say nothing (measured 2026-11-10).
2. [S2] Confirm no code change is needed beyond T1 in either SessionStart caller (orientation.go:464,
   session-orientation.mjs:107); if one is, it is T1's predicate being bypassed, and the task stops (Stop Condition).
3. [S3] Run the python-monorepo row of the corpus matrix and read its `sessionStart` lines; expected.json changes only if
   that run shows a new line, and then by a reviewed edit. [proof: acceptance]
4. [S4] Close BACKLOG §441 with the class command from the record's Context, its count on the closing commit, and the pointer
   to ADR-141. [proof: human: the reviewer reads the §441 closure and reruns its command]
5. [S5] Add that caller mutant and record one killed with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/nested-corpus.test.mjs 2>&1 | tee "$out" && grep -q '✔ SessionStart names an unmarked archive beside a nested corpus' "$out" && node --test --test-name-pattern='python-monorepo' tests/corpus-matrix.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `SessionStart names an unmarked archive beside a nested corpus` | `tests/nested-corpus.test.mjs` | Both runtimes' SessionStart pass the gate for a nested corpus | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | T1's gate |
| 2 — selected | orientation.go:464 and session-orientation.mjs:107; the mutant at :464 fails the test |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | the §18 outside run (ADR-141 Follow-ups) |

## Mutation Log

## Invariants

- A repository with no listed corpus still hears none of the corpus-gated lines.

## Risks

- corpus-probe sets `QUALITY_HARNESS_NO_MRW=1` and the fixture has no archive, so the matrix may show no change; this task's own test is what shows the line.
- No doubles: the core is built from source and run over a real git copy.

## Stop Condition

Stop if a SessionStart caller needs its own change: that would mean a second gate T1 did not reach.

## Out of Scope

- corpus-probe recording PreToolUse output (ADR-141 Follow-ups).

## Verification Log
