# ADR-101: One reader per check ledger

**Status:** Accepted
**Date:** 2026-10-13
**Owner:** the owner (repository maintainer)
**Spec:** None — no spec stage; phase 3 of the redesign plan the owner set on 2026-10-12 (`docs/BACKLOG.md` §378, the ADR-100 deferral)
**Cross-references:** ADR-060, ADR-081, ADR-088, ADR-094, ADR-097, ADR-100, `docs/BACKLOG.md`
**Governs:** `plugin/scripts/check-ledger.mjs`
**Enforced-by:** `ADR-101 T2: a torn last line after a pass is refused, not dropped`
**Invalidates:** none — checked: ADR-081's fast-pass rule, ADR-088's binding of the refusal to imported events and ADR-094's prose reuse keep every answer; only how many functions give it changes
**Served-path change:** None — this ADR changes only how the answers are computed; every hook's output and every publish verdict is unchanged, which the goldens hold.

## Context

The plan's phase 3 (2026-10-12) said: collapse `treeChecked`, `passedAlready` and `latestFastPass` into one function over a
named ledger, and at `git push` say the cached CI state. Read on 2026-10-13, the four readers in `plugin/scripts/check-ledger.mjs`
answer over two different authorities, by design:

- **The session log** (imported `check.*` events, ADR-088 binds the publish refusal to the ones `checks.jsonl` holds):
  `latestCheckFor` (`:376`), `treeChecked` (`:442`), `checkStanding` (`:449`). Callers: `completion-rules.mjs:418,442,573,576,
  647,660,692`, `publish-verdict.mjs:229-230`, `statusline.mjs:111`.
