# ADR-105: A commit its declared fast check passed on is not named unchecked at turn end

**Status:** Accepted
**Date:** 2026-10-16
**Owner:** Zy
**Spec:** None — no spec stage; the owner chose "Silent, via ADR" on 2026-10-16, asked why the Stop hook named four commits that `qh-check --fast --commit` had made ("since it is our own tool, we can fix that")
**Cross-references:** docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-100-a-repeated-procedure-is-one-command.md, docs/adr/ADR-101-one-reader-per-check-ledger.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. T1 adds one campaign mutation per mechanism; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-081 — "No reader of a full pass opens that file": the turn-end rule R2 now opens `fast-checks.jsonl`, through `latestFastPass`, to stay silent about a commit whose tree its latest fast record passed on. Nothing that grants a publish, a skip or a release reads it.
**Served-path change:** at Stop and SubagentStop, rule R2 no longer names a newly reachable commit whose tree the project's declared fast check passed on.

## Context

- **What was seen, 2026-10-16, in this repository.** Commits 36cdcafd, 3c6fe6ac, 271a698b and 5a8c6e73 were each made by
  `node plugin/scripts/qh-check.mjs --fast --commit`, the form ADR-081 and ADR-100 sanction and this project's own procedure
  asks for (fast per commit, one full check before the push). The tip, 2db78927, then passed the full check and was pushed.
  At turn end R2 said "4 newly reachable commits are unchecked — no `qh-check` has passed on their trees" and asked for a
  full check of each, which the sanctioned procedure never runs.
- **Why R2 says it.** `completionJudgement` (`plugin/scripts/completion-rules.mjs:657-665`) keeps a commit unless
  `checkStanding(log, commit.tree) === 'passed'`, and `checkStanding` reads full-check events only: a fast record lives in
  `fast-checks.jsonl`, which ADR-081 keeps away from every reader of a full pass.
- **Why most fast-committed commits were silent anyway.** R2 also skips a tree rule P already named
  (`namedByPublish`, `plugin/scripts/check-ledger.mjs:540-543`). Read from this session's log: dd5f2748, 3bff7696 and
  ab0f4983 had a P event whose `detail.tree` was their own tree; 36cdcafd's one P event carried the working tree 2a2c85e7,
  not its committed tree e0bfd693. So whether a fast-committed commit was named depended on which tree a hook happened to
  observe, not on anything about the commit.
- **The fast records hold the committed tree.** In `.git/quality-harness/fast-checks.jsonl`, each of the four named commits
  has a record whose `after.tree` and `after.index` both equal the commit's tree, `exit` 0 (271a698b's latest record is the
  passing retry, after a failed first run). `latestFastPass(cwd, tree, root)` (`check-ledger.mjs:51-54`) answers exactly
  this: the latest fast record on that tree grades `check.passed`, and no write git cannot see was logged after it.
