# Task ADR-127-T2: escapes.mjs reverses each fix in a fresh worktree and says how its own tests respond

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `node scripts/escapes.mjs` and its report
**Consumes:** the escape entry schema and the README classification (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Per entry, under the heavy-run lease, in a fresh worktree of the working tree: require each named test to be reported passing,
reverse the fix's commits newest first (all or none, limited to the entry's paths), run the named tests again, and report
SENSITIVE, INSENSITIVE or UNPROVEN with its reason; write a report bound to the sha, platform, catalogue digest and selection.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/escapes-replay.test.mjs` | create | the verdicts over a scratch repository (0 locks: new) |
| `scripts/escapes.mjs` | create | the replay |
| `tests/mutations/scripts/escapes.mjs.json` | create | the replay's mutants |

## Ordered Steps

1. [S1] Write the failing tests and record the red run, over a scratch repository: a fix whose test fails when it is reversed
   (SENSITIVE); one whose test was later weakened (INSENSITIVE); a fix in two commits, reversed newest first; and UNPROVEN for a
   reverse diff that does not apply (and the worktree left as built), a red baseline, a named test that is not reported or is
   skipped, a runner that does not start, `fix: null`, a platform the entry excludes, and an exhausted budget; the summary
   line counts each; the report names the sha, platform, catalogue digest and `full` or `partial`; the checkout is untouched
   and no entry's reversal reaches the next.
2. [S2] Build `escapes.mjs` from `plugin/scripts/worktree.mjs` and `plugin/scripts/lease.mjs` as `mutate.mjs` uses them, and
   `scripts/inverse-hunks.mjs`'s handling of a hunk that does not apply: `git apply -R` of `git show <fix> -- <paths>` per
   commit, newest first, rolled back if any fails; named tests read from TAP output; every child bounded and hidden (CLAUDE.md
   §7); the budget from `QUALITY_HARNESS_ESCAPES_BUDGET_S`.
3. [S3] Record killed mutants, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/escapes-replay.test.mjs 2>&1) \
  && for n in "a reversed fix its tests notice is SENSITIVE, one they do not is INSENSITIVE, and two commits reverse newest first" "anything not observed is UNPROVEN with its reason, and the checkout and the next entry are untouched" "the report names its sha, platform, catalogue digest and selection"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a reversed fix its tests notice is SENSITIVE, one they do not is INSENSITIVE, and two commits reverse newest first` | `tests/escapes-replay.test.mjs` | the two observed verdicts and the order | — | S1, S2 |
| `anything not observed is UNPROVEN with its reason, and the checkout and the next entry are untouched` | `tests/escapes-replay.test.mjs` | ADR-005 for every could-not-look, and isolation | — | S1, S2 |
| `the report names its sha, platform, catalogue digest and selection` | `tests/escapes-replay.test.mjs` | the report's identity | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `node scripts/escapes.mjs`, and T3's job |
| 3 — the caller can discover it | its usage line and CLAUDE.md §2's command list (T3) |
| 4 — it is used | the land job (T3) |

## Mutation Log

## Invariants

- UNPROVEN is never counted as SENSITIVE.
- The checkout's working tree and index are byte-identical after a run.

## Risks

- A fix that changed a test as well as the code: only the entry's paths are reversed, so the test stays as it is now.
- Doubles: the scratch repository stands for this one; the real catalogue runs in T3's job.

## Stop Condition

Stop if a reverse diff can only be applied by hand: that entry is UNPROVEN with the reason.

## Out of Scope

- Reproductions for INSENSITIVE entries (deferred: docs/BACKLOG.md §415).

## Verification Log