- **The ledger files read directly**: `passedAlready` (`:108`, `checks.jsonl`, same command, ADR-094's prose reuse) for
  `qh-check.mjs:79` and `session-notes.mjs:183`; `latestFastPass` (`:19`, `fast-checks.jsonl`) for `publish-verdict.mjs:187`.

Two duplications, found by reading:

- **`treeChecked(log, tree)` is `checkStanding(log, tree) === 'passed'`.** Both answer false for a torn log
  (`latestCheckFor` returns `LOG_INCOMPLETE` for a pass, `:383`; `checkStanding` returns `unknown`, `:450`), and both answer
  false when tied events disagree (`latestOf` returns the non-pass, `:439`; `checkStanding` returns `unresolved`, `:453`).
  Otherwise both read the same `latestOf` over the same events. Two spellings of one question are how ADR-005's guard ended up
  in one reader and not its siblings (`tests/observed-events.test.mjs:1592-1595` records that repair).
- **`passedAlready` and `latestFastPass` repeat one strict ledger read**: a last line without a newline proves nothing
  (`:28`, `:121`), an unparsable line or a row without an `id` answers null (`:32-34`, `:125-127`), the latest matching row by
  position must grade `check.passed` (`:38`, `:136`), and `unseenWriteSince` vetoes (`:39`, `:137`). They differ only in the
  file, the match (tree; or tree, command and ADR-094's code tree) and the seen-count key.

**The CI line at `git push` is not taken.** The per-prompt brief that says a red CI on every prompt was kept by ADR-097
(`docs/adr/ADR-097-remove-what-nothing-acts-on.md:100`) and ADR-094 T1 repeats a red run as one line; at a push the fact is
already in the agent's context. A second sentence is an always-on cost with no measured reader (CLAUDE.md §19).

The class: every function in `plugin/` that decides whether a check passed on a tree. Enumerated 2026-10-13 with
`mrw read --grep 'export function (latestCheckFor|treeChecked|checkStanding|passedAlready|latestFastPass|checkEventName|latestOf)' plugin/scripts/`:
all seven are in `check-ledger.mjs`. Left as they are: `checkEventName` (grades one record) and `latestOf` (orders events), which
both readers use.

## Existing Primitives Audit

- **`checkStanding`** is kept as the session log's one reader; `latestCheckFor` stays for the callers that need the record's
  `origin` and `command` (`completion-rules.mjs:448-449`, `statusline.mjs:111`), not for a verdict.
- **`unseenWriteSince`**, `checkEventName` and the strict-line rules are reused unchanged by the one ledger-file reader.
- **The publish goldens** (`tests/hook-goldens.test.mjs`), the decision tables (`tests/publish-judgement.test.mjs`,
  `tests/completion-judgement.test.mjs`) and `tests/evidence-flip.test.mjs`'s reader table are the net.

## Decision

1. **The session log has one verdict reader (T1).** `treeChecked` is removed; every caller asks
   `checkStanding(log, tree) === 'passed'`. `latestCheckFor` is no longer called for a verdict (`completion-rules.mjs:442`
   reads the standing) and stays for a record's fields. Before the removal, a test generates session logs (pass and fail
   events, duplicated imports, tied `seq` and `startedAt`, mixed stamped and unstamped, torn) and asserts the two spellings
   agree on every one; the same test then holds that `treeChecked` is gone.
2. **The ledger files have one reader (T2).** `ledgerPass(root, { file, seen, match })` reads one ledger strictly and answers
   the latest matching row's pass, or null for anything it cannot establish, with the unseen-write veto. `passedAlready` and
   `latestFastPass` keep their names and signatures (a locked test imports `passedAlready`: `tests/prose-reuse.test.mjs`,
   8 locks on 2026-10-13) and become calls of it. A shared table of ledgers (torn last line, unparsable line, row without an id,
   a later failing row, a later passing row on another tree, an unseen write after the pass, an unseen write before it) is run
   against both files and must give the same answer for both.

**This fails if** any hook golden, decision table or catalogue verdict changes; if a generated log exists on which
`checkStanding === 'passed'` and the removed `treeChecked` disagree; or if a row of the shared table answers differently for
`checks.jsonl` and `fast-checks.jsonl`. The generated logs and the table are built by the tests.

## Alternatives Considered

- **One function over every source, as the plan said.** Rejected: the session log and the ledger files are different
  authorities on purpose. The publish refusal reads imported events bound to `checks.jsonl` (ADR-088), with the session's
  baseline beside it; `qh-check` and the fast pass read the files with the same-command and unseen-write rules. One function
  would carry a mode flag for each, which is two readers wearing one name.
- **Say the cached CI state at `git push`.** Declined in Context: the brief already repeats a red run; no reader measured.
  What would re-open it: a session that pushed over a red run with the brief in its context.
- **Leave the duplication.** Rejected: the record of `tests/observed-events.test.mjs:1592-1595` is a guard fixed in one
  spelling and not its siblings; one reader per authority removes the place that happens.

## Component / Boundary Impact

None — internal to `plugin/scripts/check-ledger.mjs`, plus its callers' import lines.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `treeChecked` export | removed | T1 | `completion-rules.mjs` (calls `checkStanding`) |
| `ledgerPass` export | added | T2 | `passedAlready`, `latestFastPass` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| none | — | — | the two tasks touch disjoint functions |

## Implementation

See `docs/adr/ADR-101-one-reader-per-check-ledger/tasks/README.md`: T1 and T2, independent.

## Consequences

- **Positive:** four verdict readers become two, one per authority; a guard added to one is in every caller.
- **Negative:** catalogue entries on the removed lines are repointed, which costs a campaign run on `check-ledger.mjs` and
  `completion-rules.mjs` (CLAUDE.md §18: a refactor turns the old site's tests vacuous).
- **Neutral:** no output changes.

## Out of Scope

- Merging the session log and the ledger files into one source (permanent: boundary: ADR-088 binds the refusal to imported events read with the session's baseline, and the files are what `qh-check` writes; Alternatives)
- The CI line at `git push` (permanent: boundary: the per-prompt brief already repeats a red run, and ADR-097 kept it; re-open on a session that pushed over a red run with the brief in context)
- Phase 4, the owner's decision on CLAUDE.md §3 (deferred: docs/BACKLOG.md §378)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The equivalence holds on generated logs and not on a shape nobody generated | Low | Med | the generator covers each branch of `latestOf` and `checkStanding`; the goldens and decision tables are unchanged |
| A catalogue entry on a removed line is left pointing nowhere | Med | Low | `mutate.mjs --stale` in the fast check fails on it; the campaign on both files runs before a push |

## Rollback

Revert the two task commits; nothing persistent changes.

## Follow-ups

- [x] Name the enforcing tests and catalogue entries in `Enforced-by:` once they exist — done 2026-10-13; T1's equivalence is held by `tests/one-verdict-reader.test.mjs`, T2's by `tests/one-ledger-reader.test.mjs`
