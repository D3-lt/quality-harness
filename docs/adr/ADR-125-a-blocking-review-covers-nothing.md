# ADR-125: A plugin commit is reviewed only when the newest review covering it did not request changes

**Status:** Accepted
**Date:** 2026-10-22
**Owner:** Zy
**Spec:** None — no spec stage; the owner's instruction of 2026-10-22, "fix the review coverage"
**Cross-references:** docs/adr/ADR-100-a-repeated-procedure-is-one-command.md, scripts/release-evidence.mjs, plugin/scripts/host-review.mjs
**Governs:** `scripts/release-evidence.mjs`
**Enforced-by:** None — declared by its task; it adds one campaign mutation.
**Invalidates:** ADR-100, narrowly — its T1 decided "a review's own status is said, never judged" (`scripts/release-evidence.mjs:424-425`), so a review that ended REQUEST CHANGES covered every commit in its range. Its other clauses stand: a review that did not finish or said nothing readable still covers nothing.
**Served-path change:** `node scripts/release-evidence.mjs <sha>` answers UNPROVEN, with the next action named, while a plugin commit since the last tag has only a review that requested changes as its newest covering review.

## Context

`reviewEvidence` (`scripts/release-evidence.mjs:427-472`) counts a ledger row as coverage when its status is in
`REVIEW_COVERING` (`plugin/scripts/host-review.mjs:220`: `clean`, `blocking`, `evidence-limited`). A `blocking` row is a
review whose last verdict was REQUEST CHANGES. So a release could rest on a review that asked for changes nobody made: the
release gate read "reviewed" where the reviewer said "not yet". Raised as an open owner decision on 2026-10-22, answered the
same day: fix it.

CLAUDE.md §12 already names what follows a review that asked for changes: one scoped verification review of each fix round.
That review's row is what should clear the commits, and it is the newest row covering them.

## Existing Primitives Audit

- `reviewEvidence` already finds the rows covering each commit (`holds`, :455-457) and returns `unproven` with a `kind`.
  **Extended:** for each commit the NEWEST covering row decides; ledger order is append order, so the newest is the last.
- `tagAdvice(kind)` (:565-586) names the next action per kind. **Extended:** a `blocked` kind.
- `REVIEW_COVERING` stays the definition of "a review that ran and said something"; `branch-state` reads it for the status
  line, which is not a release gate and is left as it is.

## Decision

A plugin commit since the last tag is reviewed when the newest recorded review covering it finished with a verdict other
than REQUEST CHANGES (`clean` or `evidence-limited`). When the newest covering review is `blocking`, the commit is not
reviewed: `release-evidence` answers UNPROVEN, kind `blocked`, names the commits, and says to run the scoped verification
review of the fix round (CLAUDE.md §12) over them. An older blocking row followed by a newer clean one covering the same
commit is cleared; a newer blocking row after a clean one is not. *This fails if* a commit whose newest covering review is
blocking is reported reviewed, or one whose newest covering review is clean is reported blocked.

## Alternatives Considered

- **Count any non-blocking row, whatever came after:** rejected. A later review that asked for changes would be hidden by
  an earlier clean one.
- **Read the findings and judge which were fixed:** rejected. The ledger holds no such fact, which is why ADR-100 left the
  status unjudged; the reviewer's newest verdict is the fact it holds.
- **Drop `blocking` from `REVIEW_COVERING`:** rejected. `branch-state` uses it to say a review ran, which a blocking one did.

## Component / Boundary Impact

`scripts/release-evidence.mjs` only. Repository tooling, not the plugin.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `release-evidence` review verdict | a new UNPROVEN kind, `blocked` | T1 | `scripts/release.mjs` step 5, the person releasing |

## Inter-task Contracts

None — one task.

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** a release cannot rest on a review that asked for changes.
- **Negative:** a fix round now always needs its verification review recorded before the release, as §12 already says.
- **Neutral:** the status line keeps saying a review ran.

## Out of Scope

- Judging which findings a fix addressed (permanent: boundary: the ledger records verdicts, not findings resolved)
- `branch-state`'s reviewed line (permanent: boundary: it reports, it gates nothing)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Ledger order is not review order | Low | Med | rows are appended by the launcher when a review ends; the test asserts order decides |
| A verification review scoped to the fix alone leaves the original commit blocked | Med | Low | the advice names the commits; the verification review's range must include them |

## Rollback

Revert the task's commit; the release gate reads as before.

## Follow-ups

- [ ] Re-run the release's review over `v3.8.51..HEAD` before 3.8.52 is tagged.
