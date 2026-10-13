# Task ADR-100-T2: `qh-check --commit` checks the staged tree and commits it in one call

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (the check runner, its gate wrapper, its help and the plugin README)
**Owner:** unassigned
**Produces:** `qh-check --commit [<git commit arguments>]`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a red check never reaches git`, `a working tree unlike the index is refused first`, `arguments and stdin reach git`

## Goal

One call runs the project's fast check (or its full check when none is declared) on a tree equal to the index and, only when
it passes, runs `git commit` with the caller's arguments and stdin.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-check.mjs` | edit | `--commit`: the index check before anything, the run as `--fast` does it, then `git commit` on exit 0 |
| `plugin/bin/qh-check` | edit | the docstring names `--commit` and its exit codes (what makes it discoverable) |
| `plugin/README.md` | edit | one line beside `qh-check` |
| `tests/qh-check-commit.test.mjs` | add | the four tests below |
| `tests/mutations/plugin/scripts/qh-check.mjs.json` | edit | entries for the refusal, the gate on the check's exit, and the pass-through |

## Ordered Steps

1. [S1] Write `tests/qh-check-commit.test.mjs` and run the Acceptance fence red. [proof: acceptance]
2. [S2] Before running anything: `git diff --quiet` (unstaged changes) and `git ls-files --others --exclude-standard` (untracked, not ignored); either non-empty refuses with exit 2, naming up to ten paths.
3. [S3] Run the check exactly as `qh-check --fast` does (the full check when no `fastCheck` is declared), recorded in the same ledger, its output printed.
4. [S4] On exit 0 only, spawn `git commit <arguments after --commit>` with stdin inherited; return git's exit code. On any other exit, return it and never spawn git.
5. [S5] The docstring and the README line. [proof: acceptance]
6. [S6] Catalogue entries for S2 to S4, killed. [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through)$')" = 4 \
  && node --test tests/qh-check.test.mjs tests/qh-check-reads-the-ledger.test.mjs tests/qh-check-shell.test.mjs \
  && grep -q -- '--commit' plugin/bin/qh-check
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `qh-check --commit commits the staged tree only after its check passes` | `tests/qh-check-commit.test.mjs` | a fixture repository with a passing `fastCheck` gets one commit, and the fast ledger one pass row | — | S3, S4 |
| `a red check never reaches git commit and its exit code is the check's` | `tests/qh-check-commit.test.mjs` | a check exiting 3 leaves HEAD unchanged and `qh-check` exits 3 | — | S4 |
| `qh-check --commit refuses a working tree that differs from the index before running anything` | `tests/qh-check-commit.test.mjs` | an unstaged edit and, separately, an untracked file each exit 2 with no ledger row; an ignored file does not refuse | — | S2 |
| `qh-check --commit passes its git arguments and stdin through` | `tests/qh-check-commit.test.mjs` | `--commit -F -` with a message on stdin commits that message | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | `qh-check.mjs`'s argument parser; a catalogue entry removes `--commit` from the accepted words |
| 3 — the caller can discover it | `qh-check --help`, `plugin/README.md` |
| 4 — it is used | the fast ledger's rows followed by a commit at the same tree; nothing measures this yet |

## Mutation Log

## Invariants

- `qh-check` without `--commit` behaves exactly as before (its locked tests stay byte-identical: 4 locks on `tests/qh-check.test.mjs`, 2026-10-13).
- No `git commit` is spawned unless the check exited 0 on a tree equal to the index.

## Risks

- git's own hooks (ADR-066's `prepare-commit-msg`) run inside the commit and judge the tree: the fast pass just recorded is what they read, so the commit goes through with ADR-081's advice.

## Stop Condition

Stop and ask if the publish hook refuses the commit `--commit` makes on a fast pass, or if a lock on an existing qh-check test would have to change.

## Out of Scope

- `git push` from the same command (a push needs the full check, ADR-081).

## Verification Log
