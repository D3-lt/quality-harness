# Task ADR-120-T11: A check that cannot start here continues no turn

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** a startability probe in the turn end
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A declared check whose program cannot be found on this machine's PATH (or whose script file is absent) continues no turn; its finding reaches the user once, naming the program.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/turn-end-declared.test.mjs` | edit | new tests beside T6's (0 locks on the new ones; T6's are locked by its own task and stay byte-identical) |
| `plugin/scripts/completion-rules.mjs` | edit | R1 and R2 read whether the declared check's first program resolves (`command -v`-equivalent over PATH, or the named script file exists); one that does not routes to the user, as T6 does for an inferred check. The class, from `mrw read --grep 'unstarted|could not start|validationVerdict|checkEventName' plugin/scripts/ core/hooks/`: `check-record.mjs:18-25` and `check-ledger.mjs:165-183` classify a run's outcome after it ran and are retained; `completion-rules.mjs:208-243` and `:544-546` say a run that did not start and are retained; only the turn end's decision to continue changes |
| `core/hooks/turnend.go` | edit | the same |
| `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a declared `bash scripts/missing.sh` (file absent) and a declared `nosuchtool test` do not continue the turn and tell the user once; a declared `node --test` continues as today; a declared `npm test` with `npm` on PATH continues.
2. [S2] Probe once per session and tree, without running the check; reuse T6's user routing.
3. [S3] Port to Go.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/turn-end-declared.test.mjs 2>&1) \
  && for n in "a declared check that cannot start continues no turn and is said to the user once" \
      "a declared check that can start continues as before"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a declared check that cannot start continues no turn and is said to the user once` | `tests/turn-end-declared.test.mjs` | the probe | — | S1, S2, S3 |
| `a declared check that can start continues as before` | `tests/turn-end-declared.test.mjs` | the twin | — | S1, S2 |

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

- A program present but broken still continues once: the probe proves only that it can start.

## Stop Condition

Stop if resolving the program needs to run the project's shell setup (an `nvm`-style PATH): the probe would then be a guess.

## Out of Scope

- Probing whether the tests' own dependencies are installed (permanent: boundary: that is the check's run, not its start; only running it can say)

## Verification Log
