# Task ADR-087-T2: a MADR 2 bullet Status is read above the first section

**Depends-on:** T1
**Covers:** F-4
**Estimated scope:** S (one label arm in two languages, its tests and campaign entries)
**Owner:** unassigned
**Produces:** the bullet label arm in `record_status` and `inlineStatus`
**Consumes:** `frontmatter_block` / `frontmatterBlock` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the bullet label`, `the first-section bound`

## Goal

A line `* Status: <value>` or `- Status: <value>` above a record's first level-2 heading is read as its Status in every reader, and the same bullet below that heading is not.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `record_status` (`:678`): when `_STATUS_LINE` (`:538`) finds nothing above the first `## ` heading, a bullet label there is the Status, read with the same case-insensitive label |
| `plugin/scripts/lifecycle.mjs` | edit | `inlineStatus`, the same arm, so the two readers agree |
| `tests/corpus-shapes.test.mjs` | edit | this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's two tests and record the red run (TDD red). Today both bullet records are undecided with "no status line this reader can read".
2. [S2] In both languages, read a bullet label, `^[ \t]*[*-][ \t]+` followed by ADR-074 Decision 1's label, only from lines above the first unfenced `## ` heading. An inline label anywhere still wins over a bullet, and a bullet still wins over a `## Status` section.
3. [S3] Record one killed mutant per Rests-on name. One drops the bullet arm, so the data row goes red. The other drops the first-section bound, so the twin goes red. Add both to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \
  && for t in 'a MADR 2 bullet status is read above the first section' 'a status bullet inside a section is not the record status'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a MADR 2 bullet status is read above the first section` | `tests/corpus-shapes.test.mjs` | under `docs/decisions`, `* Status: accepted` and `- status: proposed` above `## Context and Problem Statement` are governing and pending in adr-state, work-next and adr-lint alike | F-4 | S1, S2 |
| `a status bullet inside a section is not the record status` | `tests/corpus-shapes.test.mjs` | `- Status: accepted` under `## Context` with no other Status is undecided, with "no status line", in all three readers. CLEAN twin: a record whose `**Status:** Proposed` sits above a body bullet `- Status: accepted` reads Proposed | F-4 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `record_status` and `inlineStatus` are the only label readers (ADR-074); the tests run the readers as processes |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the readers' counts |
| 4 — it is used | public/star-status-adr's 29 bullet records after release; nothing measures this yet |

## Mutation Log

## Invariants

- No file outside a record directory is newly linted. ADR-074's placement rule admits a non-`**Status:**` form only under one.
- An inline label keeps precedence over a bullet, and a bullet over a `## Status` section.

## Risks

- A corpus with a bulleted list above its first heading that holds a `Status:` item meaning something else. None of the nine measured corpora has one. The ADR's Risks names it.

## Stop Condition

Stop and ask if this repository's own `corpus-probe --json` gives a different `records` or `undecided` list after S2 than before it.

## Out of Scope

- Frontmatter — T1. MADR 2's linked `superseded by [ADR-0005](0005-example.md)` reads through the existing `supersessionTarget`, unchanged.

## Verification Log
