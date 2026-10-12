# Task ADR-097-T2: eval tooling leaves the shipped plugin, and the keyless evals workflow goes

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one file moved, its importers, one workflow deleted)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `eval-fixture is not shipped`, `no workflow runs evals`, `the moved tool still works`

## Goal

`eval-fixture.mjs` lives in `scripts/` with the rest of the repository's eval tooling, and `.github/workflows/evals.yml` is gone.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/eval-fixture.mjs` → `scripts/eval-fixture.mjs` | move | only repository tooling imports it (ADR-097 Context) |
| `tests/eval-fixture.test.mjs` | edit | its import path |
| `scripts/*.mjs` that import it | edit | their import paths (`git grep -l eval-fixture -- scripts`) |
| `tests/mutations/plugin/scripts/eval-fixture.mjs.json` → `tests/mutations/scripts/eval-fixture.mjs.json` | move | the catalogue follows its source, `file:` paths updated (CLAUDE.md §1) |
| `.github/workflows/evals.yml` | delete | five runs, none measured anything: no key is set |
| `tests/package.test.mjs` | edit, if it lists shipped scripts | the shipped-set list, only if a test names the file (check locks first) |
| `tests/subtracted.test.mjs` | edit | the test below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the file is still in `plugin/scripts/`).
2. [S2] Move the file and its catalogue entry; fix every importer; delete the workflow.
3. [S3] Run `node --test tests/eval-fixture.test.mjs` to show the moved tool still works. [proof: acceptance]
4. [S4] Record one killed mutant per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/subtracted.test.mjs tests/eval-fixture.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - eval-fixture is repository tooling, and no workflow runs the evals")" = 1 \
  && ! printf '%s\n' "$out" | grep -qE '^not ok '
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `eval-fixture is repository tooling, and no workflow runs the evals` | `tests/subtracted.test.mjs` | `scripts/eval-fixture.mjs` exists and `plugin/scripts/eval-fixture.mjs` does not; no file in `.github/workflows/` invokes the evals | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `tests/eval-fixture.test.mjs` imports it from `scripts/` |
| 3 — the caller can discover it | n/a: repository tooling |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- `plugin/evals/` and its declaration in `plugin.json` are unchanged (ADR-032).

## Risks

- None: the file was never run by a hook or gate.

## Stop Condition

Stop and ask if anything under `plugin/` imports `eval-fixture.mjs`.

## Out of Scope

- `plugin/evals/` itself (deferred: docs/BACKLOG.md §30)

## Verification Log
