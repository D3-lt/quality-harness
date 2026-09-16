# ADR-057: Every shipped element has a named route

**Status:** Accepted
**Date:** 2026-09-16
**Owner:** zy
**Spec:** None — no spec stage. The behaviour was chosen with the owner on 2026-09-16 from a usage measurement and a reference-graph sweep, both summarised in Context; no requirement is undecided.
**Cross-references:** ADR-029, ADR-030, ADR-043, `docs/BACKLOG.md` §115, `docs/BACKLOG.md` §210, `docs/BACKLOG.md` §211
**Governs:** `plugin/skills/work/SKILL.md`, `plugin/skills/quality-policy/SKILL.md`, `plugin/skills/review/SKILL.md`, `plugin/workflows/quality-cycle.js`, `plugin/workflows/review-ring.js`, `plugin/README.md`, `README.md`

Class: every skill, agent and workflow the plugin ships. A member is anything a session or a workflow can select by name. Enumerated 2026-09-16 at `f6335f5` with `git ls-files 'plugin/skills/*/SKILL.md' 'plugin/agents/*.md' 'plugin/workflows/*.js'` — 21 members: 14 skills (`adr-execute`, `adr-retire`, `adr-write`, `arch-write`, `codex-advise`, `codex-review`, `execution`, `mutation-audit`, `operating`, `postmortem`, `quality-policy`, `review`, `spec-write`, `work`), 4 agents (`qh-correctness-reviewer`, `qh-narrow-fixer`, `qh-scope-reviewer`, `qh-synthesis`), 3 workflows (`consensus`, `quality-cycle`, `review-ring`). T4 turns that command into a test over the class, so a member added later is asked the same question.

No member is exempt. `work`, the router, is itself named by `quality-policy` and `review`. Members whose route is unchanged apart from the Codex condition: `adr-execute`, `adr-retire`, `adr-write`, `codex-advise` (invoked by `consensus.js`), `codex-review`, `consensus`, `execution`, `quality-policy`, `review`, `review-ring`, `spec-write`.

**Enforced-by:** `tests/routing.test.mjs::every shipped skill, agent and workflow is named by a route`
**Invalidates:** ADR-030 — its T1 Reachability rung 3 row reads "a skill names one by `subagent_type`", and on 2026-09-16 no skill or workflow did. This record does not reverse ADR-030's Decision (ship named definitions); it supplies the callers that row assumed, through `quality-policy` for `qh-correctness-reviewer` and through workflow `agentType` for all four. ADR-030 and its logs are not edited (CLAUDE.md §10).
**Served-path change:** a high-risk change routes to `codex-review` when Codex is installed and to `quality-cycle` when it is not, and `quality-cycle` and `review-ring` spawn the shipped `qh-*` agents instead of restating their roles in prose.

## Context

Measured 2026-09-16 over the maintainer's local Claude Code transcripts, deduplicated by message uuid; Codex and Cursor sessions are not covered, and neither the transcripts nor per-project counts are committed (CLAUDE.md §6). The counts and method are in team memory, `wing_quality-harness` drawers `6953dd61…` and `6a342dd5…`, which reproduced the agent and workflow counts of `fbfa7a48…` exactly.

What was found, with the plugin text that explains each (reference graph from `git grep` over `plugin/`, re-checked by a cold review of this record the same day):

- **Never invoked:** `arch-write`, `quality-cycle`, `qh-scope-reviewer`, `qh-synthesis`, `qh-narrow-fixer`.
  - `arch-write`: `adr-write` step 1 names it for "Structural change + no arch doc" (`plugin/skills/adr-write/SKILL.md:112-113`); `work` class D says "architecture prerequisite when structural" and names no skill. `work`'s "Where this repository is" also says `work-next` reports "an architecture document older than the decision that changed it", and `nextStage()` (`plugin/scripts/work-next.mjs:274-290`) has no branch that returns `arch-write`. Not measured: whether any project without an architecture document wrote a structural ADR — so zero use may be low demand as much as a missing route. The route is still made explicit, at the condition `adr-write` already states.
  - `quality-cycle`: every router writes "`quality-cycle` or `codex-review`", and every High-tier session took `codex-review`.
  - The three agents: no skill or workflow names them. `quality-cycle.js` restates the correctness, scope and synthesis roles inline; `review-ring.js` restates the fixer inline.
