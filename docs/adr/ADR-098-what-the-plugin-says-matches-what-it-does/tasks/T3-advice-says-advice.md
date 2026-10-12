# Task ADR-098-T3: The ADR-ownership notice says nothing is blocked

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one printed sentence and four comments in three files, one new test file)
**Owner:** unassigned
**Produces:** the PostToolUse ADR-ownership notice without a block claim
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the notice says nothing is blocked`, `no shipped text claims the artifact gate blocks`, `the hook goldens are unchanged`

## Goal

The per-edit ADR-ownership notice, and every comment in its class, says what the code does: nothing is blocked, and the artifact pass
looks again at a publish request, at turn end and at session end.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/facts-gate-dispatch.sh` | edit | `:354` "It blocks at commit and completion." becomes "Nothing is blocked; the artifact pass checks it again at the next publish, turn end or session end."; `:3` and `:13` say the dispatcher reports and refuses nothing |
| `plugin/scripts/run-shell-hook.mjs` | edit | `:380-384` comment: "reports at the edit and again at the boundary" |
| `plugin/scripts/artifact-pass.mjs` | edit | `:69-70` "Running out of window is itself a blocking failure" becomes what `budgetExhausted` makes of it (said as UNRUN, ADR-005) |
| `tests/advice-says-advice.test.mjs` | add | the two tests below |
| `tests/mutations/plugin/scripts/facts-gate-dispatch.sh.json` | edit | one entry for `the notice says nothing is blocked`; the existing `:49` entry targets the `:458` printf and stays unique |
| `tests/goldens/*.json` | read | `grep -c "blocks at commit" tests/goldens/*.json` printed 0 for every file on 2026-10-12: no golden is expected to move, and S3 confirms it |

## Ordered Steps

1. [S1] Write the two tests of the Tests table in `tests/advice-says-advice.test.mjs` and record the red run with `adr-verify` (TDD red).
2. [S2] Change the sentence at `:354` and the four comments.
3. [S3] Run `node --test tests/hook-goldens.test.mjs` and confirm no golden moved. [proof: acceptance]
4. [S4] Re-run the two class commands in the parent record's Context and put both commands and counts in the sign-off. [proof: human: no member is left and the three non-members are unchanged]
5. [S5] Record one killed mutant per `Rests-on` name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/advice-says-advice.test.mjs tests/hook-goldens.test.mjs tests/gates.test.mjs 2>&1) \
  && for t in 'the ADR-ownership notice says nothing is blocked' 'no shipped text claims the artifact gate blocks'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the ADR-ownership notice says nothing is blocked` | `tests/advice-says-advice.test.mjs` | the dispatcher at boundary `PostToolUse` on a task file with no owning ADR prints the ownership notice, which holds "Nothing is blocked" and no other `block` verb | none | S1, S2 |
| `no shipped text claims the artifact gate blocks` | `tests/advice-says-advice.test.mjs` | over `git ls-files plugin/scripts`, no line matches `It blocks at`, `blocks final completion`, `still blocks`, `blocks at the boundary` or `is itself a blocking`; a fixture line holding one of them is reported (the dirty twin) | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the first test |
| 2 — something selects it | `run-shell-hook.mjs:386-394` wraps this stdout as `additionalContext` at PostToolUse |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- What the dispatcher judges, its exit codes, and the `:458` notice are unchanged; only words change.
- `tests/gates.test.mjs:572` ("spec-verify --draft is not satisfied yet for") still passes; `python3 scripts/test-locks.py tests/gates.test.mjs` names locks from ADR-091 T3 and no locked body is edited. Relock cost: zero.

## Risks

- A golden holds the old sentence after all: S3 shows it; then the golden is regenerated with `QH_GOLDEN_UPDATE=1` and the diff read line by line.

## Stop Condition

Stop and ask if the ADR-ownership path turns out to deny anywhere (a `deny` reachable from rule A), since the sentence would then be true.

## Out of Scope

- adr-lint's own "blocking" vocabulary (`adr-lint:3566`, `:4989`): it names adr-lint's exit status, CLAUDE.md §3's `errors.append`

## Verification Log
