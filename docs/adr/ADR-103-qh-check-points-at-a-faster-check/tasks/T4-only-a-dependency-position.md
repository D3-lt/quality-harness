# Task ADR-103-T4: only a dependency position declares a dependency

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S (one TOML reader, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** `fastCheckHint(root)` (T1)
**Data dependency:** hermetic; fixture manifests the test writes
**Proof map:** v1

## Goal

The verification review of T3 (Codex, 2026-10-15) found exact-name text outside any dependency position still read as a
declaration: `description = "pytest-testmon"` in `[project]`, and `pytest-testmon = false` in `[tool.custom]`. `pyproject.toml` is
read by table: a string in `[project]`'s `dependencies` array, in an array of `[project.optional-dependencies]` or
`[dependency-groups]`, or a key in a Poetry dependency table (`tool.poetry.dependencies`, `tool.poetry.dev-dependencies`,
`tool.poetry.group.<name>.dependencies`) — nothing else (ADR-103, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/fast-check-hint.mjs` | edit | a line reader that tracks the table and the dependency array it is in |
| `tests/fast-check-hint.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/fast-check-hint.mjs.json` | edit | entries below |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: a description and a custom table are named).
2. [S2] Read `pyproject.toml` by table and array.
3. [S3] Record killed mutants on the table rule and the array rule. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - only a dependency position declares a dependency")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `only a dependency position declares a dependency` | `tests/fast-check-hint.test.mjs` | a `[project]` description and a `[tool.custom]` key draw the plain lever; a multi-line `[project]` dependencies array, an optional-dependencies group, a dependency group and a Poetry group key are named | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the table reader |
| 2 — something selects it | `fastCheckHint` (T1) |
| 3 — the caller can discover it | the hint on stderr |
| 4 — it is used | ADR-103's Follow-ups |

## Mutation Log
- 2026-10-15 · f6665205* · mutant killed · exit 1 · `plugin/scripts/fast-check-hint.mjs` · a quoted pytest-testmon anywhere, a description or a custom list, is named as a dependency again · acceptance-sha256:d8bdc6ac1f35782876432c3eaa5a73b98e02ae406a9c0a64d97832653c5de0e9

## Invariants

- T1's and T3's tests still pass.

## Risks

- An inline table spanning lines (`dependencies = [` closed later after other keys) is read until its closing bracket.

## Stop Condition

Stop and ask if a common layout declares pytest-testmon somewhere this reader leaves out.

## Out of Scope

- A full TOML parser (permanent: boundary: no dependency is added for one advisory; the reader covers the declared positions above)

## Verification Log
- 2026-10-15 · f6665205* · exit 1 · `out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs 2>&1) \ …` · acceptance-sha256:d8bdc6ac1f35782876432c3eaa5a73b98e02ae406a9c0a64d97832653c5de0e9 · ms:2351 · test-lock-sha256:6df2025646ea7b36bfdbcee23dc6d0dc65f22f6d37be454a855a5160cce3b0cf · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZmFzdC1jaGVjay1oaW50LnRlc3QubWpzCWEgZGVwZW5kZW5jeSBpcyBhIGRlY2xhcmF0aW9uIG9mIHRoYXQgbmFtZSwgbm90IGEgbWVudGlvbgkwOTI5NGZlMzE1MzgyZGY5Nzk3YTUzOWZjMDViMDA2YTc2MzU1ODQ2YmExNTNhYjNmNjQyMzg2YmI2ZjQwZTUwCmJvZHkJdGVzdHMvZmFzdC1jaGVjay1oaW50LnRlc3QubWpzCWEgcnVubmVyJ3Mgb3duIGZhc3QgY2hlY2sgaXMgbmFtZWQgZnJvbSBpdHMgbWFuaWZlc3QJNTFkMmQ3ZmYwMmI3NzdjMzBiNjgwNjE4NzA2NzViZjU2ODI0YzNhOTdjNDlmNWY3MTgyNjliZDhjZjNiZGY2Mgpib2R5CXRlc3RzL2Zhc3QtY2hlY2staGludC50ZXN0Lm1qcwlhIHNsb3cgcGFzcyB3aXRoIG5vIGZhc3RDaGVjayBoZWFycyBpdCBvbmNlLCBhbmQgbm90aGluZyBlbHNlIGhlYXJzIGl0CWIwNzM3ZjZhZWM5YjllNjUwYmVlMWVjODRkMDY1NzEwZWY5MWJkZGE2ZWI4MGU4MDUzYjc1Mjg4MDFiZWJlZjYKYm9keQl0ZXN0cy9mYXN0LWNoZWNrLWhpbnQudGVzdC5tanMJb25seSBhIGRlcGVuZGVuY3kgcG9zaXRpb24gZGVjbGFyZXMgYSBkZXBlbmRlbmN5CWI4YjA3ZTUzMjY4OWYyM2JkNThkMWZkYzQyODYyZGRjYzU4OTBiODZlM2UyY2RmMzVmNmRkYWFiOTBiZThkOWEKYm9keQl0ZXN0cy9mYXN0LWNoZWNrLWhpbnQudGVzdC5tanMJdGhlIGhpbnQgc2F5cyB3aGF0IGEgZmFzdCBwYXNzIGlzLCBhbmQgd3JpdGVzIG5vdGhpbmcJYThlOTUwZjE5MjkyNjJjZmMzOTEwZmYwNjI5OThjNzg5MGE5N2M1MTRiMjFkZTM4M2NiY2I3ZWNiYzYzYmM1MA
  ```
  ```
- 2026-10-15 · f6665205* · exit 0 · `out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs 2>&1) \ …` · acceptance-sha256:d8bdc6ac1f35782876432c3eaa5a73b98e02ae406a9c0a64d97832653c5de0e9 · ms:2156
