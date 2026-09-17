# Task ADR-059-T1: A channel-free read names no changed path

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments`; `tests/read-only-arguments.test.mjs` (file exists)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the family table in readsOnlyItsArguments`, `a redirect beside a read still counting`, `each named test actually running`, `the regression suites that pin path extraction`

## Goal

`bashMarkdownMutationPaths` takes nothing but a `>`/`>>` redirect target from a segment whose command is one of the channel-free families in ADR-059's Decision, through one family table that also carries ADR-058 T5's `wc`, `grep`, `git ls-files` and `mrw read`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | create | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `readsOnlyItsArguments` reads a `READ_ARGUMENT_FAMILIES` table; `printsOnly` in `bashMarkdownMutationPaths` is what selects it |

## Ordered Steps

1. [S1] Create the test file with the two tests below and see the first fail on an assertion (TDD red). The second pins the redirect and wrapper directions and passes before the change; S3's mutant that skips the redirect target shows it can fail.
2. [S2] Replace T5's family branches with a table `READ_ARGUMENT_FAMILIES` (family → write-channel test, `() => false` for channel-free families). Keep `grep`'s ugrep option test, `git`'s `ls-files` subcommand, `mrw read` through `isRecognisedReadInvocation`, and ADR-058 T6's wrapper check exactly.
3. [S3] Run the fence green and record mutants: drop one family from the table; skip the redirect target too; make `wc` answer false (T5's family survives the refactor). [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a channel-free read names no changed path|a redirect beside a channel-free read is still a changed path)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a channel-free read names no changed path' 'a redirect beside a channel-free read is still a changed path'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a channel-free read names no changed path` | `tests/read-only-arguments.test.mjs` | for each channel-free family, `touch b.log && <family> docs/a.md` classifies `mutation` and yields no path | — | S1, S2 |
| `a redirect beside a channel-free read is still a changed path` | `tests/read-only-arguments.test.mjs` | `cat docs/a.md > docs/new.md`, `head -2 notes.md >> README.md`, `/usr/bin/time -o docs/timing.md cat docs/a.md` and `cp notes.md docs/new.md` beside a `cat` still yield the written file | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `printsOnly` in `bashMarkdownMutationPaths` asks `readsOnlyItsArguments`; `analyzeTranscript` calls the extractor for every `mutation`, which each test asserts; S3's mutants remove a family |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-059's Follow-up replay |

## Mutation Log

## Invariants

- ADR-058 T3, T5 and T6 behave exactly as before; `tests/advice-accuracy.test.mjs` is in the fence.
- `isRecognisedReadInvocation` stays `mrw read`-only; it is also the classifier's hook.
- A redirect target, a wrapper's Markdown operand, and every token of a segment whose family is not in the table, are still candidates.

## Risks

- A shell alias or function named like a family that writes. Advice only; named in ADR-059's Consequences.

## Stop Condition

Stop and ask if a `tests/lifecycle.test.mjs` test about Markdown-only changes (BACKLOG §174) goes red.

## Out of Scope

- Families with a write channel (deferred: docs/adr/ADR-059-a-read-only-command-names-no-changed-path/tasks/T2-a-family-that-can-write-names-no-changed-path-until-it-uses-that-channel.md)

## Verification Log
