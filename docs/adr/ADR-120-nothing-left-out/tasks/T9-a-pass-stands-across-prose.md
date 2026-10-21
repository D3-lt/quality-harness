# Task ADR-120-T9: A pass stands across a prose-only change, for every reader

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the prose-aware pass in `checkStanding` and its Go twin; the prose advisory
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A pass on tree X stands for a later tree Y whenever the only paths that differ are the project's declared `prose`, for the publish verdict, the turn end, git's hook and the Go core alike, so a markdown-only commit after a passing check costs nothing; on a prose-only unchecked diff with no `prose` declared, the advisory names the setting once.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/prose-pass.test.mjs` | create | the rows below (0 locks: new) |
| `plugin/scripts/check-ledger.mjs` | edit | `checkEventsFor` (:422-425) and `checkStanding` (:512-522) accept a pass whose `after.codeTree` equals the current one under the same prose list; the prose list travels with the observation |
| `plugin/scripts/tree-facts.mjs` | edit | the session's observation computes `codeTree` (the `without` option, :115-118, :157-160) when `prose` is declared |
| `core/hooks/ledger.go` | edit | the prose branch `passedAlready` lacks (:174-186), and the same standing rule |
| `plugin/scripts/publish-verdict.mjs` | edit | the advisory sentence naming `prose` for a prose-only unchecked diff, once per tree |
| `tests/mutations/plugin/scripts/check-ledger.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: with `"prose": ["docs/**", "**/*.md"]`, a pass on X then an edit to `docs/a.md` leaves the publish verdict allowing a commit and R1 silent, in Node and Go; an edit to `src/a.mjs` refuses and speaks; a prose list that changed since the pass does not carry it; with no `prose` declared, a markdown-only diff is refused as today and the advisory names `prose` once; an unobservable write after the pass still vetoes it.
2. [S2] Carry the declared prose list and `codeTree` in the session observation, and let `checkStanding` read a pass on the same `codeTree` under the same list.
3. [S3] Port the standing rule and `passedAlready`'s prose branch to Go.
4. [S4] Add the advisory sentence and its once-per-tree key.
5. [S5] Record a killed mutant per mechanism, with catalogue entries, and run `node scripts/mutate.mjs --case 'ADR-120 T9' --no-cache`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \
  && for n in "a pass stands across a prose-only change for every reader" \
      "a code change, a changed prose list or an unseen write ends the carry-over" \
      "a prose-only unchecked diff with no prose declared names the setting once"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a pass stands across a prose-only change for every reader` | `tests/prose-pass.test.mjs` | the publish verdict and the turn end, Node and Go | — | S1, S2, S3 |
| `a code change, a changed prose list or an unseen write ends the carry-over` | `tests/prose-pass.test.mjs` | the twins | — | S1, S2 |
| `a prose-only unchecked diff with no prose declared names the setting once` | `tests/prose-pass.test.mjs` | the advisory | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A path listed as prose that a test reads (this repository's own docs) carries a pass it should not: `prose` stays opt-in, and the advisory says it is the project's claim that nothing the check reads lives there.

## Stop Condition

Stop if a reader outside these four judges a tree by its pass: it joins the class first.

## Out of Scope

- Inferring inputs from a language's dependency graph (permanent: boundary: the owner chose the declared form on 2026-10-21; an inferred input set is a classifier that needs its own record)

## Verification Log
