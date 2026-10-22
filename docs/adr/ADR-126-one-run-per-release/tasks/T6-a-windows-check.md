# Task ADR-126-T6: land names the Windows check once land/<sha> is pushed

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the Windows check line
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

After `git push origin <sha>:refs/heads/land/<sha>` succeeds, `land.mjs` logs one line with the commands a Windows peer runs at
that sha (`git clone -c core.longpaths=true`, fetch the branch, `bash scripts/selftest.sh`), before it waits.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/windows-check.test.mjs` | create | the case (0 locks: new) |
| `scripts/land.mjs` | edit | after the staged push (:144-145) |
| `CLAUDE.md` | edit | §13: ask a Windows peer on a landing that changes a test or a reader |

## Ordered Steps

1. [S1] Write the failing test and record the red run: the line appears after the staged push and before the wait, names the
   full sha, and does not appear on a dry run or when the push failed.
2. [S2] Log it; add the sentence to §13.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/windows-check.test.mjs 2>&1) \
  && for n in "land names the Windows check once land/<sha> is pushed, and only then"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `land names the Windows check once land/<sha> is pushed, and only then` | `tests/windows-check.test.mjs` | the line | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new test |
| 2 — something selects it | `land()` after the staged push |
| 3 — the caller can discover it | the line in its output |
| 4 — it is used | every landing |

## Mutation Log

## Invariants

- land's exit codes and pushes are unchanged.

## Risks

- None beyond a longer log.

## Stop Condition

Stop if the line would carry anything personal (§6): it names the public remote and the sha only.

## Out of Scope

- Sending the message (permanent: boundary: a script cannot reach another session).

## Verification Log
