# Task ADR-076-T3: unasserted.mjs runs in a worktree

**Depends-on:** T1
**Covers:** F-9, F-10, F-13, UC2-S1, UC2-S2
**Estimated scope:** M (one tool, its exits, five tests)
**Owner:** unassigned
**Produces:** `unasserted.mjs --in-place`
**Consumes:** `build`, `remove`, `sweep` in `plugin/scripts/worktree.mjs` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the gate is neutered in the worktree`, `could not isolate is exit 2`, `every exit removes the tree`, `suites do not inherit NODE_TEST_CONTEXT`

## Goal

`scripts/unasserted.mjs` neuters and runs its suites in one worktree by default, removes it on every exit, exits 2 naming `--in-place` when it cannot build one, and never hands its runner's `NODE_TEST_CONTEXT` to a suite (ADR-076 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/unasserted.mjs` | edit | build, run and remove through T1's module; one cleanup boundary that every exit returns through; `--in-place`; the suites' environment |
| `tests/unasserted-isolation.test.mjs` | edit | remove `todo`; the fixture copies `plugin/scripts/worktree.mjs` and what it imports; the early-exit cleanup cases |
| `tests/mutations.json` | edit | this task's entries |

## Ordered Steps

1. [S1] Remove `todo` from the three tests, provision the fixture with T1's module, and record the red run (TDD red). [proof: acceptance]
2. [S2] Build a worktree through T1's module, and point `root`, the gate file and the suites at it.
3. [S3] Put everything after the build in one cleanup boundary. The dirty target, the enumeration failure, the failing baseline and the unreachable suite return an exit code through it instead of calling `process.exit`, so the tree is removed on every path.
4. [S4] A build that fails is exit 2, "could not isolate", naming `--in-place`; `--in-place` is today's behaviour.
5. [S5] Drop `NODE_TEST_CONTEXT` from the suites' environment, on both the named-suites and the whole-selftest branch, as `childEnv` does.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/unasserted-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (an unasserted run leaves the checkout byte-identical|an unasserted run that cannot isolate neuters nothing and names --in-place|an unasserted run started inside a test runner still reads its suite.s failures|a failing baseline removes the worktree|an unreachable suite removes the worktree)' "$T")" -eq 5
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an unasserted run leaves the checkout byte-identical` | `tests/unasserted-isolation.test.mjs` | the suite never sees a neutered checkout; the survivors report; nothing changed | F-9, UC2-S1 | S2 |
| `an unasserted run that cannot isolate neuters nothing and names --in-place` | `tests/unasserted-isolation.test.mjs` | exit 2, `--in-place` named, gate unchanged | F-10, UC2-S2 | S4 |
| `an unasserted run started inside a test runner still reads its suite's failures` | `tests/unasserted-isolation.test.mjs` | the runner's own `NODE_TEST_CONTEXT` is inherited, and the site still reads killed | F-13 | S5 |
| `a failing baseline removes the worktree` | `tests/unasserted-isolation.test.mjs` | exit 2, and git lists no worktree afterwards | — | S3 |
| `an unreachable suite removes the worktree` | `tests/unasserted-isolation.test.mjs` | exit 2, and git lists no worktree afterwards | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the isolated run and its tests |
| 2 — something selects it | every run without `--in-place` |
| 3 — the caller can discover it | its stdout, and the exit 2 line |
| 4 — it is used | maintainers auditing a gate |

## Mutation Log

## Invariants

- The baseline and reachability controls run as today, in the worktree.

## Risks

- A suite that reads an ignored file fails its baseline in the worktree, and the tool says the suite already fails.

## Stop Condition

Stop and ask if a suite needs the checkout's path.

## Out of Scope

- None — the tool's other behaviour is unchanged

## Verification Log
