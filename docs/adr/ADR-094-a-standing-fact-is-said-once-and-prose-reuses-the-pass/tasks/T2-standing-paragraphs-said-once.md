# Task ADR-094-T2: SessionStart says a standing paragraph once, and the notice only without a pass

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** M (one script, its tests and campaign entries)
**Owner:** unassigned
**Produces:** `firstMentionHere(root, text)` and `passedAlready` in `plugin/scripts/lifecycle.mjs`
**Consumes:** `unobservableWrites(log, root)` (T4)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a standing paragraph is keyed by repository and text for three days`, `compaction and clear say every paragraph`, `a recorded pass for the tree silences the notice`, `a tree with no pass keeps the notice`

## Goal

On startup and resume a standing paragraph is said once per repository per three days, and the previous-session notice appears only when the ledger holds no pass for the tree as it is now.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `firstMentionHere` beside `firstMentionThisSession`; `sessionOrientation(cwd, { once })` gates its standing paragraphs (the `Verification:` pair, the stale-version notice, the archive advice, the shadow-install notice, the ADR tasks in flight) through a local `standing`; the SessionStart handler passes `once` for startup and resume and gates the arming note on resume; `previousSessionNotice` reads `passedAlready`; wording "write(s) git cannot see"; `passedAlready` moves here |
| `plugin/scripts/qh-check.mjs` | edit | imports `passedAlready` from `lifecycle.mjs` (no re-export: nothing else imported it); no behaviour change |
| `tests/standing-facts.test.mjs` | add | four tests, through the real SessionStart hook |
| `tests/mutations/plugin/scripts/lifecycle.mjs.json` | edit | four entries, one per `Rests-on` name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py` over every test file that asserts SessionStart text (enumerate them with `mrw read --grep 'sessionOrientation|previousSessionNotice|ADR tasks in flight' tests` and put the command and the count in the sign-off), then write the four tests of the Tests table and record the red run (TDD red).
2. [S2] Move `passedAlready` into `lifecycle.mjs` unchanged and import it in `qh-check.mjs`; the existing qh-check tests keep passing without an edit. [proof: acceptance]
3. [S3] Add `firstMentionHere(root, text)`: a marker keyed on `sha256(root#text)` in the existing marker directory; true ("say it now") and refreshed when none exists or the newest is three days old or older, false otherwise; an unwritable directory says the paragraph (errs toward saying, as `firstMentionThisSession` does).
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
| 2 — something selects it | the SessionStart handler calls `sessionOrientation` and `previousSessionNotice`; dropping the `firstMentionHere` gate or the pass read turns tests 1 and 3 red |
| 3 — the caller can discover it | n/a: no declared interface — the effect is SessionStart's context |
| 4 — it is used | the survey sessions count their SessionStart lines before and after (the outside run); nothing measures this yet |

## Mutation Log
- 2026-10-09 · 3968c19d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · keys a standing paragraph on the repository alone, so a changed text is never said · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · covers:a standing paragraph is keyed by repository and text for three days
- 2026-10-09 · 3968c19d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · gates compaction and clear like a start, so a compacted context never hears the paragraph again · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · covers:compaction and clear say every paragraph
- 2026-10-09 · 3968c19d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · drops the pass read, so a proven tree still gets the previous-session notice · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · covers:a recorded pass for the tree silences the notice
- 2026-10-09 · 3968c19d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · silences the notice on any clean tree, so an unverified commit goes unmentioned · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · covers:a tree with no pass keeps the notice

## Invariants

- An unknown is said every time (ADR-005); only a standing fact is said once.
- A changed text is said: the hash is of the text.
- Compaction and clear lose the context, so they say everything.
- The pass read is the one `qh-check` uses, including its unseen-write veto.

## Risks

- A session started within three days does not hear a paragraph it never had in its own context; ADR-094's Consequences name it, and the publish advice and the first `qh-check` name the command.
- Moving `passedAlready` could change an import path for a test; no test imported it, and `qh-check.mjs` imports it from `lifecycle.mjs`.