- **Rarely invoked, each with a text cause:** `review` (sits beside `codex-review` in class F); `mutation-audit` (named only in `review`'s frontmatter "do not use" clause and `plugin/README.md`); `operating` (named only in `plugin/README.md` — the gates do not name it); `codex-advise` (invoked by `consensus.js` when `codex: true`, otherwise only in `codex-review`'s "do not use" clause); `consensus` (in the risk table, while the class table sends open decisions to `spec-write`/`adr-write`); `quality-policy` (`work` says "apply" it while restating its risk table, which `review` restates a third time); `review-ring` (explicit until-clean only since `cc94fc2`).
- **Verified 2026-09-16 before deciding:** the Workflow `agent()` hook accepts `agentType`, resolved from the same registry as the Agent tool, so a workflow can spawn `quality-harness:qh-synthesis` by name. Codex is optional on an adopter's machine; `codex-review` and `codex-advise` already probe `command -v codex`.

Debt at authoring: `adr-debt docs/adr` reports nothing this record must pull in. BACKLOG §115 ("named `plugin/agents/` definitions") is the socket ADR-030 shipped; this record gives it callers and does not reopen §115.

## Existing Primitives Audit

- **`quality-policy`'s risk table** — **reshape into the single copy.** `work` §2 and `review`'s "Route by Risk" restate it; `work` will load it, and `review` will say the coordinator routes by it. `quality-policy` itself says not to preload it into child agents (`plugin/skills/quality-policy/SKILL.md:3`), and `review` runs inside one (`review-ring.js:89`), so `review` points at it rather than loading it.
- **`adr-write` step 1's `arch-write` condition** (`plugin/skills/adr-write/SKILL.md:112-113`) — **reuse the condition.** Class D states the same "structural change and no architecture document" trigger instead of inventing a broader one.
- **`consensus.js`'s `codex` argument** — **reuse.** When `codex-advise` has already run, the Open decision route calls `consensus` with `codex: false`, so Codex is not consulted twice.
- **`plugin/agents/qh-*.md` (ADR-030)** — **reuse, by name.** Each already declares its capability class.
- **The plugin-level reviewer guard** (`plugin/scripts/lifecycle.mjs:4409-4428`, PreToolUse keyed on `input.agent_type`; the agents' own frontmatter hooks were measured inert, BACKLOG §135) — **reuse.** Spawning a read-only role by `agentType` is what can put that role's name in `agent_type`.
- **`agent()` options in `quality-cycle.js` / `review-ring.js` (ADR-029)** — **extend.** `model` stays on every call; `agentType` is added beside it.
- **`tests/mutations.json` entries pinned to `review-ring.js`'s `fix:once` options line** (`:4258`, `:4267`) — **update in the same change.** `scripts/mutate.mjs` reports a `from` that no longer matches as STALE and fails the campaign.
- **`command -v codex`** in `codex-review` and `codex-advise` — **reuse as the condition's wording.** No new detection code.
- **`STAGES` in `plugin/scripts/work-next.mjs` (ADR-043)** — **leave.** It is a catalogue that prints every stage; only `work`'s sentence claiming detection is wrong.
- **`tests/workflows.test.mjs::runWorkflow`** — **reuse** to capture `agent()` options without a host.

## Decision

**Every shipped skill, agent and workflow is selected by a named, non-substitutable route. A route that offers two elements for one situation states the condition that picks one, and Codex is one such condition: a Codex route applies only when Codex is installed, and says what runs when it is not.**

1. **T4 — the class is a test, and it is written first.** `tests/routing.test.mjs::every shipped skill, agent and workflow is named by a route` enumerates the class from `git ls-files --cached --others --exclude-standard` and fails for any member not named — as `` `name` ``, `quality-harness:name` or `/quality-harness:name`, with a boundary so `review` is not found inside `review-ring` — in the BODY of `work`, `quality-policy` or `review` (frontmatter excluded: a description's "do not use X" is a boundary, not a route), or in a workflow as `/quality-harness:name` or `agentType: 'quality-harness:name'`. It has no exemptions. Its first red is taken on today's tree; it goes green only when T1–T3 land.
2. **T1 — one risk table, with Codex as a condition.** `quality-policy` holds the only risk table. Moderate spawns `subagent_type: quality-harness:qh-correctness-reviewer`. High runs `/quality-harness:codex-review` when Codex is installed and `/quality-harness:quality-cycle` when it is not. Open decision runs `/quality-harness:codex-advise` first when Codex is installed and `/quality-harness:consensus` with `codex: false` only if two credible designs remain; without Codex, `consensus`. `work` §2 loads `quality-harness:quality-policy` and routes by its table. `review`'s "Route by Risk" says the coordinator routes review depth by that table and a delegated reviewer does not re-route. `work` class F runs `/quality-harness:review`, adding `/quality-harness:codex-review` when Codex is installed and the change is substantive or an external pass is asked for. `README.md`'s workflow list says `quality-cycle` is the high-risk review for a machine without Codex.
3. **T2 — class routes name the stage they route to.** Class D sends a structural change with no architecture document through `/quality-harness:arch-write` before `adr-write`, and through the Open decision route when two credible designs remain. Class A names `postmortem`. §0 names `/quality-harness:operating` for a gate that behaves unexpectedly or a plugin just updated. §3 names `/quality-harness:mutation-audit` where it asks whether a gate can fail. "Where this repository is" drops the architecture-document case `work-next` never selects.
4. **T3 — workflows spawn the shipped agents.** `quality-cycle.js`'s correctness, scope and synthesis calls pass `agentType: 'quality-harness:qh-correctness-reviewer'`, `'quality-harness:qh-scope-reviewer'` and `'quality-harness:qh-synthesis'`. `review-ring.js`'s fixer passes `agentType: 'quality-harness:qh-narrow-fixer'`, and the two `tests/mutations.json` entries pinned to that line are updated. `review-ring`'s reviewer and `quality-cycle`'s Codex role stay inline: they invoke skills, and no definition grants the Skill tool. `plugin/README.md` says workflows address the roles by name.

**What would make T4 fail, and whether that data exists today:** remove any one route name and the class test names that member. Measured 2026-09-16 at `f6335f5` with the predicate above: it fails for `arch-write`, `mutation-audit`, `operating`, `postmortem`, `qh-correctness-reviewer`, `qh-narrow-fixer`, `qh-scope-reviewer` and `qh-synthesis` — so the gate is red before the work and can go green only by the work. Valid for this plugin's own router files and workflows; it says nothing about whether a session follows a route, which is rung 4 and the Follow-up below.

## Alternatives Considered

- **Delete `qh-scope-reviewer`, `qh-synthesis`, `qh-narrow-fixer` and `quality-cycle`** — the first proposal on 2026-09-16, on the premise that nothing could reach the agents. Rejected by the owner the same day once `agentType` was verified (the premise was false) and Codex was made optional (without `quality-cycle`, a high-risk change on a machine without Codex gets one reviewer, the same as Moderate).
- **Exempt `work` and `operating` from the class test.** Drafted, then withdrawn after review: `work` is already named by `quality-policy` and `review`, and the `operating` exemption rested on a claim that the gates name it, which they do not (the two hits are "operating system" comments). An explicit route replaces the exemption.
- **Give `qh-correctness-reviewer` the Skill tool so `review-ring`'s reviewer runs as it.** Rejected: it widens a read-only role's tools to reach `codex-review`, whose Codex run the reviewer guard exists to constrain.
- **Make a `claude plugin eval` routing case the Acceptance gate.** Rejected: model-scored, needs an operator tool grant, and is not in `scripts/selftest.sh`. Supplementary eval cases are deferred to BACKLOG §210.
- **Implement the architecture-staleness predicate in `work-next` now.** Rejected: "older than the decision" needs to know which records are structural, which the corpus does not record. Deferred to BACKLOG §210; T2 removes the false sentence instead.
- **Keep "X or Y" and add a preference sentence.** Rejected: the measured behaviour is that the cheaper arm wins whatever the prose prefers.
- **Take T4's first red by stashing T3's edits.** Drafted, then withdrawn after review: once T3 is committed the stash saves nothing, and it edits the tree during verification (CLAUDE.md §2). T4 runs first instead.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `quality-policy` skill | sole owner of risk routing | the table's two restatements are removed |
| `work` skill | class routing; loads `quality-policy` for risk | names `arch-write`, `postmortem`, `operating`, `mutation-audit`; drops a false `work-next` claim |
| `review` skill | review procedure | points at the coordinator's routing instead of restating it |
| `quality-cycle.js`, `review-ring.js` | unchanged ownership | spawn named agents |
| `tests/routing.test.mjs` | repository gate | new class test |

None — no Module Map file in this repository; no architecture document to update.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `quality-policy` risk table (skill text) | single copy; Codex-conditional High and Open decision rows; Moderate names `qh-correctness-reviewer` | T1 | `work`, sessions |
| `work` class table and §0/§3 (skill text) | D names `arch-write` and the Open decision route; A names `postmortem`; §0 names `operating`; §3 names `mutation-audit`; F conditions `codex-review` | T1, T2 | sessions |
| `agent()` options in `quality-cycle.js`, `review-ring.js` | `agentType` added beside `model` | T3 | the host's agent registry; the reviewer guard via `agent_type` |
| `tests/mutations.json` `fix:once` entries | `from`/`to` follow the new options line | T3 | `scripts/mutate.mjs` |
| `tests/routing.test.mjs` | new file | T4, then T1, T2 | `scripts/selftest.sh` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `tests/routing.test.mjs` (file exists) | T4 | T1, T2 | No — T1 and T2 add tests to it |
| `quality-policy` risk table (single copy) | T1 | T2 | No — T2 points class D at its Open decision row |

## Implementation

See `docs/adr/ADR-057-every-shipped-element-has-a-named-route/tasks/README.md`.

## Consequences

- **Positive:** every never-invoked element gains a route a session or workflow can read, and the three idle agents gain callers.
- **Positive:** one risk table instead of three copies that could drift.
- **Negative:** `work` depends on loading `quality-policy`; a coordinator that skips the load has no risk table in context.
- **Negative:** on a machine without Codex, High tier spawns three agents instead of one Codex run — more tokens, by design.
- **Negative:** a workflow reviewer spawned as a read-only role may meet the reviewer guard's refusals of evidence-gathering commands (BACKLOG §211); `quality-cycle` then fails closed as `reviewer-unavailable`.
- **Neutral:** rung 4 (does a session follow the route) is still unmeasured by any gate; the Follow-up re-measures it by hand.

## Out of Scope

- Deleting any shipped element (deferred: Follow-ups — the 2026-10-16 re-measurement decides deletions)
- Running `review-ring`'s reviewer or `quality-cycle`'s Codex role as a `qh-*` agent (permanent: fact: no agent definition grants the Skill tool, so a role that invokes a skill cannot run as one; citation: file `plugin/agents/qh-correctness-reviewer.md:5`)
- Running `consensus`'s synthesis as `qh-synthesis` (permanent: boundary: it synthesises design proposals, not reviews, and `qh-synthesis` adjudicates reviews)
- An architecture-staleness predicate in `work-next` (deferred: docs/BACKLOG.md §210)
- Behavioural `claude plugin eval` cases for the new routes (deferred: docs/BACKLOG.md §210)
- Loosening the reviewer guard for evidence-gathering commands (deferred: docs/BACKLOG.md §211)
- Editing ADR-030 T1's Reachability row (permanent: boundary: records are history and are not rewritten; this record's `Invalidates:` carries the correction)
- Measuring Codex or Cursor sessions (permanent: boundary: the measurement covers the transcripts this machine keeps; the Follow-up uses the same scope so the two compare)
- A new route for `adr-retire` (permanent: boundary: class R already names it; low use there is low demand)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The host does not set `agent_type` for an agent a workflow spawns by `agentType`, so the reviewer guard does not recognise the role | Med | Med — a workflow reviewer could write | Unverifiable from `tests/`; T3's Reachability rung 4 says so. For Agent-tool spawns the guard is observed working (its refusals name the role, format at `lifecycle.mjs:4423`). The prompts keep their read-only wording |
| The guard refuses read-only evidence commands a workflow reviewer needs, so `quality-cycle` returns `reviewer-unavailable` | Med | Med — High tier without Codex stops instead of reviewing | T3 Stop Condition; BACKLOG §211 records the refusals a reviewer met on 2026-09-16 |
| `agentType` and `model` disagree about capability | Low | Low | Both name a class alias (ADR-029); definitions and call sites agree today (`opus`/`sonnet`) |
| The class test's name match is looser than a route | Med | Med | Boundary on the name, bodies only, a dirty case where `review` loses its route while `review-ring` keeps its own |
| A coordinator reads `work` without loading `quality-policy` | Med | Low | §2 states the load as an imperative; T1 tests the imperative, not only the name |

## Rollback

Revert the task commits, including the two `tests/mutations.json` entries. No persistent state, no migration, no evidence row outside this record's own tasks; the agent definitions and workflows keep working without `agentType`.

## Follow-ups

- [ ] On or after 2026-10-16, re-run the invocation count (method in team-memory drawer `6953dd61…`, same transcript scope) and propose deleting, in a new record, any element that is still never invoked.