- **The class: every site that decides whether a tree counts as checked.** Enumerated 2026-10-16 with
  `git grep -n -E 'checkStanding\(|latestFastPass\(|passedAlready\(' -- plugin/scripts`: 20 lines in 5 files. Their
  dispositions:
  - `completion-rules.mjs:660`, R2's commit filter — the one site this record changes.
  - `completion-rules.mjs:418, :442-443, :647, :692` (R1 and the nudge on the observed working tree) and `:573, :576`
    (`ledgerEvidence`, the completion claim's evidence, ADR-035) — unchanged, see Out of Scope.
  - `publish-verdict.mjs:194, :236-237` — already reads a fast pass for one proven commit (ADR-081); unchanged.
  - `qh-check.mjs:80, :282-283` and `session-notes.mjs:183` (`passedAlready`, the skip) — full pass only; unchanged.
  - `check-ledger.mjs:51, :121, :484` — the definitions.

## Existing Primitives Audit

- **`latestFastPass`** (`plugin/scripts/check-ledger.mjs:51-54`): reused as is; it already applies ADR-101's strict ledger
  read and the unseen-write veto (BACKLOG §343).
- **`completionFacts`** (`plugin/scripts/completion-rules.mjs:594-618`): the one place the turn-end rules read the world; the
  fast answer is read there, so `completionJudgement` stays a pure function of its facts (`tests/pure-judges.test.mjs`).
- **`sessionCommits`** (`plugin/scripts/tree-facts.mjs:304`): unchanged; each commit it returns carries `tree`.

## Decision

1. **`completionFacts` reads each newly reachable commit's fast standing (T1).** For every commit `sessionCommits` returns, it
   asks `latestFastPass(input.cwd, commit.tree, root)`, once per distinct tree, and marks the commit `fastPassed: true` when that answers. Nothing else
   in the facts changes; a failed or vetoed read is `fastPassed: false`.
2. **R2 leaves a fast-passed commit out (T1).** `completionJudgement`'s commit filter returns false for a commit with
   `fastPassed`, beside the existing `checkStanding === 'passed'` arm. Such a commit is not named, not keyed and not deduped:
   it was checked by the command the project declared for commits.
3. **Nothing that grants anything reads it.** The publish refusal (ADR-061, ADR-081), `passedAlready` and its skip,
   `release-evidence`, R1, the nudge and the completion claim's `evidence` keep reading full passes only. A push still needs
   the full check on its tree.

**This fails if**, through the real Stop hook in a repository with a declared `fastCheck`: a commit made after a passing
`qh-check --fast` on its tree is named by R2; or a commit whose fast record failed, whose tree has no fast record, or whose
fast pass was on a different tree (a partial stage) is not named; or the completion claim's `evidence` for that turn changes.

## Alternatives Considered

- **(a) One soft line per boundary** ("N commits passed the fast check only; the push needs the full check"). Rejected by the
  owner, 2026-10-16: it repeats a fact the push already enforces, at every turn end.
- **(b) Leave R2 and document it in ADR-081's Follow-ups.** Rejected: the finding asks for work the sanctioned procedure
  never does, and whether it appears is a coincidence of which tree P observed.
- **(c) Count a later full pass on a descendant as covering its ancestors.** Rejected: a pass on the tip proves nothing
  about an intermediate tree, which can be broken while the tip is fine.
- **(d) Write fast records into the session log as `check.*` events.** Rejected under ADR-081: every full-pass reader would
  then read them, the rollback hazard that record avoided.
- **(e) Read the fast standing inside `completionJudgement`.** Rejected: the judgement reaches no file
  (`tests/pure-judges.test.mjs`); facts are read in `completionFacts`.

## Component / Boundary Impact

None — internal to the turn-end rules (`plugin/scripts/completion-rules.mjs`). The host boundary, the ledgers' formats and
the session log's events are unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Stop / SubagentStop R2 finding | a commit whose tree's latest fast record passed is not named | T1 | the agent (ADR-096), the user's `systemMessage`, the session log's `action.emitted` dedupe |
| `completionFacts` commits | each carries `fastPassed` | T1 | `completionJudgement` |

## Inter-task Contracts

None — one task.

## Implementation

See `docs/adr/ADR-105-a-fast-committed-commit-is-checked-at-turn-end/tasks/README.md`.

## Consequences

- **Positive:** the sanctioned fast-commit procedure ends a turn without a finding that asks for work it never does, and
  the remaining R2 findings name commits nothing checked (a commit made by a script, a rebase, a pull).
- **Negative:** one `fast-checks.jsonl` read per newly reachable commit at turn end; the ledger is small and the read is the
  one `publish-verdict.mjs` already makes per commit.
- **Neutral:** a commit fast-checked in another session of the same checkout is also silent, since the ledger is per git
  directory, as the publish advisory already treats it.

## Out of Scope

- R1 and the nudge on the observed working tree (permanent: boundary: after a fast commit the working tree is the next push's, and rule P already names it at the commit event)
- The completion claim's `evidence` (permanent: boundary: ADR-035 measures false success against full-check evidence; a fast pass is not that)
- A push, `passedAlready`, `release-evidence` (permanent: boundary: ADR-081 keeps them full-pass only, and this record does not touch them)
- A fast pass on a working tree that differs from the commit's tree (permanent: boundary: what the commit records was not itself checked, as ADR-081's advice already says)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A fast check that tests too little silences R2 for a broken commit | Med | Low | the project owns its `fastCheck` (ADR-081, ADR-103); the push still needs the full check on the tip |
| A torn `fast-checks.jsonl` reads as passed | Low | Med | `ledgerPass` reads strictly and answers null on a torn tail (ADR-101 T2) |
| The read slows the Stop hook on many commits | Low | Low | one strict read per commit; R2 names at most five and the read is cached per tree |

## Rollback

Revert T1's commit. No stored format changes; older code ignores `fastPassed`.

## Follow-ups

- [x] Owner decision: Accepted by the owner, 2026-10-16 ("accept").
