# ADR-021: A row removed from an evidence log is a change to the evidence

**Status:** Proposed
**Date:** 2026-09-01
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-010-a-claim-is-re-checked-or-it-is-not-counted.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-020-a-run-leaves-a-trace-outside-the-file.md, docs/BACKLOG.md §101
**Governs:** `plugin/bin/adr-lint`, `tests/gate-regressions.py`
**Enforced-by:** `lint: a committed evidence row that has gone missing is reported`

<T1 creates this label. `adr-lint` advises on it until then, which is the correct
report for a record that is accepted and unexecuted.>

**Invalidates:** none — checked. ADR-010 requires a claim to be re-checkable and this makes one more of the log re-checkable; ADR-020 added a field to the entry and is untouched; ADR-005 governs how a gate reports what it did not observe, which this obeys by staying silent when git cannot answer.
**Served-path change:** `adr-lint` advises when a Verification Log row that HEAD holds is absent from the working file — where today removing the red run from a log is invisible and the log then implies a red-green cycle that did not happen.

## Context

Every field in a Verification Log entry is defended. The acceptance digest binds
a row to the fence it proved (GitHub issue #4). The duration is a value the file
cannot produce (ADR-020). A digest-less row that HEAD does not already carry is
refused. All of it defends what a row SAYS.

**Nothing defends the log against a row being taken out**, and that was measured
rather than assumed on 2026-09-01, through the `adr-lint` CLI on a git fixture
with three committed rows — one `exit 1`, two `exit 0`, all carrying the current
fence digest:

| removed from the committed log | what `adr-lint` said |
|---|---|
| nothing (baseline) | two findings, both about the fixture and unrelated |
| the RED `exit 1` row | **identical to baseline** |
| one of the two GREEN rows | **identical to baseline** |
| every row | caught — `T1 marked done but its Verification Log has no exit-0 entry` |

The RED row is the one that matters. Deleting it makes the log imply a red-green
cycle that did not happen — and this corpus already knows that claim is worth
defending, because two task files currently disclose it BY HAND in prose, in
notes explaining that their first entry is not a red run. A prose disclosure
nobody checks is what this project exists to replace.

The `every entry passed, so nothing shows the fence could fail` advisory does not
cover it: a `## Mutation Log` entry suppresses that advisory, correctly — a
killed mutant IS evidence the fence can fail — which is precisely why it cannot
also serve as the deletion detector.

## Existing Primitives Audit

`committed_lines(path)` already exists in `plugin/bin/adr-lint` and is already
CALLED by `check_verification`, two lines above the digest-less notice, as
`known`. The committed rows are in hand at the point the present rows are read.
Nothing new is needed to see the difference; the difference is simply not looked
at. `VLOG_RE` already identifies an entry line. Both are used by this decision
rather than replaced.

## Decision

`adr-lint` advises when a line the committed file holds, which parses as a
Verification Log entry, is not present in the working file.

Three constraints, each of them this repository's existing rule rather than a new
one:

1. **Silent when git could not answer.** `committed_lines` returns `None` for
   "I could not look" — no repository, no git, a file never committed, a detached
   or empty HEAD. The check is guarded on `known is not None`, exactly as the
   digest-less notice beside it is. A filter that could not look must never report
   absence (ADR-005, CLAUDE.md §3).
2. **Entry lines only.** `committed_lines` returns EVERY line of the committed
   file. The comparison runs over lines matching `VLOG_RE` on both sides, or the
   check fires on ordinary prose edits — including the correction notes this
   corpus writes into task files routinely.
3. **Advisory, never blocking.** Removing a row is sometimes legitimate: a log
   rewritten because its fence changed, a record being retired, a corpus being
   restructured. The gate says what it noticed and lets the work proceed.

## Alternatives Considered

- **Hash-chain the log** — each row carrying the digest of its predecessor, so a
  deletion or a reordering breaks the chain. Rejected, and the reasoning is the
  substance of this record: it costs a new field, a dated cutover, invalidation
  semantics, and a change to what `adr-verify` writes, to answer a question git
  already answers from data the function already holds. A chain beats git in
  exactly one place — where `committed()` returns `None`, meaning a corpus copied
  without its `.git` or a rewritten history. Nothing has reported that, so it is
  named as the boundary and not built. If it is ever reported, this record is
  where to start.
- **Block instead of advise.** Rejected under the project's standing rule, and
  more specifically because legitimate deletions exist and a gate that cannot tell
  them apart would be asserting a judgement it has not made.
- **Do nothing; git review catches it.** Rejected because the digest-less notice
  already rejected it — that check exists precisely because "somebody would notice
  in review" was not sufficient for the field beside this one.

## Component / Boundary Impact

One function in one gate. No new file, no new field, no change to what
`adr-verify` writes, no change to what `adr-next` reads.

## Wiring & Contract Changes

None — implementation-internal only. The entry grammar is unchanged, so no reader
drifts and no corpus needs rewriting.

## Inter-task Contracts

None — one task.

## Implementation

See `tasks/`.

## Consequences

A corpus whose history is rewritten (squash, force-push, a fresh repository) will
have every task's committed rows disappear at once. That reads as many findings
in one run, which is noisy but correct: the evidence really did stop being
re-checkable, and the advisory says so rather than failing.

## Out of Scope

- Hash-chained entries (permanent: boundary: git answers this from data the function already holds, and a chain earns its cost only where git cannot answer at all — a case nothing has reported)
- Any binding on the Mutation Log (deferred: docs/BACKLOG.md §98)
- Reclassifying a mutant that does not parse (deferred: docs/BACKLOG.md §102)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The check fires on every task in a corpus with no `.git` | Med | High | `known is not None` guard, with a test arm asserting SILENCE when `committed()` returns `None` — the must-fail direction of ADR-005 |
| The check fires on ordinary prose edits | Med | Med | Both sides filtered through `VLOG_RE`; asserted on a fixture whose prose changed and whose log did not |
| A legitimate rewrite reads as tampering | Low | Low | Advisory, and the message says re-running `adr-verify` on a clean tree is the repair |

## Rollback

Delete the call. The advisory disappears and nothing else changes; no data
written under this decision needs migrating, because it writes nothing.

## Follow-ups

Count how often this fires on honest work in the first month. If it fires on
anything other than a rewritten history, the filter in constraint 2 is wrong and
this record should be narrowed rather than the finding argued with.
