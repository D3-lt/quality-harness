# Task ADR-111-T1: Inference reads pytest's own configuration

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one module and its test)
**Owner:** Zy
**Produces:** `pytest` inferred from `[tool.pytest.ini_options]` in `pyproject.toml` and `[tool:pytest]` in `setup.cfg`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A Python repository that configures pytest only in `pyproject.toml` or `setup.cfg` gets `pytest` as its inferred check,
as one with `pytest.ini` or `tox.ini` does (ADR-111, Decision 5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/check-command.mjs` | edit | two rungs after `tox.ini` that read the section header, not the file's presence |
| `tests/check-inference.test.mjs` | add | the rungs, and the files that must still infer nothing |
| `tests/mutations/plugin/scripts/check-command.mjs.json` | edit | a mutant per rung |

## Ordered Steps

1. [S1] Write the failing tests: a `pyproject.toml` with `[tool.pytest.ini_options]` and a `setup.cfg` with `[tool:pytest]` each infer `pytest`; a `pyproject.toml` with only `[project]`, a `setup.cfg` with only `[metadata]`, and a section name inside a comment or a string infer nothing. Record the red run.
2. [S2] Add the two rungs, reading the file and matching the section header at the start of a line.
3. [S3] Record a killed mutant per rung with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
node --test tests/check-inference.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `pytest configured in pyproject.toml or setup.cfg is inferred` | `tests/check-inference.test.mjs` | both rungs | — | S1, S2 |
| `a manifest that does not configure pytest infers nothing from these rungs` | `tests/check-inference.test.mjs` | the twins: other sections, a comment, a string | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the rungs in `PROJECT_CHECKS`' reader |
| 2 — something selects it | `checkCommandOrigin`, read by SessionStart and the turn end; the mutants |
| 3 — the caller can discover it | SessionStart's "inferred `pytest` from a manifest" line |
| 4 — it is used | ADR-112's arms |

## Mutation Log

## Invariants

- A declared check still answers before any rung.
- A file that names the section only in a comment or a string infers nothing.

## Risks

- A repository whose pytest configuration needs plugins the checkout lacks gets a red inferred check; the existing
  undeclared caveat says so, and ADR-111's baseline makes it attributable.

## Stop Condition

Stop if a rung would need a TOML or INI parser beyond a line-anchored header match; that is a dependency decision.

## Out of Scope

- Script runners with no manifest, such as `bin/test` (permanent: boundary: nothing in the tree says it is the test runner; ADR-111 Decision 4 says no check is known)

## Verification Log