## Stop Condition

Stop and ask if a locked test asserts a SessionStart paragraph on a second start, or if `passedAlready` cannot move without a behaviour change.

## Out of Scope

- Treating "Accepted — implemented" records as not in flight (deferred: docs/BACKLOG.md §372)

## Verification Log
- 2026-10-09 · 3968c19d* · exit 0 · `out=$(node --test --test-reporter=tap tests/standing-facts.test.mjs 2>&1) \ …` · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · ms:5071
- 2026-10-09 · 3968c19d* · exit 0 · `out=$(node --test --test-reporter=tap tests/standing-facts.test.mjs 2>&1) \ …` · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · ms:5188
- 2026-10-09 · 3968c19d* · exit 0 · `out=$(node --test --test-reporter=tap tests/standing-facts.test.mjs 2>&1) \ …` · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · ms:5333
- 2026-10-09 · 3968c19d* · exit 0 · `out=$(node --test --test-reporter=tap tests/standing-facts.test.mjs 2>&1) \ …` · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · ms:8122
- 2026-10-09 · 3968c19d* · exit 1 · `out=$(node --test --test-reporter=tap tests/standing-facts.test.mjs 2>&1) \ …` · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · ms:2672 · test-lock-sha256:46480c5460c77b18c7c061bee102cef38925948e3c9970468f38b65b235cebae · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc3RhbmRpbmctZmFjdHMudGVzdC5tanMJYSBzdGFuZGluZyBwYXJhZ3JhcGggaXMgc2FpZCBvbmNlIHBlciByZXBvc2l0b3J5IGZvciB0aHJlZSBkYXlzIGFuZCBhZ2FpbiB3aGVuIGl0cyB0ZXh0IGNoYW5nZXMJMDQxZDY5ZWJlYWI3Y2Q2OTg2OTZjNGQxNGUwOTYwN2RiZTFhMjIzMThlYzRkNTVlOTdjOTA1MTdhNTE3N2UwMApib2R5CXRlc3RzL3N0YW5kaW5nLWZhY3RzLnRlc3QubWpzCWEgdHJlZSB3aXRoIG5vIHBhc3Mga2VlcHMgdGhlIHByZXZpb3VzLXNlc3Npb24gbm90aWNlLCBjbGVhbiBvciBkaXJ0eQlkZTQ2YzRmM2Y3OGY5ZWQ0MDM3YjUwMmZkOGUyMmE3MTk0NjMwNGE0NDYyMzk1YzAyMzc5MDQ4MTkyMTViNTY2CmJvZHkJdGVzdHMvc3RhbmRpbmctZmFjdHMudGVzdC5tanMJY29tcGFjdGlvbiBhbmQgY2xlYXIgc2F5IGV2ZXJ5IHBhcmFncmFwaCBhZ2FpbgliN2M5NjAyOTNjZjczNDc5OWE3ZWJlNGNlNGEyYzE5ZGFiMTMxYWFjZDdkMzkzN2JlYzgyNGY0YmJkZWEyZGRlCmJvZHkJdGVzdHMvc3RhbmRpbmctZmFjdHMudGVzdC5tanMJdGhlIHByZXZpb3VzLXNlc3Npb24gbm90aWNlIGlzIHNpbGVudCB3aGVuIGEgcGFzcyBpcyByZWNvcmRlZCBmb3IgdGhlIGN1cnJlbnQgdHJlZQk1MDhjMWU2NjcyYTRlMGY4ZjA1ZGUzNGFiZjQ4ZWM1MzBjMTE1YTBmYmY4OTZkYWEwODFiM2NkMzRkYjU4OWNj
  ```
  ```
- 2026-10-09 · 3968c19d* · exit 0 · `out=$(node --test --test-reporter=tap tests/standing-facts.test.mjs 2>&1) \ …` · acceptance-sha256:63604aacd5594fdc829604e01314d609f54a93879f3efb650f4df4345f3e20d2 · ms:5557
