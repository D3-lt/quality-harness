# Task ADR-060-T7: The command classifiers are deleted

**Depends-on:** T6
**Covers:** none — no spec
**Estimated scope:** L (cross-boundary)
**Owner:** unassigned
**Produces:** none
**Consumes:** the word rule, the reviewer deny and R3 (T3); rule P (T4); rules R1, R2 and R4, the ledger and the statusline (T5); rule A, the deletion bases and the observing notes (T6); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the absence check over plugin/`, `the full list of deleted parsing symbols`, `the test output printed when a named test fails`, `each named test actually running`, `the full selftest`

## Goal

`classify-command.mjs` and every parsing symbol nothing calls after T3–T6 are deleted with their tests and mutation-catalogue entries. The word rule is the only reading of command text left. No file under `plugin/` still defines or imports a deleted symbol.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the test below |
| `plugin/scripts/classify-command.mjs` | delete | no command is classified |
| `plugin/scripts/lifecycle.mjs` | edit | delete the parsing symbols left uncalled, including `isGitPublishCommand` and the shell helpers |
| `tests/classify.test.mjs`, `tests/read-only-arguments.test.mjs`, `tests/adr053-stress.mjs`, `tests/advice-accuracy.test.mjs`, `tests/leftovers-after-adr053.test.mjs`, `tests/unread-advice.test.mjs`, `tests/unread-advice-followon.test.mjs`, `tests/lifecycle.test.mjs`, `tests/staged-product.test.mjs`, `tests/event-analyser.test.mjs` | edit/delete | tests of deleted symbols go |
| `tests/mutations.json` | edit | entries whose `from` lives only in deleted code are retired |
| `docs/BACKLOG.md` | edit | closing lines on §213, §216, §217, §218, §219, §220 and §221 |

## Ordered Steps

1. [S1] Write the test and see it fail on an assertion (TDD red).
2. [S2] Delete the symbols with no remaining caller, found with `git grep -w <symbol> -- plugin`, and delete `classify-command.mjs`.
3. [S3] Remove the tests of deleted symbols and retire the catalogue entries whose `from` no longer matches. Every remaining entry must match once. [proof: acceptance]
4. [S4] Add the BACKLOG closing lines. [proof: acceptance]
5. [S5] Run the fence green and record mutants:
   - add `export function analyzeTranscript() {}` back to `lifecycle.mjs`;
   - add `export function shellSegments() {}` back to `lifecycle.mjs`.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(the command classifiers are gone)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'the command classifiers are gone'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && bash scripts/selftest.sh
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the command classifiers are gone` | `tests/observed-events.test.mjs` | `plugin/scripts/classify-command.mjs` does not exist on disk. No file under `plugin/` defines or imports any of `classifyCommand`, `classifyCommandWithHooks`, `isPotentialMutationCommand`, `isValidationCommand`, `bashMarkdownMutationPaths`, `bashDeletionMutationPaths`, `analyzeTranscript`, `isGitPublishCommand`, `gitSubcommand`, `shellCommandRegions`, `shellSegments`, `commandInvocation`, `heredocBodies`, `writeChannelOf` or `readsOnlyItsArguments`, while `readOnlyVerdict` and `containsCommitOrPush` remain. | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | the full selftest runs every remaining consumer; S5's mutants restore a deleted symbol |
| 3 — the caller can discover it | n/a: deletion |
| 4 — it is used | n/a: deletion |

## Mutation Log

## Invariants

- Every remaining `tests/mutations.json` entry matches exactly once.
- ADR-035 and ADR-044 tests still pass.

## Risks

- A symbol still used by an unrelated gate is deleted by mistake. S2 deletes only what `git grep` shows uncalled, and the full selftest is in the fence.

## Stop Condition

Stop and ask if a symbol on the list still has a caller outside the deleted code, since that means T3–T6 left a consumer.

## Out of Scope

- Rewriting ADR-041, -042, -047, -048, -051, -053, -054, -056, -058 or -059 (permanent: boundary: records are history, CLAUDE.md §10; ADR-060's Invalidates says what each loses)

## Verification Log
