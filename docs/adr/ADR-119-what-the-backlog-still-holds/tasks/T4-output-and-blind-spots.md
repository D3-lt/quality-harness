# Task ADR-119-T4: Wrong output and the gates' own blind spots

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic, except S7's measurement of the listing, taken on a fresh repository with the plugin installed
**Proof map:** v1

## Goal

Six items of BACKLOG §381 close: a node JSON error is placed (16), the dead-code scan survives an empty list (20) and sees
unreachable code (21), a contract test reads the plugin as git lists it (22), two post-edit tests skip without `jq` (18),
and the listing figure is re-measured (24).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/post-edit-check.test.mjs` | edit | :561-563 of the unlocked `a JSON finding from node names the file's line and column` change from unplaced to placed; :388-389 and :416 skip through `required('jq', reason)`, in `JSONC is read as TypeScript reads it` and `a comma with no value before it is not a trailing comma`, each locked by ADR-102 T5 through T15 (11 owners each, `python3 scripts/test-locks.py`, 2026-10-20) |
| `plugin/scripts/post-edit-check.sh` | edit | :123 finds the first bad token in the masked text and appends `(line L column C)` when node gave none |
| `tests/dead-code-scan.test.mjs` | add | the script's first test |
| `scripts/dead-code-scan.sh` | edit | :48 under the `-gt 0` guard from `unused-names.sh:92`, and UNRUN for an empty list |
| `tests/unused-names.test.mjs` | edit | a dirty fixture and a clean twin for unreachable code (0 locks) |
| `scripts/unused-names.sh` | edit | :107 adds `--only=correctness/noUnreachable` |
| `tests/review-contract.test.mjs` | edit | :72-73, :109, :145, :159-160 read `git ls-files -z --cached --others --exclude-standard` (CLAUDE.md §8); a relock under ADR-098 T2 with the reason recorded |
| `.claude/rules/19-adopter-footprint.md` | edit | :26, the listing figure with its method, date and sha |
| `tests/mutations/plugin/scripts/post-edit-check.sh.json`, `tests/mutations/scripts/unused-names.sh.json`, `tests/mutations/scripts/dead-code-scan.sh.json` | edit, edit, add | one catalogue entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: `{"a": tru}` placed at its first bad token; a message that already has a position gets no second one (:554-556); `dead-code-scan.sh` with no Python file prints UNRUN and does not abort under `set -u`; an unreachable statement after `return` is a finding, and its twin with none is clean. Run `scripts/test-locks.py` on each test file first.
2. [S2] In `post-edit-check.sh:123`, when node's message carries no position, find the first bad token in the masked text (masking keeps offsets) and append `(line L column C)`.
3. [S3] In `dead-code-scan.sh`, guard :48 with `[ "${#files[@]}" -gt 0 ]` and print UNRUN for an empty list.
4. [S4] Add `--only=correctness/noUnreachable` to biome at `unused-names.sh:107`.
5. [S5] Switch `tests/review-contract.test.mjs` to the git listing at its five sites, relocking ADR-098 T2's tests with `adr-verify --relock` and the reason (CLAUDE.md §8: a disk read answers for this machine only).
6. [S6] Use `required('jq', reason)` from `tests/helpers/require.mjs` for the two jq assertions. Before the edit, run `python3 scripts/test-locks.py tests/post-edit-check.test.mjs '<test name>'` for both tests and relock every owner it returns, with the reason; on 2026-10-20 that was ADR-102 T5 through T15 for each. The uvx half of §381 item 18 stays red where uvx is absent, by the owner's rule.
7. [S7] Re-measure the listing in `.claude/rules/19-adopter-footprint.md:26` and write the method, the date and the sha beside it. The re-check's sum, 2026-10-20 at 14bc3430, was skills 5,475 + agents 1,012 + workflows 1,505 characters. [proof: human: the owner reads the figure against the method written beside it]
8. [S8] Record a killed mutant for the position finder, the empty-list guard and the unreachable rule, with a catalogue entry each. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs tests/dead-code-scan.test.mjs tests/unused-names.test.mjs tests/review-contract.test.mjs 2>&1) \
  && for n in "a JSON finding from node names the file's line and column" \
      "an empty list is UNRUN under set -u, not an unbound-variable abort" \
      "an unreachable statement is a finding, and its clean twin is not" \
      "JSONC is read as TypeScript reads it" \
      "a comma with no value before it is not a trailing comma" \
      "the blocking criteria have one definition and every mirror is its text"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a JSON finding from node names the file's line and column` | `tests/post-edit-check.test.mjs` | `{"a": tru}` is placed; an existing position is not doubled | — | S1, S2 |
| `an empty list is UNRUN under set -u, not an unbound-variable abort` | `tests/dead-code-scan.test.mjs` | the guard and the UNRUN line, through the real script under bash | — | S1, S3 |
| `an unreachable statement is a finding, and its clean twin is not` | `tests/unused-names.test.mjs` | the biome rule is on, through the real script | — | S1, S4 |
| `JSONC is read as TypeScript reads it` | `tests/post-edit-check.test.mjs` | the relocked jq assertions skip with their reason where jq is absent | — | S6 |
| `a comma with no value before it is not a trailing comma` | `tests/post-edit-check.test.mjs` | the same, for :416 | — | S6 |
| `the blocking criteria have one definition and every mirror is its text` | `tests/review-contract.test.mjs` | the holders are read from the git listing | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | the PostToolUse hook runs `post-edit-check.sh`; `scripts/selftest.sh` runs `unused-names.sh`; the release runs `dead-code-scan.sh` |
| 3 — the caller can discover it | the finding's own text |
| 4 — it is used | every JSON edit, every gate, every release |

## Mutation Log

## Invariants

- A message that already carries a position is printed as before, and the `path: ` form stays (ADR-102 T14).
- A relocked test keeps every assertion it had, only reached by a different listing or a skip with a reason.

## Risks

- `noUnreachable` may flag a deliberate `throw` after an exhaustive switch in `plugin/`. Each finding is fixed or wired, never allow-listed, by the owner's rule.

## Stop Condition

Stop if biome's pinned version has no `correctness/noUnreachable`: the rule would need a version bump, which is its own change.

## Out of Scope

- The uvx half of §381 item 18 (permanent: boundary: the owner's rule is that a missing linter is UNRUN and red, never a skip)

## Verification Log
