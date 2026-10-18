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
- 2026-10-18 · ff1fcf59* · mutant killed · exit 1 · `plugin/scripts/check-command.mjs` · the pyproject.toml rung no longer recognises [tool.pytest.ini_options] · acceptance-sha256:2752bdf4d160cf2dc0c9e84a9eb1ab014fc89243d0f75835bd0228b2c24aba7f
- 2026-10-18 · ff1fcf59* · mutant killed · exit 1 · `plugin/scripts/check-command.mjs` · the setup.cfg rung no longer recognises [tool:pytest] · acceptance-sha256:2752bdf4d160cf2dc0c9e84a9eb1ab014fc89243d0f75835bd0228b2c24aba7f
- 2026-10-18 · ff1fcf59* · mutant killed · exit 1 · `plugin/scripts/check-command.mjs` · the header no longer has to open a line, so a comment or a string that mentions it infers pytest · acceptance-sha256:2752bdf4d160cf2dc0c9e84a9eb1ab014fc89243d0f75835bd0228b2c24aba7f

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
- 2026-10-18 · ff1fcf59* · exit 1 · `node --test tests/check-inference.test.mjs` · acceptance-sha256:2752bdf4d160cf2dc0c9e84a9eb1ab014fc89243d0f75835bd0228b2c24aba7f · ms:195 · test-lock-sha256:4ac55cc229f72f25003c3d786af4e56310ecbcd1918ca647262a05ea912e47f5 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY2hlY2staW5mZXJlbmNlLnRlc3QubWpzCWEgbWFuaWZlc3QgdGhhdCBkb2VzIG5vdCBjb25maWd1cmUgcHl0ZXN0IGluZmVycyBub3RoaW5nIGZyb20gdGhlc2UgcnVuZ3MJNjI1ZTY0MWZiYjljODdjMWMxZjdmNDM5YjhhZjhiYzQ3MjZkMTNiYmE5ZjNkYjE4MWZiNThiMmIzY2Y4ZmE3ZApib2R5CXRlc3RzL2NoZWNrLWluZmVyZW5jZS50ZXN0Lm1qcwlweXRlc3QgY29uZmlndXJlZCBpbiBweXByb2plY3QudG9tbCBvciBzZXR1cC5jZmcgaXMgaW5mZXJyZWQJYWE0N2FkYzkwMjQ3MTkzMzA2ZDBkOWYwYmVlNjJjOTBkMzk4MzYyZTY2ZDI5M2ViNjdjZDI2ZGQ0NThlYjE1ZQ
  ```
  --- last 10 line(s) of stdout (of 37 after folding 37 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: { command: null, origin: 'none' },
      expected: { command: 'pytest', origin: 'inferred' },
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-18 · ff1fcf59* · exit 0 · `node --test tests/check-inference.test.mjs` · acceptance-sha256:2752bdf4d160cf2dc0c9e84a9eb1ab014fc89243d0f75835bd0228b2c24aba7f · ms:243
- 2026-10-18 · ff1fcf59* · exit 0 · `node --test tests/check-inference.test.mjs` · acceptance-sha256:2752bdf4d160cf2dc0c9e84a9eb1ab014fc89243d0f75835bd0228b2c24aba7f · ms:245
- 2026-10-18 · ff1fcf59* · exit 0 · `node --test tests/check-inference.test.mjs` · acceptance-sha256:2752bdf4d160cf2dc0c9e84a9eb1ab014fc89243d0f75835bd0228b2c24aba7f · ms:240
