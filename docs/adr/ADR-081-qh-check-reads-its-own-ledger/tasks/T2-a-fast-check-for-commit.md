# Task ADR-081-T2: A declared fast check lets a commit through and never a push

**Depends-on:** T1
**Covers:** F-8, F-9, F-10, F-11, F-12, F-13, F-14, UC2-S1, UC2-S2, UC2-S3, UC2-S4, UC2-S5, UC2-S6, UC2-S7
**Estimated scope:** M (qh-check, the publish verdict, git's hook, seven tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** `qh-check`'s option parsing (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a fast record is kept apart`, `only a proven commit is exempt`, `the latest fast record decides`, `git's hook says the advisory`, `the key carries the fast state`

## Goal

`qh-check --fast` records a declared `fastCheck` in `fast-checks.jsonl`; `publishVerdict` advises rather than refuses a command proven to be one commit on a tree whose latest fast record passed, git's commit hook says so, and everything else is refused as before (ADR-081 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-check.mjs` | edit | `--fast`; the fast record's file; exit 2 when none is declared |
| `plugin/scripts/lifecycle.mjs` | edit | `fastCheck` resolution; the fast-pass reading; the commit-only proof; the exemption and its key in `publishVerdict` |
| `plugin/scripts/publish-hook.mjs` | edit | return the advisory's text with code 0 |
| `plugin/bin/qh-check` | edit | its usage names `--fast` |
| `CLAUDE.md` | edit | §3's description of ADR-061's refusal gains the commit exemption |
| `tests/qh-check-reads-the-ledger.test.mjs` | edit | remove `todo` from this task's seven tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the seven tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Resolve `fastCheck` as `check` is resolved; `--fast` with none says so and exits 2; a fast run appends to `fast-checks.jsonl` only.
3. [S3] Read the latest fast record for the tree, graded by `checkEventName`; prove a command is one commit (one simple git command, subcommand commit, nothing beside it); git's `prepare-commit-msg` is one commit by construction.
4. [S4] In `publishVerdict`, when the tree has no full pass, its latest fast record passed and the command is proven one commit, return the advisory instead of the refusal; carry the fast record count in its key.
5. [S5] `runPublishHook` returns the advisory's text with code 0; update CLAUDE.md §3 and the usage text.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/qh-check-reads-the-ledger.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE "ok [0-9]+ - (a fast check is recorded apart, where no full-check reader looks|a commit-only command on a fast-passed tree is told, not refused|a commit with no fast pass, or a failed one, is still refused|a push, or a commit that also pushes, is refused on a fast-passed tree|git's own hooks let a commit through with the warning and refuse a push|a commit refused before a fast pass is told after it|--fast with no fastCheck declared is said, and runs nothing)" "$T")" -eq 7
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a fast check is recorded apart, where no full-check reader looks` | `tests/qh-check-reads-the-ledger.test.mjs` | `fast-checks.jsonl` holds it; `checks.jsonl` does not exist | F-8, UC2-S1 | S2 |
| `a commit-only command on a fast-passed tree is told, not refused` | `tests/qh-check-reads-the-ledger.test.mjs` | no deny; the full check named | F-9, UC2-S2 | S4 |
| `a commit with no fast pass, or a failed one, is still refused` | `tests/qh-check-reads-the-ledger.test.mjs` | deny twice | F-10, UC2-S3 | S3, S4 |
| `a push, or a commit that also pushes, is refused on a fast-passed tree` | `tests/qh-check-reads-the-ledger.test.mjs` | deny twice | F-11, UC2-S4 | S3 |
| `git's own hooks let a commit through with the warning and refuse a push` | `tests/qh-check-reads-the-ledger.test.mjs` | code 0 with the advisory; code 1 | F-12, UC2-S5 | S5 |
| `a commit refused before a fast pass is told after it` | `tests/qh-check-reads-the-ledger.test.mjs` | deny, then the advisory | F-13, UC2-S6 | S4 |
| `--fast with no fastCheck declared is said, and runs nothing` | `tests/qh-check-reads-the-ledger.test.mjs` | exit 2, nothing ran | F-14, UC2-S7 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seven tests |
| 2 — something selects it | `qh-check --fast`, `publishVerdict`, `runPublishHook` |
| 3 — the caller can discover it | the usage text and the commit advisory |
| 4 — it is used | a project that declares `fastCheck` |

## Mutation Log

## Invariants

- No reader of `checks.jsonl` or of `check.*` events sees a fast record.
- A push, any unproven form, and every reader of a full pass read as before.

## Risks

- The commit-only proof refuses more than it must (a commit spelled through an alias); that is the safe direction for a relaxation, and the refusal says why.

## Stop Condition

Stop and ask if a fast pass would have to count anywhere but a proven commit.

## Out of Scope

- `checkInputs` reuse (BACKLOG §331).

## Verification Log
