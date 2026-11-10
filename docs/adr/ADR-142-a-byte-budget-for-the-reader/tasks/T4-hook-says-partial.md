# Task ADR-142-T4: The decision context says PARTIAL when the look did not read something that could carry scope

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `incomplete` on the corpus; the PARTIAL line of the decision context; `decisionContext(paths, root, corpus)`; `tests/helpers/decision-rows.mjs` (the corpusRecord projection and the Go row and replay runner)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Both readers keep a corpus-level `incomplete` list (an unread record, task file or README; a record or screen budget that
stopped the look), make the look PARTIAL when it is non-empty, and print `PARTIAL — what governs this file may be missing:
<reason> (<path>)` in the decision context whenever it is, so no scope is lost in silence (ADR-142 Decision 1). Lands before
the limits (T1, T2) that add causes to it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/decision-corpus.mjs` | edit | `incomplete` filled in `adrCorpus` (:1551-1606 for records and budgets, :1699-1706 for task files, `archiveDecisionEffect` :748 for READMEs); `decisionsGoverning` (:1908) returns it; `decisionContext` (:1926-1965) prints the line and takes an optional corpus |
| `core/hooks/decisioncorpus_read.go` | edit | `dcCorpus.incomplete` filled at the same sites (`partial` :670-673, the task read :758-760, the catalog read through `dcRecordStanding`); `context` (:899-942) prints the line |
| `core/hooks/decisioncorpus.go` | edit | `dcArchiveDecisionEffect` (:1815) reports the README it could not read |
| `tests/helpers/decision-rows.mjs` | add | The `corpusRecord` projection of tests/decision-context-parity.test.mjs:319-337 and a runner handing rows to `TestDecisionCorpusParity` and a replay to `TestDecisionContextReplay`, shared by every task here |
| `tests/decision-context-partial.test.mjs` | add | Each cause in Node, and both Go tests over the same corpora |
| `tests/mutations/plugin/scripts/decision-corpus.mjs.json` | edit | The line dropped; a task-file failure left out of `incomplete` |
| `tests/mutations/core/hooks/decisioncorpus_read.go.json` | edit | The same two in the core |

## Ordered Steps

1. [S1] Confirm the failing test exists and is red (TDD red): write `tests/decision-context-partial.test.mjs` over scratch git
   repositories, one per cause, each holding an Accepted record that governs `src/a.js` only through what the look cannot
   read: an owned task file made unreadable (a directory named like the task file, so it fails on every platform), an
   archive README made the same way above the record, the record itself past 512 KiB, 201 records before it (the record
   budget), and an injected screen budget before it. For each it asserts the text for `src/a.js` holds the PARTIAL line with
   that reason and path, and that a corpus reading everything gives today's text exactly. Red: today every one is empty.
   Run `python3 scripts/test-locks.py tests/decision-context-parity.test.mjs` first: moving `corpusAnswer` into the helper
   must leave every locked test body byte-identical, or the helper copies it instead.
2. [S2] Node: fill `incomplete` at each site in listing order, set look PARTIAL, return it from `decisionsGoverning`, print the
   line after every group whether or not any printed, `(+N more)` past the first.
3. [S3] The core: the same list at the same sites, the same line byte for byte; the replay over the five corpora and every
   fixture corpus gives zero disagreements.
4. [S4] Add the catalogue mutants and record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/decision-context-partial.test.mjs 2>&1 | tee "$out" && grep -q '✔ a look that left scope unread says PARTIAL in the decision context, in Node and the core alike' "$out" && node --test tests/decision-context-parity.test.mjs tests/decision-context-replay.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a look that left scope unread says PARTIAL in the decision context, in Node and the core alike` | `tests/decision-context-partial.test.mjs` | The line for each cause in Node, and the core's text equal over the replay | — | S1, S2, S3 |
| `a look that read everything prints no PARTIAL line` | `tests/decision-context-partial.test.mjs` | An alias, or a note recognition rejects, adds no line; the replay of every fixture corpus is unchanged | — | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the line in both renderers |
| 2 — selected | `dcDecisionContext` from `pending.go`'s hook path, and adr-context's `--hook`; the mutants drop it |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | nothing measures this yet: no corpus we run leaves scope unread |

## Mutation Log

## Invariants

- A look that read everything prints exactly what it prints today.
- An alias and a file recognition rejects are not causes: both were read.

## Risks

- A look made PARTIAL by an unread task file changes what work-next and adr-state say; ask the test locks before touching
  their tests, and add tests beside locked ones.
- The unreadable fixtures are directories named like files; a real permission failure is met only by the outside run (§18).

## Stop Condition

Stop if a locked test's body would have to change, or if work-next's readiness answer changes for a corpus where nothing was
left unread.

## Out of Scope

- The per-file bound (T1) and the byte budget (T2), which add causes to this list.

## Verification Log
