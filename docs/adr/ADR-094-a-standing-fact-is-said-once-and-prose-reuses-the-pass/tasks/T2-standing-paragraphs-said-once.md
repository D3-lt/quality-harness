# Task ADR-094-T2: SessionStart says a standing paragraph once, and the notice only without a pass

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** M (one script, its tests and campaign entries)
**Owner:** unassigned
**Produces:** `saidHere(root, text)` and `passedAlready` in `plugin/scripts/lifecycle.mjs`
**Consumes:** `unobservableWrites(log, root)` (T4)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a standing paragraph is keyed by repository and text for three days`, `compaction and clear say every paragraph`, `a recorded pass for the tree silences the notice`, `a tree with no pass keeps the notice`

## Goal

On startup and resume a standing paragraph is said once per repository per three days, and the previous-session notice appears only when the ledger holds no pass for the tree as it is now.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `saidHere` beside `firstMentionThisSession` (`:3934`); `sessionOrientation(cwd, source)` (`:4180`) gates its standing paragraphs (`:4193`, `:4198`, `:4211`, `:4225`, `:4239`, `:4253`) on a startup or resume; the SessionStart handler passes `input.source` (`:7161`) and gates the arming note (`:7167`); `previousSessionNotice` (`:3759`) reads `passedAlready`; wording "write(s) git cannot see" (`:3764`); `passedAlready` moves here |
| `plugin/scripts/qh-check.mjs` | edit | re-exports `passedAlready` from `lifecycle.mjs`; no behaviour change |
| `tests/standing-facts.test.mjs` | add | four tests, through the real SessionStart hook |
| `tests/mutations/plugin/scripts/lifecycle.mjs.json` | edit | four entries, one per `Rests-on` name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py` over every test file that asserts SessionStart text (enumerate them with `mrw read --grep 'sessionOrientation|previousSessionNotice|ADR tasks in flight' tests` and put the command and the count in the sign-off), then write the four tests of the Tests table and record the red run (TDD red).
2. [S2] Move `passedAlready` into `lifecycle.mjs` unchanged and re-export it from `qh-check.mjs`; the existing qh-check tests keep passing without an edit. [proof: acceptance]
3. [S3] Add `saidHere(root, text)`: a marker keyed on `sha256(root#text)` in the existing marker directory; true and refreshed when none exists or the newest is three days old or older, false otherwise; an unwritable directory says the paragraph (errs toward saying, as `firstMentionThisSession` does).
4. [S4] Gate the paragraphs on `startup` and `resume` only. The could-not-look lines are never gated; on `compact` and `clear` every paragraph is said.
5. [S5] `previousSessionNotice` returns nothing when `passedAlready` finds a pass for the tree as it is now, dirty or clean; it keeps the notice when no pass is found, when the tree could not be observed and when no check is declared. Reword the count.
6. [S6] Record four killed mutants, one per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/standing-facts.test.mjs 2>&1) \
  && for t in 'a standing paragraph is said once per repository for three days and again when its text changes' 'compaction and clear say every paragraph again' 'the previous-session notice is silent when a pass is recorded for the current tree' 'a tree with no pass keeps the previous-session notice, clean or dirty'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a standing paragraph is said once per repository for three days and again when its text changes` | `tests/standing-facts.test.mjs` | two startups in one repository: the second carries no `Verification:` paragraph; a changed check command is said; a marker older than three days is said again; a second repository is independent; DIRTY twin: could-not-look lines are said both times | none | S1, S3, S4 |
| `compaction and clear say every paragraph again` | `tests/standing-facts.test.mjs` | the same two events with `source: compact` and `source: clear` carry every paragraph | none | S1, S4 |
| `the previous-session notice is silent when a pass is recorded for the current tree` | `tests/standing-facts.test.mjs` | an `unverified` previous-session row and a `checks.jsonl` pass on the tree as it is now: no notice, in a dirty and a clean tree | none | S1, S5 |
| `a tree with no pass keeps the previous-session notice, clean or dirty` | `tests/standing-facts.test.mjs` | the dirty twin: an unverified row, no pass; a clean tree with `"publish": "warn"` and an unverified row; an unobservable tree; no declared check — each keeps the notice, now saying "write(s) git cannot see" | none | S1, S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | the SessionStart handler calls `sessionOrientation` and `previousSessionNotice`; dropping the `saidHere` gate or the pass read turns tests 1 and 3 red |
| 3 — the caller can discover it | n/a: no declared interface — the effect is SessionStart's context |
| 4 — it is used | the survey sessions count their SessionStart lines before and after (the outside run); nothing measures this yet |

## Mutation Log

## Invariants

- An unknown is said every time (ADR-005); only a standing fact is said once.
- A changed text is said: the hash is of the text.
- Compaction and clear lose the context, so they say everything.
- The pass read is the one `qh-check` uses, including its unseen-write veto.

## Risks

- A session started within three days does not hear a paragraph it never had in its own context; ADR-094's Consequences name it, and the publish advice and the first `qh-check` name the command.
- Moving `passedAlready` could change an import path for a test; the re-export keeps `qh-check.mjs` as the path.

## Stop Condition

Stop and ask if a locked test asserts a SessionStart paragraph on a second start, or if `passedAlready` cannot move without a behaviour change.

## Out of Scope

- Treating "Accepted — implemented" records as not in flight (deferred: docs/BACKLOG.md §372)

## Verification Log
