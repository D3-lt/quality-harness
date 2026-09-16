# Task ADR-058-T4: A commit elsewhere does not arm this repository's advisory

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the foreign-repository early return in the commit branch`, `an unresolved target still advising`, `each named test actually running`, `the regression suites that pin the commit gate`

## Goal

The PreToolUse commit branch returns before advising when every commit or push segment resolves to a repository other than this one; a segment whose repository cannot be resolved still advises.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | the commit branch after `if (!isGitPublishCommand(command)) return` (line 4453), using the segment walk of `gitPublishTargetsThisProject` (line 878) with a three-way answer: this repository, another resolved repository, unresolved |

## Ordered Steps

1. [S1] Add the two tests with real assertions — two temp git repositories created by the test (CLAUDE.md §9), an Edit and no check in the first — and see them fail on an assertion (TDD red).
2. [S2] Return early only when at least one publish segment resolved and none resolved to this repository or stayed unresolved.
3. [S3] Run the fence green and record mutants: treat unresolved as foreign; drop the early return. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern "^(a commit in another repository does not arm this repository's commit advisory|a commit whose repository cannot be resolved still advises)$" tests/advice-accuracy.test.mjs 2>&1) \
  && for name in "a commit in another repository does not arm this repository's commit advisory" 'a commit whose repository cannot be resolved still advises'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/unread-advice.test.mjs tests/leftovers-after-adr053.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a commit in another repository does not arm this repository's commit advisory` | `tests/advice-accuracy.test.mjs` | with unverified edits in project A, PreToolUse `git -C <B> commit --allow-empty -m probe` is silent, and a `git commit` in A still advises | — | S1, S2 |
| `a commit whose repository cannot be resolved still advises` | `tests/advice-accuracy.test.mjs` | `git -C "$X" commit -m x` and `git -C <missing dir> commit -m x` still advise | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `handleHook`'s PreToolUse branch, driven by the tests; S3's mutants |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-058's Follow-up replay |

## Mutation Log

## Invariants

- Unresolved is never read as foreign (CLAUDE.md §16).
- The `rm -rf "$X" && git commit` early advisory above the transcript read is unchanged.

## Risks

- A symlinked path to this repository resolving as another; `gitRepositoryRoot` compares real roots, and the test names that shape only if it reproduces.

## Stop Condition

Stop and ask if `tests/unread-advice.test.mjs::PreToolUse commit advice still Advises after a foreign git -C commit` (tests/lifecycle.test.mjs) goes red — that test is about a LATER own commit and must keep passing.

## Out of Scope

- `git push` to a remote of another repository beyond the segment walk that already exists

## Verification Log
