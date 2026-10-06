# Task ADR-087-T1: frontmatter values and `active` are read alike by every reader

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-7, F-8, UC1-S1, UC1-S2
**Estimated scope:** M (record.py, lifecycle.mjs, adr-lint's sentence, one new test file, one edited test)
**Owner:** unassigned
**Produces:** `frontmatter_block(text)` in record.py and `frontmatterBlock(text)` in lifecycle.mjs — the leading `---` block's line range, or none; `active` → governing in both word sets; the frontmatter quote rule
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the frontmatter quote removal`, `active in the word set`

## Goal

Every reader reads a frontmatter `status: active`, `Active` or `"accepted"` as governing, keeps a template placeholder or an unmapped word undecided with today's reason, and never takes a Status from a directory name.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `frontmatter_block` (new, beside `record_status` at `:678`); `record_status` removes one enclosing quote pair and a trailing ` #` comment when its matched line is inside that block; `_STATUS_KINDS` (`:554`) gains `active` |
| `plugin/scripts/lifecycle.mjs` | edit | `frontmatterBlock` (new, exported for T4); `inlineStatus`/`recordStatus`/`rawStatus` (`:2078-2084`) apply the same quote rule; `STATUS_KINDS` (`:2117`) gains `active` |
| `plugin/bin/adr-lint` | edit | the not-recognised sentence (`:6509`) lists the words acted on, and gains `Active` |
| `tests/corpus-shapes.test.mjs` | add | this task's three tests |
| `tests/not-recognised-reason.test.mjs` | edit | its record says `status: active`, which this task makes a word acted on; the example becomes `status: on hold` (public/template-adr's own word, F-7). The file holds no lock (`python3 scripts/test-locks.py tests/not-recognised-reason.test.mjs`: 0, 2026-10-06) |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's three tests in `tests/corpus-shapes.test.mjs` and edit the example in `tests/not-recognised-reason.test.mjs`, then record the red run (TDD red). Each test builds its corpus under its own temporary directory and runs `git` only there (CLAUDE.md §9). Every record is written by the test, never copied from a public corpus (CLAUDE.md §6). Run `python3 scripts/test-locks.py tests/status-reading.test.mjs` first: on 2026-10-06 it reported 1 lock, so `every reader gives one Status the same reading` stays byte-identical and the new rows go in the new file.
2. [S2] Add `frontmatter_block` and `frontmatterBlock`. The block exists only when the text's first line is `---`, and it ends at the next line that is `---` or `...`. An unclosed block is not a block.
3. [S3] In both languages, when the Status line that ADR-074 Decision 1 matched lies inside that block, remove one enclosing pair of matching `"` or `'` around the whole value, and a ` #` comment after it, before Decision 2's markup removal. A value starting with `{` or `<` is left for the lookup to find no word in.
4. [S4] Add `active` → governing to `_STATUS_KINDS` and `STATUS_KINDS`, and add `Active` to adr-lint's sentence listing the words acted on.
5. [S5] Record one killed mutant per Rests-on name. One drops the quote removal, so `"accepted"` reads as undecided again. The other drops `active` from one language's set, so the parity row splits. Add both to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs tests/status-reading.test.mjs tests/not-recognised-reason.test.mjs 2>&1) \
  && for t in 'a frontmatter status is read as its corpora write it' 'a placeholder or an unmapped status stays undecided and is named' 'a directory name is never a status' 'every reader gives one Status the same reading' 'a not-recognised file is told what it lacks, and the probe carries the reason'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a frontmatter status is read as its corpora write it` | `tests/corpus-shapes.test.mjs` | over a corpus under `docs/decisions`, adr-lint lints and adr-state and work-next count as governing: `status: active`, `status: Active`, `status: "accepted"`, `status: 'active'  # in force`, and `status: "accepted, amended by ADR-0019"`. DIRTY twin: the same records before S3/S4 are undecided in all three readers | F-1, F-2, F-3, UC1-S1 | S1, S2, S3, S4 |
| `a placeholder or an unmapped status stays undecided and is named` | `tests/corpus-shapes.test.mjs` | undecided in adr-state, work-next and adr-lint, each named with today's reason: `status: "{proposed \| rejected \| accepted \| deprecated \| … \| superseded by ADR-0123}"`, `Status: <Draft \| Experimental \| Accepted>`, `status: "{Active\|Superseded}"`, `status: final`, `status: experimental`, `status: draft-accepted`, `status: on hold`, and `**Status:** "Accepted"` outside a frontmatter block. CLEAN twin: `status: accepted` in the same corpus governs | F-2, F-3, F-7, UC1-S2 | S1, S3, S4 |
| `a directory name is never a status` | `tests/corpus-shapes.test.mjs` | `docs/decisions/Final/0001-x.md` with a `## Context` and no Status is undecided with "no status line", in adr-state and work-next | F-8 | S1 |
| `every reader gives one Status the same reading` | `tests/status-reading.test.mjs` | the existing ADR-074 parity table, unchanged and locked: no row it holds moves | none | S3, S4 |
| `a not-recognised file is told what it lacks, and the probe carries the reason` | `tests/not-recognised-reason.test.mjs` | the 3.8.10 reason sentence, with its example word moved from `active` to `on hold` | F-7 | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three new tests |
| 2 — something selects it | every reader reaches `record_status`/`status_kind` or `inlineStatus`/`recordStatusKind`; the tests run adr-lint, adr-state and work-next as processes, so dropping either rule turns a row red |
| 3 — the caller can discover it | adr-lint's not-recognised sentence lists the words acted on; the release notes name the change |
| 4 — it is used | an outside run over public/swift-adrs after release (ADR-087 Follow-ups) |

## Mutation Log

## Invariants

- Every row of ADR-074's parity table reads as it did.
- A quote pair is removed only inside a leading frontmatter block.
- No value starting with `{` or `<` governs.

## Risks

- A corpus where `Active` does not mean in force reads wrongly. ADR-087 Consequences names it, and the spec's first Open Question asks the owner whether to limit `active` to frontmatter.

## Stop Condition

Stop and ask if the owner has not answered the spec's first Open Question, if any row of the locked parity table moves, or if a test this task edits has become locked.

## Out of Scope

- The bullet label — T2. `superseded_by` — T3. Files outside a record directory — T4.

## Verification Log
