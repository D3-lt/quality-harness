# ADR-107: The plugin works the mrw way

**Status:** Accepted
**Date:** 2026-10-17
**Owner:** Zy
**Spec:** None — no spec stage; the owner asked on 2026-10-17: "adopt as much MRW's way and ideomatic / problem solving here as much as we can"
**Cross-references:** docs/adr/ADR-084-count-the-skills-adopters-use.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-098-what-the-plugin-says-matches-what-it-does.md, docs/adr/ADR-106-a-paired-benchmark-says-what-the-plugin-buys.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. T1 and T3 add catalogue mutants; naming them before they exist would be a pointer to nothing.
**Served-path change:** T3 adds one SessionStart line, only in a session where `mrw` resolves on PATH.

## Context

`mrw` (tool-multipathreadwrite) is a read/write tool whose way of working is: plan the activity as one read of every
site, then one plan, then one write; read before writing, per line; a plan applies whole or not at all; every edit gets a
verdict; a write that matched nothing is a failure, never a quiet success. This repository already works that way by its
own rule (CLAUDE.md §14), and the owner now asks the plugin to carry the same way to the sessions it is installed in.

What the plugin's sessions do today was read on 2026-10-17 from an interim look at ADR-106's run in another repository
(ADR-162's Stage 5, block 1; the figures stay outside this repository, CLAUDE.md §6). The arm that used `mrw` took fewer
turns per attempt than the plain arm; the plugin arm took more, and the extra turns were the verification round ADR-096
asks for, not hook text. No skill was called in that run, so only hook text reached those agents. Two consequences shape
this record: guidance that lives only in a skill body reaches a session that invokes the skill, and guidance that lives
in hook text is paid by every adopter in every session (CLAUDE.md §19), so it needs a measured reason.

The class this record governs: every place the plugin tells an agent how to read, edit and verify files, and every place
the plugin itself edits a file a repository tracks. Enumerated 2026-10-17:

- the skills: `ls plugin/skills/*/SKILL.md` (15 files); the implementing skills are `execution`, `adr-execute` and `work`;
- the plugin's own file writers: `rg -c "writeFileSync|appendFileSync|renameSync|\.write_text\(|open\([^)]*['\"][wa]\+?['\"]" plugin/ -g '!*.md'`
  (20 files, 59 lines at f4ca6593). Most write the plugin's own state and ledgers under `.git/`; the ones that edit a
  tracked file are T2's to classify.

## Existing Primitives Audit

- **The `execution` skill** (`plugin/skills/execution/SKILL.md`): the implementing leaf's contract; it already asks for
  the smallest diff and fresh evidence, and says nothing about how to read or edit. T1 adds the discipline there, once.
- **`adr-verify --mutant`** (`plugin/bin/adr-verify`): already refuses a `--from` that is absent or not unique and
  restores in a `finally` (ADR-002, ADR-016) — the mrw way for one edit. T2 audits whether every other writer does as much.
- **SessionStart orientation** (`plugin/scripts/session-orientation.mjs`, `plugin/scripts/orientation.mjs`): where an
  always-on line would go; ADR-094 and ADR-095 already keep repeated text from being re-sent.

## Decision

1. **The implementing skills teach the mrw way (T1).** `execution` gains one short section: plan the reads as one read
   of every site; plan the edits as one batch; find before reading (count matches, then read the sites); make the same
   change at many sites as one substitution; check that every edit landed, and treat an edit that matched nothing as a
   failure; read a refusal and fix its cause rather than force past it. When `mrw` is on PATH, use it for all of this.
   `adr-execute` and `work` point to that section rather than copying it (DRY).
2. **The plugin's own writers work the same way (T2).** Every plugin code path that edits a tracked file either applies
   all of its edits or none, says what each edit did, and refuses an edit that matched nothing or matched more than once.
   T2 classifies each writer with a command and fixes any that can write silently nothing, red first.
3. **A session with `mrw` is told it is there (T3).** SessionStart adds one line, only when `mrw` resolves on PATH:
   read every site in one `mrw read` and apply every edit in one `mrw write` plan. A session without `mrw` sees nothing new.
4. **A cue for every session ships only on a measured target (T4).** Whether a one-line batching cue in every session's
   hook text lowers turns per attempt is measured by a later stage of the benchmark ADR-106 uses, beside a plugin-plus-mrw
   arm. A cue for every adopter is a new record after that measurement, never this one.

**This fails if**: the `execution` skill read by a spawned implementer does not carry the discipline; a plugin writer can
report success for an edit that changed nothing; a session with `mrw` on PATH is not told, or a session without it is.

## Alternatives Considered

- **(a) Require `mrw`.** Rejected: the plugin is project-neutral and `mrw` is a separate tool an adopter may not have; a
  requirement would make the plugin unusable without it.
- **(b) Put the discipline in every session's hook text now.** Rejected for now: every adopter pays it in every session
  and after every compaction (CLAUDE.md §19), and nothing has measured that it lowers turns. T4 measures it.
- **(c) Copy the section into every skill.** Rejected: a second copy drifts; the skills that implement point to one.
- **(d) Do nothing; the benchmark will say.** Rejected: the owner asked for the way to be adopted, and the skill and the
  writers cost nothing always-on.

## Component / Boundary Impact

None — skill text, one conditional orientation line, and the plugin's own writers. No host boundary, ledger format or
public CLI changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `execution` skill body | a section on reading and editing in batches | T1 | an implementing agent; `adr-execute` and `work` point to it |
| SessionStart orientation | one line when `mrw` resolves on PATH | T3 | the agent at session start |
| plugin file writers | an edit that matched nothing is refused and said | T2 | the agent and the user reading the tool's output |

## Inter-task Contracts

| Contract | Producer | Consumer | Note |
|----------|----------|----------|------|
| the section `## Read and edit in batches` in `execution` | T1 | T3, T4 | T3's line points to it; T4 measures it |
| the `mrw`-present line | T3 | T4 | T4 measures it |

## Implementation

See `docs/adr/ADR-107-the-plugin-works-the-mrw-way/tasks/README.md`.

## Consequences

- **Positive:** an implementing agent that reads `execution` plans its reads and edits as batches and checks every edit;
  the plugin's own writers cannot report an edit that did nothing; a session with `mrw` is pointed at it.
- **Negative:** one more line at SessionStart for adopters with `mrw`; a longer `execution` body for sessions that invoke it.
- **Neutral:** adopters without `mrw` see no change in hook text.

## Out of Scope

- A batching cue in every session's hook text (deferred: T4's measurement, then a new record)
- Shipping or bundling `mrw` (permanent: boundary: a separate tool with its own releases; the plugin points to it only when present)
- The verification round's cost where a check cannot start (deferred: `docs/BACKLOG.md` §381, the lead on a check that cannot start and the R1 repeat on untracked files)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Skill text nobody invokes changes nothing | High | Low | ADR-084 counts skill calls; T4 measures the hook-text alternative |
| The `mrw` line names a binary that is a different `mrw` | Low | Low | T3 checks `mrw --version` names tool-multipathreadwrite's version shape before saying it |
| A writer fix changes what a gate writes | Low | Med | T2 fixes red first, with the 106-record lint comparison before and after |

## Rollback

Revert the tasks' commits. No stored format changes.

## Follow-ups

- [ ] Later (owner, 2026-10-17: "use MRW if this is present on PATH. it should speed up even further the plugin. since usually MRW and QH goes together"): the plugin's own tools use `mrw` where it is present. Measure first. Most of a session's time is in the agent's turns, which T1 and T3 address. A Node or Python gate reading a file in-process does not get faster by spawning a second binary. The candidates are the places the plugin edits many sites or verifies an edit landed (T2's writers, `adr-verify --mutant`), and handing the agent `mrw`-shaped plans instead of prose.
- [x] Owner decision: Accepted by the owner, 2026-10-17 ("accepted").
