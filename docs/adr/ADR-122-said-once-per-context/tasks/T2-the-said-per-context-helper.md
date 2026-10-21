# Task ADR-122-T2: One helper: the marker, the transcript scan, the fallback and the reset

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** `saidInContext(input, item, text)` and `SaidInContext`; the marker `<qh:<item>@<hash8>>`
**Consumes:** the hook-output record shapes and the channel measurement (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

One helper in Node and one in Go answer whether an item is already in this context, from the transcript after the last
compaction boundary or from the per-session, per-generation fallback, and stamp the item's marker.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/said-per-context.test.mjs` | create | the scan, the marker and the fallback (0 locks: new) |
| `plugin/scripts/said-per-context.mjs` | create | `saidInContext`, `itemMarker`, the incremental scan and its cache |
| `core/hooks/saidcontext.go` | create | the Go twin |
| `core/hooks/saidcontext_test.go` | create | Go rows |
| `tests/qh-core-parity.test.mjs` | edit | parity rows for the marker and the verdict (new tests beside locked ones) |
| `plugin/scripts/session-notes.mjs` | edit | the fallback is `firstMentionThisSession`; the scan cache lives in `saidMarkerDirectory()` under `sweepStaleMarkers` |
| `core/hooks/notes.go` | edit | the same |
| `docs/architecture.md` | edit | the two module rows |
| `tests/mutations/plugin/scripts/said-per-context.mjs.json` | create | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run, one row per "this fails if" of Decisions 1, 2 and 6, each with its twin:
   an age-only difference keeps the digest and a changed finding changes it; a marker in a hook output after the boundary is
   said, one before it is unsaid; a marker only in a record named by `preservedSegment` or `preservedMessages` is said, and one
   outside them before the boundary is unsaid; preserved records that cannot be resolved within the budget use the fallback;
   a tool result holding `compact_boundary` resets nothing; a marker literal inside a tool result counts for nothing; a
   transcript replaced at the same path with equal or greater size (new inode or new first `uuid`) drops the old markers, and
   an appended transcript keeps them; an incomplete last line leaves the offset before it, and the completed line is read next
   time; a second firing reads from the stored offset; past 8 MiB or 1 s, or on a parse failure, the fallback answers; a
   firing never blocks on another's cache write; an UNRUN line that changed is said.
2. [S2] Write `itemMarker(item, stableText)`: SHA-256 over the stable text, first 8 hex; volatile parts are passed apart.
3. [S3] Write the scan: from the cached offset, within the cached transcript identity (inode and first record `uuid`), parse
   each complete line, keep the shapes T1 listed, reset at a parsed `compact_boundary` except for the preserved records'
   markers, stop at the budget; store the offset after the last complete line.
4. [S4] Write the fallback through `firstMentionThisSession` (session, generation, item and digest) and the cache write under an
   exclusive create that never waits; a SessionStart `compact` or `clear` already bumps the generation, which resets both.
5. [S5] The Go twin and the parity rows; the module map rows.
6. [S6] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \
  && for n in "an item is said once in a context and again after its boundary" \
      "a preserved record keeps its marker and an unpreserved one does not" \
      "a marker in a tool result is not a saying" \
      "a replaced transcript drops its markers and an appended one keeps them" \
      "an incomplete last line is read when it completes" \
      "the scan fails open to the per-generation marker past its budget" \
      "a changed item and a changed could-not-look line are said"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/ -run '^TestSaidPerContext' -v 2>&1 | grep -q '^--- PASS: TestSaidPerContext') \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an item is said once in a context and again after its boundary` | `tests/said-per-context.test.mjs` | the boundary reset and the parsed boundary twin | — | S1, S3 |
| `a preserved record keeps its marker and an unpreserved one does not` | `tests/said-per-context.test.mjs` | `preservedSegment` and `preservedMessages` | — | S1, S3 |
| `a marker in a tool result is not a saying` | `tests/said-per-context.test.mjs` | only T1's hook-output shapes count | — | S1, S3 |
| `a replaced transcript drops its markers and an appended one keeps them` | `tests/said-per-context.test.mjs` | the transcript identity beside the offset | — | S1, S3 |
| `an incomplete last line is read when it completes` | `tests/said-per-context.test.mjs` | the offset never passes a partial line | — | S1, S3 |
| `the scan fails open to the per-generation marker past its budget` | `tests/said-per-context.test.mjs` | budget, parse failure, unresolved preserved records, no waiting | — | S1, S4 |
| `a changed item and a changed could-not-look line are said` | `tests/said-per-context.test.mjs` | the digest, Decision 6 | — | S1, S2 |
| `TestSaidPerContext` | `core/hooks/saidcontext_test.go` | the Go twin's rows | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | nothing until T3 routes the emitters; T3's mutants on each call |
| 3 — the caller can discover it | the marker in the hook output |
| 4 — it is used | T5's after-measurement |

## Mutation Log

## Invariants

- A hook never waits on the scan or on a lock.
- Every failure to read errs toward saying.
- Node and Go agree on the marker and the verdict.

## Risks

- The host clears hook output from context while the transcript keeps it: T1's S4 measures it; if it does, the scan
  over-suppresses and T2 stops (Stop Condition).
- What the test doubles do not model: the synthetic transcripts carry the shapes T1 measured on one host version; T5's real
  session meets the current one.

## Stop Condition

Stop if T1 measured that the host drops hook output from the model's context while the transcript keeps it: the transcript
is then not the source of truth for this decision, and the owner decides.

## Out of Scope

- Routing the emitters (T3) and the channels (T4).

## Verification Log
