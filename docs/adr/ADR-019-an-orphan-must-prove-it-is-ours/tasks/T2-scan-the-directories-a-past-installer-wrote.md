# Task ADR-019-T2: Scan the directories a past installer may have written, and cost the walk

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `orphans()` (T2)
**Consumes:** `formerlyShipped()` (T1), `classifyHomeFile()` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Enumerate the home directories a past installer of this plugin may have written into — derived from
what any cached release shipped, not hand-listed — and return the classified rows for what is in them.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/standalone-link.mjs` | edit | `orphans(homeDirectory)` sits beside the classifier it calls |
| `tests/standalone-link.test.mjs` | edit | asserts the derived directory set and the classified rows |
| `tests/mutations.json` | edit | registers `orphan: the scan set is derived from the releases, not written down` |

## Ordered Steps

1. [S1] Write the failing test first (TDD red): a synthetic cache whose releases between them ship a directory absent from `SHADOW_SCOPE`, and assert `orphans()` looks in the matching home directory. It must fail before the derivation exists.
2. [S2] Derive the scan set as the union of top-level directory names across every cached release, plus the `home` names already in `SHADOW_SCOPE`. Measured 2026-09-01 against this machine's cache of 52 releases, that union is nine — `bin docs evals hooks scripts skills templates tests workflows` — against `SHADOW_SCOPE`'s four. Do not write those nine down: the point of the derivation is that the tenth is not missed. [proof: acceptance]
3. [S3] `orphans(homeDirectory)` returns one row per file found, `{ directory, name, state, evidence }`, where `state` comes from `classifyHomeFile()` and `evidence` names the release and the route that answered. A row is produced for `unidentified` too, so T3 can count them without re-walking.
4. [S4] Measure the walk against a cache the size of the authoring machine's and record the figure and its date in a source comment beside the function. A bare number is unfalsifiable once the cache changes. [proof: human: a reader confirms the comment names both the figure and the cache it was measured against, with a date]
5. [S5] Register the mutation replacing the derived set with a literal list and confirm it is RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/standalone-link.test.mjs 2>&1 | tee /tmp/adr019-t2.out \
  && ! grep -qE "^# fail [1-9]|no tests to run|tests 0" /tmp/adr019-t2.out \
  && grep -q "the scan set is derived from the releases" tests/mutations.json
```

<Red before the work: `orphans` is not exported yet, so the import throws. The catalogue grep is
chained with `&&` so the suite alone cannot carry the verdict.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the scan set is derived from what the releases shipped` | `tests/standalone-link.test.mjs` | a directory present only in an OLD release is scanned; one in no release is not | — | S1, S2 |
| `a home directory SHADOW_SCOPE names is scanned though no release shipped that name` | `tests/standalone-link.test.mjs` | the home `hooks/` name survives, since the plugin ships those files under `scripts/` | — | S2 |
| `an unidentified file gets a row rather than being dropped` | `tests/standalone-link.test.mjs` | `unidentified` rows are returned, so the count needs no second walk | — | S3 |
| `an absent home directory is not an error` | `tests/standalone-link.test.mjs` | a scan set naming directories the user does not have still returns rows for the rest | — | S3 |
| `a home with nothing of ours returns no rows, and one with a planted orphan returns one` | `tests/standalone-link.test.mjs` | the clean answer is shown able to be dirty in the same test | — | S3 |

<The last row exists because coverage cannot see a vacuous assertion: `deepEqual(orphans(home), [])`
passes at 100% line and branch coverage against a function mutated to return `[]`. The dirty case is
asserted in the same test, on the same fixture.>

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests above |
| 2 — something selects it | nothing in product code yet — T3 is the only caller; the mutation in S5 selects the derivation for the campaign, and it fails if the set becomes a literal |
| 3 — the caller can discover it | n/a: no declared interface — a module export consumed by T3 in the same repository |
| 4 — it is used | nothing measures this yet; the parent ADR's Follow-up counts `unidentified` rows once T3 ships |

## Mutation Log

## Invariants

- The scan set is derived, never a literal; a directory a future release adds is covered with no edit here.
- `orphans()` reads. It opens files to digest and to match lineage, and writes nothing.
- An absent directory is an absence of files, never an error.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The derived set pulls in a Claude Code directory that is not ours (`commands`, `agents`) | Low | Low | Only names some release shipped, or a `SHADOW_SCOPE` home name, enter the set — and every file inside is still classified positively before it is named |
| The walk is slow enough to be felt at session start | Med | Med | S4 measures it; if it is felt, the Stop Condition sends the question back to the ADR rather than tuning it here |

## Stop Condition

Stop if the measured walk exceeds the budget the session-start notice already lives inside. Where
this runs is a decision, not an implementation detail, and belongs back in the parent ADR.

## Out of Scope

- Rendering, counting or wording, which is T3's (deferred: this record's T3)
- Deriving `SHADOW_SCOPE`'s DRIFT scope from the current tree, a separate defect (deferred: docs/BACKLOG.md §96)
- Any write path (permanent: boundary: the parent ADR's Decision — the tool names and never acts)

## Verification Log
