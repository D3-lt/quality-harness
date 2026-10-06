# Task ADR-085-T2: a Go setup failure or a TAP parse error is not a kill

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one row added, one row widened, four tests)
**Owner:** unassigned
**Produces:** the `[setup failed]` row and the tap-prefixed `SyntaxError` row of `BUILD_BROKE`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the Go setup-failed row`, `the tap-prefixed SyntaxError row`, `the SyntaxError row ignores an indented line`

## Goal

`adr-verify --mutant` grades a Go `[setup failed]` package and a Node parse error printed behind TAP's
`# ` `inconclusive`, where it grades both `killed` today (ADR-085 Context), while a SyntaxError quoted
inside a failing assertion stays a kill.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | add `r"^FAIL\s+\S+ \[setup failed\]"`; widen `r"^SyntaxError:"` to `r"^(?:# )?SyntaxError:"`; the arm at `:1824` selects both |
| `tests/evidence-chain.test.mjs` | edit | four new tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write the four new tests in this task's Tests table and record the red run (TDD red), driving `adr-verify --mutant` through `runWith` with the measured bytes as in T1, absolute paths replaced. Red today: the setup-failed and tap tests grade `killed`.
2. [S2] Add the `[setup failed]` row.
3. [S3] Widen the `SyntaxError` row to accept TAP's `# ` prefix.
4. [S4] Record one killed mutant per Rests-on name — remove the setup row, drop the `# ` prefix, and let the SyntaxError row accept leading spaces — and add the three to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/evidence-chain.test.mjs 2>&1) \
  && for t in 'a Go setup failure is inconclusive, not a kill' 'a TAP-prefixed SyntaxError is inconclusive, not a kill' 'a SyntaxError quoted inside a failing assertion is still a kill' 'a coloured build error is inconclusive, not a kill'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a Go setup failure is inconclusive, not a kill` | `tests/evidence-chain.test.mjs` | the import-cycle and missing-import bytes each grade `mutant inconclusive` | none | S1, S2 |
| `a TAP-prefixed SyntaxError is inconclusive, not a kill` | `tests/evidence-chain.test.mjs` | the tap top-level and imported-module parse errors grade `mutant inconclusive` | none | S1, S3 |
| `a SyntaxError quoted inside a failing assertion is still a kill` | `tests/evidence-chain.test.mjs` | node's indented captured SyntaxError (spec, tap) and pytest's `E         SyntaxError` grade `mutant killed` — the twin | none | S1, S3 |
| `a coloured build error is inconclusive, not a kill` | `tests/evidence-chain.test.mjs` | the existing coloured-Python case still holds after the widening | none | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three new tests |
| 2 — something selects it | the arm at `adr-verify:1824`; removing either row turns its test red |
| 3 — the caller can discover it | n/a: no declared interface — the verdict is the Mutation Log row |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- A diagnostic indented inside a failing assertion never matches the widened row.
- A tap-prefixed match only ever moves a grade toward `inconclusive`.

## Risks

- A test's own TAP diagnostic that quotes a SyntaxError grades `inconclusive`: the safe direction, and named in ADR-085 Risks.

## Stop Condition

Stop and ask if the import-cycle or missing-import bytes differ from ADR-085 Context on the Go the
tests are written against, or if the widened row matches any indented line.

## Out of Scope

- pytest's collection-error `E   SyntaxError`, which ADR-085 leaves named and unreachable through a mutated `.py`.

## Verification Log
