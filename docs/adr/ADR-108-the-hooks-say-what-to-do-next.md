# ADR-108: The hooks say what to do next, the mrw way

**Status:** Accepted
**Date:** 2026-10-17
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-17, asked where else the mrw idiom applies and said "take em, by force!" to the three hook-text sites below and the two adr-verify changes that ship without a record
**Cross-references:** docs/adr/ADR-051-unproven-advise-does-not-invent-writes.md, docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-107-the-plugin-works-the-mrw-way.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; each adds catalogue mutants, and naming them before they exist would be a pointer to nothing.
**Served-path change:** the Stop finding's sentence when the last check could not start (T1); one sentence in the subagent contract (T2); one new turn-end finding, said once per tree, when a turn's recorded writes left the observed tree unchanged (T3).

## Context

ADR-107 put the mrw way where an agent that invokes a skill reads it. The benchmark that motivated it (ADR-106's Stage 5,
block 1, read 2026-10-17; the figures stay outside this repository, CLAUDE.md §6) showed that the plugin's sessions
invoked no skill at all: what reached those agents was hook text, and the cost the plugin added was the verification round
ADR-096 asks for, in checkouts where the declared check could not start because a test dependency was missing. The agent
was told to run `qh-check`, ran it, read "unstarted" or "unproven", and had nothing in front of it saying what to do with
that. mrw's rule for a refusal is that it names what to do; the Stop finding names what to do only when the check can run.

Three sites in hook text carry that rule poorly, and each is paid by every adopter in every session, so each change is one
sentence and is measured by ADR-107 T4's stage:

1. **The Stop finding** (`plugin/scripts/completion-rules.mjs`, `uncheckedWorkReason` near line 481; `couldNotLook` is
   already an arm). When the last check on this turn's work did not start or was unproven, the finding says it could not
   observe the work and then asks for `qh-check` again. The agent's reply in the benchmark was to run it again.
2. **The subagent contract** (`subagentContract`, near line 374): every spawned implementer gets it; no skill reaches one
   that was not invoked. It says how to scope an edit and when to run the check, and nothing about how to read and edit.
3. **A write that changed nothing** is mrw's founding failure: a write that matched nothing reports success everywhere
   except in mrw. The plugin records every Write and Edit as a `file.written` event with its path (`check-ledger.mjs`,
   `recordFileWritten` near line 328) and observes the tree at the boundaries (`tree-facts.mjs`, `observe`). It can say,
   at turn end, that paths were written and the observed tree did not change since the last observation, which is what
   an Edit whose `old_string` matched nothing looks like from outside. ADR-051 bounds this: only proven paths are named,
   and an unobservable tree says nothing.

The class: hook text that tells an agent what to do next. Enumerated 2026-10-17 by `rg -n "queueAction\(|actions.push\(" plugin/scripts/completion-rules.mjs plugin/scripts/lifecycle.mjs plugin/scripts/publish-verdict.mjs` — every
turn-end rule and the publish verdict. Left out: the publish verdict (ADR-061, ADR-081; it already names the command to
run), the decision-context hand-off at an edit (ADR-092; it hands over records, not instructions), and SessionStart
orientation (ADR-094, ADR-107 T3; already one standing paragraph per fact).

## Existing Primitives Audit

- **`validationVerdict`** (`completion-rules.mjs` near line 208) already distinguishes `unstarted`, `timeout` and
  `unproven` from `failed`; `checkStanding` and the ledger carry them as `check.unstarted`, `check.timeout`,
  `check.unproven`. T1 reads what is already recorded and changes one sentence; no new classification.
- **`couldNotLook`** in `uncheckedWorkReason`: the arm that says the check could not observe the work. T1 gives it the
  rest of the sentence.
- **`emittedFor` and the per-tree keys** (ADR-060, ADR-096): T3's finding uses the same once-per-tree identity, as R1 does.
- **`unobservableWrites`** (`check-ledger.mjs` near line 562): the writes git cannot see; T3 is the complementary case, a
  write git could see and did not.

## Decision

1. **A check that could not start says what to do instead of asking again (T1).** When the latest check event on the
   turn's work is `check.unstarted`, `check.timeout` or `check.unproven`, the Stop finding names it and says: say which it
   was, with what the check printed, as `EVIDENCE-LIMITED: <reason>` in the final message, and do not run it again on the
   same tree; a check that could not start on an unmodified tree is a finding about this machine, and declaring the real
   command as `check` is the fix. Nothing else in the finding changes; a check that ran and failed is still a failure.
