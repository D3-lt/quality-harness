# Task ADR-120-T12: A commit into another repository by a relative path is judged there

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `foreignCommitPath` accepting a relative literal and `cd <path>;`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`git -C ../b commit`, `cd ../b && git commit` and `cd ../b; git commit` are judged by repository b's state, as their absolute forms already are, instead of the session's repository.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/foreign-relative.test.mjs` | create | the rows below (0 locks: new) |
| `plugin/scripts/publish-command.mjs` | edit | `foreignCommitPath` (:172-204) resolves a relative literal path (no `$`, glob or `~`) against the command's cwd, and accepts `;` after the `cd` |
| `core/hooks/publishcmd.go` | edit | the same (:267) |
| `tests/mutations/plugin/scripts/publish-command.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run, with two real repositories a and b in a temporary directory and the session in a: each relative form is advised as foreign; a relative path that resolves into a itself is judged as a; `cd $X && git commit` and `cd ~/b && git commit` stay not proven; `cd ../b && make && git commit` stays not proven.
2. [S2] Resolve the relative literal and accept `;`, in Node and Go.
3. [S3] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \
  && for n in "a commit into another repository by a relative path is judged there" \
      "a path that resolves home, or is not a literal, is not proven foreign"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a commit into another repository by a relative path is judged there` | `tests/foreign-relative.test.mjs` | the relative forms | — | S1, S2 |
| `a path that resolves home, or is not a literal, is not proven foreign` | `tests/foreign-relative.test.mjs` | the twins | — | S1, S2 |

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

- A relative path resolved against the wrong cwd: the hook's payload `cwd` is the base, and a preceding `cd` in the same command is a twin that stays not proven.

## Stop Condition

Stop if the host's payload `cwd` can differ from the shell's cwd at the command (a `cd` earlier in the session): measure before encoding.

## Out of Scope

- Judging a commit into b by b's own ledger at PreToolUse (permanent: boundary: git's hook judges b at the event, ADR-066; PreToolUse advises)

## Verification Log
