# ADR-128: Say less, and measure what the agent does with what is said

**Status:** Proposed
**Date:** 2026-10-23
**Owner:** Zy
**Spec:** None — no spec stage; the owner's direction of 2026-10-23 ("context pollution … how effective vs noisy it is"; "we have to add metrics into event log … and then ask to summarize agents and adopters"; "yes, R2 check only head"), over the measurement in Context
**Cross-references:** docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-105-a-fast-committed-commit-is-checked-at-turn-end.md, docs/adr/ADR-121-a-watcher-that-steers-on-evidence.md, docs/adr/ADR-122-said-once-per-context.md, docs/adr/ADR-065-branch-state-serves-its-snapshot.md, docs/adr/ADR-067-the-publish-classifier-reads-the-command-as-the-shell-splits-it.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per mechanism.
**Invalidates:** ADR-060 — Decision step 14's R2 `unchecked-commits` is retired (T1); R1 keeps speaking for the tree. ADR-105 — its fast-committed exemption exists only for R2 and goes with it (T1).
**Served-path change:** at turn end no "newly reachable commits" finding is said; the per-prompt branch-state line is not re-sent when the only change is a commit this session made; the publish advisory is not said for a commit word inside a quoted heredoc body; an adopter can print a summary of how its sessions answered the plugin's findings.

## Context

Measured 2026-10-23 over one session in this repository (`node scripts/hook-footprint.mjs` over its transcript; one
compaction, 1,525 assistant messages, 704 tool calls): 47 plugin hook outputs, 19,997 characters, about 1.4% of the 1.42M
characters of tool output in the context. About 4 of the 47 were acted on (the session's own reading, not a metric):

| Output | Firings | Characters | Acted on |
|---|---|---|---|
| UserPromptSubmit branch-state line | 32 | 13,981 | about 1 |
| PreToolUse publish advisory ("only mentions commit or push") | 11 | 3,802 | 0 |
| SessionStart (incl. after the compaction) | 3 | 1,752 | 3 |
| PreToolUse artifact gate (a load timeout) | 1 | 462 | 0 |
| Stop | 0 | 0 | — |

The branch-state line is 70% of the plugin's text. ADR-122 already says an item once per context, and the line is re-sent
because its text changes: HEAD moves on every commit the session makes. The publish advisories fired on commands whose only
commit word sat in a quoted heredoc body (review contracts) while every commit went through `qh-check --commit`.

R2 cost nine review rounds in one release (BACKLOG §411, §416, §420): its upstream exclusion is a classifier over git's
ref names and configuration, and each round found one more spelling. What R2 adds over R1 is a commit below HEAD whose tree
never passed: a bisect or cherry-pick hazard, not a claim about the work the turn ends on, which R1 already judges. The
owner's call (2026-10-23): R2 checks HEAD only. R1 speaks for HEAD's tree (ADR-060: R2 excludes "the observed working tree,
which R1 speaks for"), so R2 has nothing left to say and is retired.

What the agent did with a finding is not recorded anywhere. ADR-121 T1 (Accepted, pending) decides the nudge ledger:
acted, ignored, contradicted, pending, unknown, reported by `qh nudges`. This record does not re-decide it; T4 consumes it.

## Existing Primitives Audit

- `scripts/hook-footprint.mjs` (ADR-122 T1): measures what reached the context. Reused as T2's and T3's before/after.
- `saidInContext` and `emittedFor` (ADR-122 T2, T3): the once-per-context gate. T2 changes what counts as a change to the
  branch-state line, not the gate.
- ADR-067's heredoc grammar (`plugin/scripts/publish-command.mjs`): already reads a quoted heredoc body as data for the
  refusal. T3 reuses that reading for the advisory.
- ADR-121 T1's nudge ledger: the outcome record. T4 reads it and adds nothing to it.
- `scripts/attest-import.mjs` and `docs/corpus-reports/`: how a peer's run comes back. T4's summary rides the same route.

## Decision

1. **T1, R2 is retired.** The Node and Go turn ends stop computing and saying `unchecked-commits`: `sessionCommits`,
   `uncheckedCommitsReason` and the upstream exclusion go, with their tests and catalogue mutants. ADR-060 step 14 and
   ADR-105 are invalidated. A locked test that asserts R2's text is not edited: T1 names each lock (`scripts/test-locks.py`)
   and retires it through the lock's owning task. It fails if a turn end ever names a commit below HEAD again.
2. **T2, a session's own commit does not re-send the branch-state line.** The line's compared text leaves out HEAD's sha
   when the move from the last delivered line is a commit the session log records this session making; any other change
   (CI, a fetch, a dirty count, a branch switch) re-sends it as today. Measured before and after with `hook-footprint`.
   It fails if a CI change or a fetch is suppressed.
3. **T3, a commit word in a quoted heredoc body draws no advisory.** The publish advisory (P) reads the command with
   ADR-067's grammar: a word inside a quoted heredoc body is data, so no "only mentions" advisory is said for it. Every
   code-again twin ADR-067 lists still draws it (CLAUDE.md §16). The refusal is unchanged.
4. **T4, an adopter summary.** After ADR-121 T1 ships, `qh nudges --summary` prints, per rule, emissions and outcome counts
   (acted, ignored, contradicted, pending, unknown) and characters said, scrubbed like a corpus probe. `corpus-probe`
   carries it when it is present, and an outside-run request asks for it. It never gates a release; it is how the
   plugin's own effectiveness is measured outside this repository.

## Alternatives Considered

- **Keep R2 and fix its exclusion again.** Rejected: nine rounds found nine spellings; the class is open (CLAUDE.md §16).
- **Suppress the branch-state line after the first send.** Rejected: a CI turning red must still reach the agent.
- **Write a new outcome ledger here.** Rejected: ADR-121 T1 already decides it; a second one would disagree with it.

## Component / Boundary Impact

None — internal to the turn end (`completion-rules.mjs`, `turnend.go`), branch-state, the publish advisory and the nudge
reporter; no module changes owner.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Stop finding `unchecked-commits` | removed | T1 | agent context |
| branch-state compared text | HEAD left out on a session's own commit | T2 | `saidInContext` |
| P advisory | not said for a quoted heredoc's word | T3 | agent context |
| `qh nudges --summary` | new output | T4 | `corpus-probe`, outside-run requests |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `qh nudges` outcome rows | ADR-121 T1 | T4 | No — read only |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** the largest plugin item stops repeating what the agent already knows; R2's review surface is gone; how
  often a finding is acted on becomes a number from adopters, not this repository's guess.
- **Negative:** an unchecked commit below a checked HEAD is no longer named; a bisect onto it finds it unchecked.

## Out of Scope

- The ADR corpus's own weight (Accepted records with nothing built; record length) (deferred: the owner's answer, 2026-10-23).
- Retiring a rule for low acted rate (permanent: boundary: ADR-121 T3 decides that, from T1's numbers).

## Risks

- T1 removes a guard: a session that commits broken work, then fixes it, ends with a history holding an unchecked tree.
  Accepted by the owner (2026-10-23).
- T2's "the session made this commit" must come from the event log's own write record, not a sha guess; a log that cannot
  say so re-sends the line (could-not-look is not suppressed, ADR-005).

## Rollback

Revert the task's commit. No persisted state changes shape; T4 adds an output only.

## Follow-ups

- [ ] ADR-121 T1 is executed before T4.