2. **The subagent contract carries the mrw way in one sentence (T2).** After the role line: read every site you will
   touch before the first edit, make the edits as one batch, and check that each edit landed, since an edit that matched
   nothing is a failure. It points to the `execution` skill's section by its heading for the rest.
3. **A turn whose writes left the tree unchanged is told so (T3).** A new turn-end rule, W: when this turn recorded
   `file.written` events under the repository for proven paths, the observed tree is readable, and it equals the
   observation before the first of those writes, the finding names the paths and says the tree they were written to did
   not change, so the write may have matched nothing. Said once per tree to each audience (ADR-096), advisory, and never
   for a path the tree cannot see (ADR-051: unobservable is unknown, not unchanged).

**This fails if**, through the real Stop hook: a turn whose last check was recorded `unstarted` is still told only to run
`qh-check`; a spawned implementer's contract has no sentence about reading and editing in batches; a turn with a recorded
Edit whose `old_string` matched nothing ends with no finding; or a turn whose Edit changed the file is told its write did
nothing.

## Alternatives Considered

- **(a) Put all three into skills.** Rejected: the measurement says the skills were not invoked; the sites here are the
  text those sessions did read.
- **(b) Compare file content before and after each Edit, in PostToolUse.** Rejected: the hook receives a path and a
  response, not the bytes; reading every written file at every PostToolUse is a cost on the hottest path, and the tree
  observation the boundary already makes answers the same question for free.
- **(c) Have T1 stop the verification round entirely when a check cannot start.** Rejected: ADR-096's finding is what
  turned an unverified "done" into an honest "not done" in the benchmark; the finding stays, and what changes is that it
  says what to do.
- **(d) Say T3's finding at the PostToolUse of the write.** Rejected: ADR-096 puts findings for the agent at turn end,
  and a batch of edits is judged whole, as mrw judges a plan.

## Component / Boundary Impact

None — three sentences in `completion-rules.mjs` and one new turn-end rule beside R1, R2 and R4. The host boundary, the
ledgers' formats and the session log's events are unchanged; W writes `action.emitted` rows as the other rules do.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Stop / SubagentStop R1 finding | the could-not-start arm says what to do, and names the verdict it read | T1 | the agent (ADR-096), the user's `systemMessage` |
| SubagentStart contract | one sentence on reading and editing in batches | T2 | every spawned role |
| Stop / SubagentStop rule W | a new finding, once per tree, when recorded writes left the observed tree unchanged | T3 | the agent, the user, the session log's `action.emitted` dedupe |

## Inter-task Contracts

None — the tasks are independent; T3 reads the facts `completionFacts` already gathers.

## Implementation

See `docs/adr/ADR-108-the-hooks-say-what-to-do-next/tasks/README.md`.

## Consequences

- **Positive:** an agent whose check cannot start is told to report it and stop, not to try again; a spawned implementer
  hears the mrw way without invoking a skill; an edit that matched nothing is named before the turn ends with it.
- **Negative:** one sentence more in the subagent contract on every spawn; one more finding class to read at turn end.
- **Neutral:** ADR-107 T4's stage measures whether the first two lower turns per attempt; if they do not, they are two
  sentences to remove.

## Out of Scope

- The publish verdict's wording (permanent: boundary: ADR-061 and ADR-081 own it, and it already names the command)
- Reading written files' bytes at PostToolUse (permanent: boundary: alternative (b); the tree observation is the measurement)
- A batching cue in every session's SessionStart (deferred: ADR-107 T4)
- The naming of a FAILED check's run in R1's repeated text (deferred: docs/BACKLOG.md §381, the R1 repeat line)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| W fires on a turn whose writes were then reverted by the agent | Med | Low | the finding says "may have matched nothing" and names the paths; a revert is one reading of an unchanged tree, and the agent can say so |
| W fires when the tree observation is stale or partial | Low | Med | W needs two readable observations of the same session; an `ok: false` observation on either side says nothing (ADR-005) |
| T1's sentence is read as permission to skip verification | Low | Med | it asks for `EVIDENCE-LIMITED:` with the check's own output, which ADR-035 reads as not a completion claim |

## Rollback

Revert the tasks' commits. No stored format changes; older readers ignore rule W's `action.emitted` rows.

## Follow-ups

- [x] Owner decision: Accepted by the owner, 2026-10-17 ("accepted").
