# Task ADR-079-T4: No verdict on this corpus changes

**Depends-on:** T3
**Covers:** none — the owner's bar (spec Grill Log row 3)
**Estimated scope:** S (one comparator script)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** live: this repository's records and specs, and `plugin/` rebuilt from git at cd8f95f
**Proof map:** v1
**Rests-on:** `the comparator can fail`, `the comparison is empty`

## Goal

Every record's `adr-lint` verdict and every spec's `spec-verify` verdict is the same with `plugin/` at cd8f95f and with the candidate, over one corpus, with an empty exception list (ADR-079 Context).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/verdict-diff.sh` | create | rebuilds `plugin/` at a sha from git, runs both plugins over the same tracked records and specs, normalises versions, temp paths and durations, records the manifest and every exit status, and diffs; `--control` makes the "after" side deliberately differ |

## Ordered Steps

1. [S1] Write the comparator and show it can fail (TDD red, CLAUDE.md §4): `--control` runs the "after" side through an `adr-lint` that prints one extra line per record, and the comparator must exit 1. [proof: acceptance]
2. [S2] Run the real comparison: the frozen plugin and the candidate over the same tracked corpus; the comparator exits 0 only on an empty diff. [proof: acceptance]

## Acceptance

```bash
bash scripts/verdict-diff.sh --control cd8f95f; test $? -eq 1 && bash scripts/verdict-diff.sh cd8f95f
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the comparator |
| 2 — something selects it | this task's fence, before the release |
| 3 — the caller can discover it | the manifest and the diff it prints |
| 4 — it is used | the release decision |

## Mutation Log

## Invariants

- Both sides read the same tree at the same time; the baseline is rebuilt from git, never retaken after an edit.

## Risks

- The run is two passes over the corpus; it takes minutes.

## Stop Condition

Stop and ask if the diff is not empty.

## Out of Scope

- Corpora we do not own: the outside runs, §18.

## Verification Log
