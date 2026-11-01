# Task ADR-134-T1: An override pass names its test

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`spec-verify --implemented` credits a Cmd override's exit 0 only when the override's output names the bound test.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/spec-verify` | edit | The override branch of `test_runs` requires the bound name in the output |
| `plugin/templates/spec-template.md` | edit | The Cmd guidance states the new requirement |
| `tests/spec-verify-ran.test.mjs` | edit | New dirty/clean test; the exit-only twin prints the name |
| `tests/gate-rules.test.mjs` | edit | Three locked overrides print the bound name |
| `tests/mutations/plugin/bin/spec-verify.json` | edit | Dropping the name check is noticed |
| `docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load/tasks/T2-a-campaign-runs-in-a-worktree.md` | tool-written | Relock with `--replace-hashes` |
| `docs/adr/ADR-091-the-catalogue-is-a-file-per-source/tasks/T3-the-catalogue-moves-in-one-commit.md` | tool-written | Relock with `--replace-hashes` |
| `docs/BACKLOG.md` | edit | §404 records the override half closed |

## Ordered Steps

1. [S1] Add `a Cmd override that exits 0 without naming the bound test is UNRUN and not a pass` to `tests/spec-verify-ran.test.mjs`: `printf audit-marker` and `test -f spec-selftest.md` exit 4 and say UNRUN; an override printing `test_gates_run` exits 0; an override printing the name and exiting 1 exits 3. Confirm it fails before the code changes.
2. [S2] In `test_runs`, take the bound name with `split_binding` and return `unrun` with a reason naming it when an override exits 0 without it in its output.
3. [S3] Make the exit-only twin in `tests/spec-verify-ran.test.mjs` and the three locked overrides in `tests/gate-rules.test.mjs` print the bound name, keeping what each asserts; update the template's Cmd line. [proof: acceptance]
4. [S4] Relock ADR-075 T2 and ADR-091 T3 with `adr-verify --relock --replace-hashes`, and run their tests in `tests/gate-rules.test.mjs`.
5. [S5] Add a catalogue mutant that removes the name check and record it killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/spec-verify-ran.test.mjs 2>&1 | tee "$out" && grep -q '✔ a Cmd override that exits 0 without naming the bound test is UNRUN and not a pass' "$out"
```

The grep makes a missing or renamed test a failure.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a Cmd override that exits 0 without naming the bound test is UNRUN and not a pass` | `tests/spec-verify-ran.test.mjs` | Silent and unrelated output is UNRUN; the named output passes; a named failure fails | — | S1, S2 |
| `a Cmd override that runs nothing is UNRUN, not a pass` | `tests/spec-verify-ran.test.mjs` | The no-op refusal still holds; the real-command twin now prints the name | — | S3 |
| `spec-verify --implemented runs the bound tests and separates RED from broken` | `tests/gate-rules.test.mjs` | A green and a red override, and a backticked one not running its output, with the name printed | — | S3, S4 |
| `a scenario can override its runner, which is the escape it never had` | `tests/gate-rules.test.mjs` | A scenario override that names its test is adjudicated | — | S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | The check is in `test_runs` |
| 2 — selected | The public CLI `spec-verify --implemented` reaches it in the tests |
| 3 — discoverable | The UNRUN reason names the fix; the template states the rule |
| 4 — used | Every `--implemented` run over a spec with an override |

## Mutation Log
- 2026-11-01 · 06be8fef* · mutant killed · exit 1 · `plugin/bin/spec-verify` · Removing the name check lets printf audit-marker and a silent test -f override pass again; the new test fails. · acceptance-sha256:110f3d237f791a6040a447b7b2df6fc72b3553c07c9d4f6dbc9fb60bb5329f6d

## Invariants

A non-zero override is still `fail`; a no-op override is still not run; stack runners are unchanged.

## Risks

A short bound name matches incidental output; ADR-134 Decision 2 names it.

## Stop Condition

Stop if a locked test outside the three named assertions changes, or if `--replace-hashes` refuses.

## Out of Scope

- pytest, pest and molecule stack runs (BACKLOG §404).

## Verification Log
- 2026-11-01 · 06be8fef* · exit 1 · `set -o pipefail …` · acceptance-sha256:110f3d237f791a6040a447b7b2df6fc72b3553c07c9d4f6dbc9fb60bb5329f6d · ms:1347 · test-lock-sha256:546eaa60f079000a46082f19078e3d5618af27ad158a2e5f9bd8f260a36732f0 · test-lock-file:docs/adr/locks/546eaa60f079000a46082f19078e3d5618af27ad158a2e5f9bd8f260a36732f0.lock
  ```
  --- last 10 line(s) of stdout (of 35 after folding 36 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 0,
      expected: 4,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-01 · 06be8fef* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:110f3d237f791a6040a447b7b2df6fc72b3553c07c9d4f6dbc9fb60bb5329f6d · ms:0 · test-lock-sha256:30ed7162cbac488a4a67467bc804b151c65682e19ce8be4e1801d34e479aa86b · test-lock-file:docs/adr/locks/30ed7162cbac488a4a67467bc804b151c65682e19ce8be4e1801d34e479aa86b.lock · test-lock-kind:replace
- 2026-11-01 · 06be8fef* · exit 0 · `set -o pipefail …` · acceptance-sha256:110f3d237f791a6040a447b7b2df6fc72b3553c07c9d4f6dbc9fb60bb5329f6d · ms:1385
- 2026-11-01 · 06be8fef* · exit 0 · `set -o pipefail …` · acceptance-sha256:110f3d237f791a6040a447b7b2df6fc72b3553c07c9d4f6dbc9fb60bb5329f6d · ms:1799
- 2026-11-01 · 06be8fef* · exit 0 · `adr-verify --relock` · acceptance-sha256:110f3d237f791a6040a447b7b2df6fc72b3553c07c9d4f6dbc9fb60bb5329f6d · ms:0 · test-lock-sha256:4cea18592385d25ad48ba39fac8971f437ac6756214efa994a482cb227f6a6f5 · test-lock-file:docs/adr/locks/4cea18592385d25ad48ba39fac8971f437ac6756214efa994a482cb227f6a6f5.lock · test-lock-kind:relock
- 2026-11-01 · 06be8fef* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:110f3d237f791a6040a447b7b2df6fc72b3553c07c9d4f6dbc9fb60bb5329f6d · ms:0 · test-lock-sha256:9d14a75c14b345350b01f012bda7e0d8963be522d6b5c2a556a575dd74fb654b · test-lock-file:docs/adr/locks/9d14a75c14b345350b01f012bda7e0d8963be522d6b5c2a556a575dd74fb654b.lock · test-lock-kind:replace
