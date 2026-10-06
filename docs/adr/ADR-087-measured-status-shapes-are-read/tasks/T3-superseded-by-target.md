# Task ADR-087-T3: a frontmatter `superseded_by` names the replacement

**Depends-on:** T1
**Covers:** F-5, F-6
**Estimated scope:** S (one input to `supersessionTarget` in lifecycle.mjs, its tests and campaign entries)
**Owner:** unassigned
**Produces:** a record's `supersededBy` read from frontmatter `superseded_by` when its Status names none
**Consumes:** `frontmatterBlock` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `superseded_by supplies a missing target`, `supersedes is not read`

## Goal

A graveyard record whose Status names no record takes its replacement from its frontmatter `superseded_by`, in the three spellings measured. A `supersedes` key never changes any record's kind or target.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | the record's `supersededBy` (`:2777-2779`): when the Status kind is graveyard and the Status names nothing, read `superseded_by` from `frontmatterBlock`, remove quotes and a `.md` suffix, and pass `superseded by <value>` to `supersessionTarget` (`:2828`), which is unchanged |
| `tests/corpus-shapes.test.mjs` | edit | this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's two tests and record the red run (TDD red). Today a `status: superseded` record names no target, so `adr-state --json` lists none of the data rows under `danglingSupersession`.
2. [S2] In `supersededBy`, when `/^superseded\s+by\b/i` does not match, the kind is graveyard, and the frontmatter has a single-line `superseded_by:` value other than `null`, `~`, `[]` or empty: remove one enclosing quote pair, a trailing ` #` comment and a `.md` suffix, then read the target with `supersessionTarget`. A one-item inline list `[x]` is read as `x`. A list of more than one names no single replacement and is left unread.
3. [S3] `supersedes` is not read anywhere. The twin pins this.
4. [S4] Record one killed mutant per Rests-on name. One drops the `superseded_by` read, so the data rows leave `danglingSupersession`. The other reads `supersedes` as a reverse supersession of its targets, so the twin's governing record turns graveyard. Add both to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \
  && for t in 'a frontmatter superseded_by names the replacement in the three measured spellings' 'supersedes is never read and superseded_by never moves a governing record'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a frontmatter superseded_by names the replacement in the three measured spellings` | `tests/corpus-shapes.test.mjs` | three `status: superseded` records whose `superseded_by` is `041-gone`, `042-gone.md` and `"0043"`, with no records 41 to 43 in the corpus, each appear in `adr-state --json` `danglingSupersession`. CLEAN twin: with `041-…`, `042-…` and `043-…` present, none does. A record whose `superseded_by` is `null` or `[]` is in neither list | F-5 | S1, S2 |
| `supersedes is never read and superseded_by never moves a governing record` | `tests/corpus-shapes.test.mjs` | `status: active` with `supersedes: [001-x]` leaves `001-x` (`status: active`) governing in adr-state and work-next. `status: active` with `superseded_by: 009-y` stays governing and adds no dangling entry | F-6, F-5 | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | adr-state's dangling check (`adr-state.mjs:101`) reads `supersededBy`; the tests read its JSON as a process |
| 3 — the caller can discover it | `adr-state` text and JSON name a dangling supersession, as today |
| 4 — it is used | public/swift-adrs's 29 and public/active-status-adr's 12 superseded records after release; nothing measures this yet |

## Mutation Log

## Invariants

- `supersessionTarget` is unchanged, and so is every Status-written target.
- A record's kind comes from its own Status alone.

## Risks

- A `superseded_by` naming a record by a slug with no leading number, which `supersessionTarget` reads as nothing. public/frontmatter-adr names its records without numbers. Its one superseded record then names no target, as today, and no new false dangling entry appears.

## Stop Condition

Stop and ask if `danglingSupersession` on this repository's own corpus changes after S2.

## Out of Scope

- The archive-catalog effect readers (`lifecycle.mjs:2251`, `adr-retire-check:636`), as ADR-087 Context explains.

## Verification Log
