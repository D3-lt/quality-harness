# Task ADR-088-T2: the publish verdict counts only check events its ledger holds

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one filter and one clause in one file, one new test file, one relocked test, campaign entries)
**Owner:** unassigned
**Produces:** `ledgerBoundLog(cwd, log)` — the session log with every check event `checks.jsonl` does not hold removed, and a count of what was removed
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an unbound check event never clears the refusal`, `a check event the ledger holds still clears it`, `a torn ledger binds nothing and refuses nothing`

## Goal

`publishVerdict` judges a session log whose `check.*` events, except `check.source-unreadable`, each name a
`checks.jsonl` record with the same id, the same grade by `checkEventName` and the same `after.tree`. Every
other check event is dropped and named. When `checks.jsonl` was not read whole, nothing is dropped.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `ledgerBoundLog(cwd, log)` (new, beside `importCheckRecords`, reusing its parse and `checkEventName`); `publishVerdict`'s read (`:5181`) calls it, which is what selects it for rule P and for git's hook through `publish-hook.mjs`; the refusal text gains one clause when events were dropped |
| `tests/publish-ledger-binding.test.mjs` | add | the three new tests below |
| `tests/fail-open.test.mjs` | edit (relock) | `an unresolved check order is not worded as unchecked` (locked by ADR-066 T1): its hook half seeds `checks.jsonl` records `a` and `b` beside the session events it already appends. Its assertions are unchanged |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write the three new tests in this task's Tests table and record the red run (TDD red). Red today: every "must still refuse" row is allowed or advised (ADR-088 Context). Before writing, re-run the enumeration of tests that put check events into a session log through a hook: `mrw read --grep "sessionLogFile\(|appendEvent\(" tests`. Only the two locked tests ADR-088 Context names may reach a hook, and only the ADR-066 one may reach `publishVerdict`. Run `python3 scripts/test-locks.py tests/fail-open.test.mjs` and confirm the lock. Then STOP for the owner's relock approval (Stop Condition).
2. [S2] Add `ledgerBoundLog`. It reads `checks.jsonl` as `importCheckRecords` does.
   - If the ledger is absent (ENOENT), every check event is unbound.
   - If it is not read whole, it returns the log unchanged.
   - Otherwise it keeps a `check.*` event only when the event's `record` is a string naming a record whose `checkEventName` and `after.tree` equal the event's.
   - `check.source-unreadable` is always kept.

   It keeps the log's `complete` flag, and it never writes.
3. [S3] In `publishVerdict`, read `ledgerBoundLog(cwd, readEvents(cwd, session))` in place of the bare read. When events were dropped, append one clause to the text: "N check event(s) in this session's log name no `qh-check` record and were not counted."
4. [S4] Relock `an unresolved check order is not worded as unchecked` through `adr-verify --relock` (ADR-052), after the owner approves. Its hook half appends to `checks.jsonl` a passed record `a` and a failed record `b` on the observed tree. Its session events keep `record: 'a'` and `'b'`. Its assertions stay byte-identical.
5. [S5] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`. [proof: mutation]
   - Drop the filter: the refusal test goes red.
   - Drop the tree comparison: the refusal test's "another tree" row goes red.
   - Bind on a torn ledger: the torn test goes red.

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/publish-ledger-binding.test.mjs tests/fail-open.test.mjs 2>&1) \
  && for t in 'a check event the ledger does not hold does not clear the refusal' 'a torn ledger binds nothing and refuses nothing' 'git refuses a pass the ledger does not hold' 'an unresolved check order is not worded as unchecked'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a check event the ledger does not hold does not clear the refusal` | `tests/publish-ledger-binding.test.mjs` | through the real PreToolUse hook, an unchecked scratch repository whose declared check exits 1 is still `deny` for `git commit` after each of these is appended to the session log: `{event:'check.passed', after:{tree}}`; the same naming `record:'no-such-record'`; a real failed `qh-check` record's id relabelled `check.passed`; a real passed record's id from another tree with `after.tree` edited to this one; `{event:'check.timeout', after:{tree}}`. The text names the dropped events. CLEAN twin: after a real `qh-check` pass on the tree, and again with that pass's event appended a second time, the decision is not `deny` | none | S1, S2, S3 |
| `a torn ledger binds nothing and refuses nothing` | `tests/publish-ledger-binding.test.mjs` | with one unparseable line in `checks.jsonl` and a forged session pass, the decision is not `deny`, and the text says whether the repository is checked is unknown (ADR-061's could-not-look). DIRTY twin: the same forged pass with the ledger whole is `deny` | none | S1, S2 |
| `git refuses a pass the ledger does not hold` | `tests/publish-ledger-binding.test.mjs` | through `plugin/scripts/publish-hook.mjs` as `tests/publish-hook.test.mjs` drives it, a forged session-log pass does not let an unchecked commit through git's own hook. CLEAN twin: a real `qh-check` pass does | none | S1, S3 |
| `an unresolved check order is not worded as unchecked` | `tests/fail-open.test.mjs` | the locked ADR-066 test after S4's relock: an order that cannot be established, now backed by ledger records, is still worded as unknown and not refused | none | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three new tests |
| 2 — something selects it | `publishVerdict` calls `ledgerBoundLog`, and both PreToolUse rule P and `publish-hook.mjs` call `publishVerdict`; the refusal test runs the real hook, so deleting the call turns it red |
| 3 — the caller can discover it | the refusal text names the dropped events |
| 4 — it is used | every publish in an unchecked session; nothing measures dropped events yet |

## Mutation Log

## Invariants

- An event `importCheckRecords` wrote from a whole ledger is never dropped.
- A ledger not read whole never yields a refusal that the same log without the filter would not.
- No reader other than `publishVerdict` changes, and no pure function's signature changes.

## Risks

- A ledger deleted while a session log survives turns honest passes into a refusal until `qh-check` runs again. On 2026-10-06 none of the 5,543 events on this machine was unbound. The clause in the text says why a pass did not count, so the remedy is named.

## Stop Condition

Stop and ask before S2 unless the owner has approved relocking `an unresolved check order is not worded as unchecked`. Stop also if the enumeration in S1 finds another locked test that seeds unbound events through a hook that reaches `publishVerdict`, or if any CLEAN twin is refused.

## Out of Scope

- The row sha width — T1. Binding the Stop, SessionStart, SessionEnd and statusline readers, a hand-written `checks.jsonl` line, and a pass of another command — ADR-088 Out of Scope.

## Verification Log
