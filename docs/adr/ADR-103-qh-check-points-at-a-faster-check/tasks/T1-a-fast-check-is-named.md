# Task ADR-103-T1: a fast check is named where the runner offers one that can pass

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (a measurement over three runners, one module, one call site, one test file)
**Owner:** unassigned
**Produces:** `fastCheckHint(root)` and `FAST_CHECK_HINT` in `plugin/scripts/fast-check-hint.mjs`
**Consumes:** none
**Data dependency:** S2 needs real runners (`vitest`, `jest`, `pytest-testmon`) installed in scratch fixtures, measured once and
recorded in this task's sign-off; the Acceptance fence is hermetic (fixture manifests and stub runners)
**Proof map:** v1

## Goal

After a passing full run that took `proseHintMs` or more, in a project with no `fastCheck` declared, `qh-check` says once per
repository within `firstMentionHere`'s window which fast check its own runner offers, naming only a command measured to yield a
pass through `qh-check` (ADR-103, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/fast-check-hint.mjs` | create | `fastCheckHint(root)`: the runner read from `package.json` (`dependencies`, `devDependencies`; vitest before jest), `pyproject.toml`, `requirements*.txt`; `FAST_CHECK_HINT`, worded on ADR-081 and ADR-100 |
| `plugin/scripts/qh-check.mjs` | edit | the call after a recorded pass, beside the prose hint: every other condition first, `firstMentionHere` last |
| `tests/fast-check-hint.test.mjs` | create | the tests below |
| `tests/mutations/plugin/scripts/fast-check-hint.mjs.json` | create | entries on the runner reading |
| `tests/mutations/plugin/scripts/qh-check.mjs.json` | edit | entries on the call site's conditions |

## Ordered Steps

1. [S1] Add the tests below and record the red run (TDD red: the module does not exist, and `qh-check` says no hint).
2. [S2] Measure each candidate (CLAUDE.md §16): in a scratch fixture per runner, declare the candidate as `fastCheck` and run
   `qh-check --fast` twice — after a change a test covers, and after one no test covers. Name only a candidate that yields
   `check.passed` both times; record the commands, versions and verdicts in the sign-off. [proof: human: real runners, outside the hermetic fence]
3. [S3] Write `fastCheckHint` and `FAST_CHECK_HINT` from S2's survivors; a runner with none draws the plain lever.
4. [S4] Call it from `qh-check.mjs` after a passing full run past `proseHintMs`, only with no `fastCheck` declared; `firstMentionHere`
   is evaluated last, so a run that is not said the hint never burns it.
5. [S5] Record killed mutants: the `fastCheck` condition, the duration condition, and the order of `firstMentionHere`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - (a runner's own fast check is named from its manifest|a slow pass with no fastCheck hears it once, and nothing else hears it|the hint says what a fast pass is, and writes nothing)")" = 3 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a runner's own fast check is named from its manifest` | `tests/fast-check-hint.test.mjs` | each measured runner names its command and the file read; vitest wins over jest; only `dependencies`/`devDependencies` count; an unknown runner draws the plain lever | — | S1, S3 |
| `a slow pass with no fastCheck hears it once, and nothing else hears it` | `tests/fast-check-hint.test.mjs` | through `qh-check`: a failing run, then a passing one, says it on the passing one; a second pass does not; a pass under `QUALITY_HARNESS_PROSE_HINT_MS` does not; a project declaring `fastCheck` never does | — | S1, S4 |
| `the hint says what a fast pass is, and writes nothing` | `tests/fast-check-hint.test.mjs` | the text says `qh-check --commit` runs the fast check and a push needs the full one; `.quality-harness.json` is byte-identical after the run | — | S1, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `fastCheckHint` |
| 2 — something selects it | `qh-check.mjs`'s run path |
| 3 — the caller can discover it | it is said on stderr after the run |
| 4 — it is used | the outside runs in ADR-103's Follow-ups |

## Mutation Log
- 2026-10-15 · 7c1ff0b2* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a project that already declares a fastCheck would be told to declare one · acceptance-sha256:d1ac0c0caa5676e4058ee1fa004cac0a29767d0393cb9edb9acf4c303fad9b1e

## Invariants

- No verdict, exit code or ledger record changes (ADR-005, ADR-081); the prose hint is unchanged (ADR-094 T3).

## Risks

- A monorepo's runner lives below the root: the hint reads the root's manifests only and says which file it read.

## Stop Condition

Stop and ask if no candidate can yield `check.passed` through `qh-check` on a change no test covers; the task then names no command.

## Out of Scope

- Writing the declaration (permanent: boundary: which tests may stand in for the suite is the owner's call, ADR-103)

## Verification Log
- 2026-10-15 · 7c1ff0b2* · exit 1 · `out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs 2>&1) \ …` · acceptance-sha256:d1ac0c0caa5676e4058ee1fa004cac0a29767d0393cb9edb9acf4c303fad9b1e · ms:232 · test-lock-sha256:0a1dbe0cbcb103b430cc2cbc8f3146a0f060ffab31658c6a1f22452ac09e546f · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZmFzdC1jaGVjay1oaW50LnRlc3QubWpzCWEgcnVubmVyJ3Mgb3duIGZhc3QgY2hlY2sgaXMgbmFtZWQgZnJvbSBpdHMgbWFuaWZlc3QJNTFkMmQ3ZmYwMmI3NzdjMzBiNjgwNjE4NzA2NzViZjU2ODI0YzNhOTdjNDlmNWY3MTgyNjliZDhjZjNiZGY2Mgpib2R5CXRlc3RzL2Zhc3QtY2hlY2staGludC50ZXN0Lm1qcwlhIHNsb3cgcGFzcyB3aXRoIG5vIGZhc3RDaGVjayBoZWFycyBpdCBvbmNlLCBhbmQgbm90aGluZyBlbHNlIGhlYXJzIGl0CWIwNzM3ZjZhZWM5YjllNjUwYmVlMWVjODRkMDY1NzEwZWY5MWJkZGE2ZWI4MGU4MDUzYjc1Mjg4MDFiZWJlZjYKYm9keQl0ZXN0cy9mYXN0LWNoZWNrLWhpbnQudGVzdC5tanMJdGhlIGhpbnQgc2F5cyB3aGF0IGEgZmFzdCBwYXNzIGlzLCBhbmQgd3JpdGVzIG5vdGhpbmcJYThlOTUwZjE5MjkyNjJjZmMzOTEwZmYwNjI5OThjNzg5MGE5N2M1MTRiMjFkZTM4M2NiY2I3ZWNiYzYzYmM1MA
  ```
  ```
- 2026-10-15 · 7c1ff0b2* · exit 0 · `out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs 2>&1) \ …` · acceptance-sha256:d1ac0c0caa5676e4058ee1fa004cac0a29767d0393cb9edb9acf4c303fad9b1e · ms:2115
- 2026-10-15 · human-observed · observed 2026-10-15, S2 measured through qh-check --fast in scratch fixtures (change a test covers, then one none covers): vitest 5.0.4 'npx vitest run --changed' check.passed both; jest 30.5.2 'npx jest --onlyChanged' passed then no-work ('No tests found related to files changed since last commit'), with or without --passWithNoTests, so jest is not named; pytest 9.1.1 + pytest-testmon 2.2.0 'pytest --testmon' check.passed both with .testmondata* in .gitignore, and not a pass without it (the tree changed under the run)
