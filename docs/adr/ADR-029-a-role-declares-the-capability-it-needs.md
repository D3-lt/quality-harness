# ADR-029: A spawned role declares the capability it needs, instead of inheriting whatever ran

**Status:** Accepted
**Date:** 2026-09-03
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-028-a-step-names-the-run-that-exercised-it.md, docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/research/2026-08-28-verification-is-the-bottleneck.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks. The files this decision owns are edited by T1 and T2, and a `Governs:` naming paths before they exist is the pointer-to-nothing rot ADR-011 catches.
**Enforced-by:** `tests/workflows.test.mjs::every spawned role declares the capability it needs`
**Invalidates:** none — checked. ADR-028 adds a per-step verdict and says nothing about who executes; this decides how a role's capability is chosen and says nothing about verdicts. They compose: ADR-028 is the channel that would tell you a cheaper executor skipped a step, and this is what makes a cheaper executor addressable at all. Neither depends on the other landing.
**Served-path change:** A reviewer, drafter, synthesiser or fixer runs at the capability its role needs, declared at the call site, rather than at whatever the parent session happened to be running.

## Context

**Measured 2026-09-03, in this repository:** `plugin/workflows/` makes **ten `agent()` calls** across
`consensus.js`, `quality-cycle.js` and `review-ring.js`. **Not one of them sets `model` or `effort`.**

    grep -cE "model:|effort:" plugin/workflows/*.js
    plugin/workflows/consensus.js:0
    plugin/workflows/quality-cycle.js:0
    plugin/workflows/review-ring.js:0

`plugin/agents/` does not exist, so the plugin also ships no named agent definition — every
`model`, `permissionMode`, `maxTurns`, `effort`, `memory` and `isolation` knob the host offers is at
its default for every role this plugin spawns.

The roles are not interchangeable, which is what makes the default wrong rather than merely
unspecified. `quality-cycle.js` alone spawns a correctness reviewer, a scope-and-simplicity
reviewer, an optional different-lineage Codex critique, and a synthesiser whose entire job is to
adjudicate between them. `review-ring.js` spawns a reviewer and then a deliberately narrow fixer.
A synthesis step that arbitrates conflicting findings and a fixer told to make the smallest possible
edit are different work, and today they are asked for identically.

**Why now, and why this is not speculative.** ADR-028 was written the same day from the owner's
report that handing tasks to a smaller model fails on planning rather than on coding, and from
[PEAR (arXiv 2510.07505)](https://arxiv.org/html/2510.07505v3): across 23 planner/executor pairs, a
strong planner with a weak executor reaches ~50% utility while a weak planner with a strong executor
reaches ~30% — *"a weak planner constrains the entire system, and its negative effect cannot be
offset even by stronger executors."* That result is only actionable if a role's capability can be
chosen. Here it cannot be, because nothing asks for it.

**The audit that surfaced it.** A peer session's harness audit of `agentsmemory` (2026-09-03)
enumerated the host surfaces that project leaves unused. Running the same audit here found this
project ahead on distribution — it ships a plugin, a marketplace entry, fourteen skills and an MCP
server, all of which that project lacks — and level with it on exactly one axis: subagent
configuration, where that project uses one of eight knobs and this one uses none.

## Existing Primitives Audit

- **`agent(prompt, opts)` in `plugin/workflows/*.js`** already takes an options object; `label`,
  `phase` and `schema` are passed today. **Reuse, do not reshape:** `model` and `effort` are further
  keys on the object that already exists, not a new mechanism.
- **`plugin/skills/work/SKILL.md`** already assigns roles in prose — "children are leaf roles unless
  explicitly assigned coordination. Reviewers are read-only." The role taxonomy exists and is
  written down; what is missing is the capability that follows from it.
- **The `SubagentStart` hook** (`plugin/scripts/lifecycle.mjs`) already reinforces the leaf contract
  on every spawn, and already speaks through `hookSpecificOutput`. It is the seam where a declared
  role could also be asserted, and T2 uses it rather than adding a second one.
- **`tests/workflows.test.mjs`** already reads the workflow sources and asserts properties of their
  agent calls. Extended, not replaced.
- No existing primitive names a model anywhere. Nothing to reshape.

## Decision

**Every `agent()` call in a shipped workflow declares the capability its role needs, and a test
fails when one does not.**

Capability is declared with the host's **model ALIASES** (`opus`, `sonnet`, `haiku`) and `effort`,
never with a version-pinned model id.

**That choice is the substance of this record, not a detail.** A shipped artifact naming
`claude-opus-5` is a stored fact about a model catalogue this project does not control, and it rots
exactly like the counts this corpus keeps deleting — `skill-metadata` pinned a skill count, the
README pinned an ablation figure, and both were found stale within days. An alias is a request for a
CLASS of capability, resolved by the host at call time. It is the same rule as
`sync-standalone.mjs --link` preferring a forwarder over a copy: name the requirement, let the
resolver bind it.

The assignments follow the role taxonomy that already exists:

| role | why |
|---|---|
| synthesis, consensus critique | arbitrates conflicting findings — the planner-shaped work PEAR says must not be cheap |
| correctness / scope reviewers | analysis against stated criteria, with a schema to fill |
| narrow fixer | the smallest edit under an explicit instruction — executor-shaped |

**What this record does NOT decide, deliberately:** which alias each role gets. Naming them here
would put the assignment in prose, where it would drift from the call sites, and this project's whole
argument is that a restatement of a live artifact starts losing the day it is written. T1 sets them
at the call sites; the test asserts every call declares *something*, not what it declared.

**Pre-registered failure, with data that could produce it today.** If a later reading shows every
role declaring the same alias, the declaration is carrying no information and should be deleted in
favour of the host default — the knob would be ceremony. `grep -hoE "model: *'[a-z]+'"
plugin/workflows/*.js | sort | uniq -c` is the check, and the corpus that would produce the failure
is this repository's own next few edits to those files. Valid for a workflow set with genuinely
differentiated roles; do not carry the threshold to a workflow whose steps are homogeneous.

## Alternatives Considered

- **Ship `plugin/agents/*.md` definitions instead.** Rejected for now, and it is the closest call.
  Named definitions are the right home for a role a SKILL spawns by `subagent_type`, but this
  plugin's roles live in `agent()` calls inside workflows, where a definition would be a second place
  to keep in sync with the call. Revisit when a skill needs to name a role by type — that is a
  different decision with a different trigger, and this record does not foreclose it.
- **Pin exact model ids** (`claude-opus-5`). Rejected: a stored fact about a catalogue this project
  does not own, and the failure is silent — a retired id degrades or errors at spawn time, in a
  shipped artifact, on someone else's machine.
- **Set capability once for the whole workflow.** Rejected: it reproduces today's defect one level
  up. The synthesiser and the fixer are the two roles most obviously different, and they live in the
  same file.
- **Leave it to the host default.** This is the status quo and it is defensible — the default is
  usually the parent session's model, which is usually strong. Rejected because it makes the choice
  invisible and unmeasurable: nothing records what ran, so no experiment about role capability
  (including §114's) can be run without first doing this work.
- **Do the whole delegation experiment first, then decide.** Rejected as ordering, not as substance:
  §114 cannot be measured until roles are addressable, so this is its precondition rather than its
  competitor.

## Component / Boundary Impact

`plugin/workflows/*.js` gain option keys on calls they already make. `plugin/scripts/lifecycle.mjs`
gains one assertion on a hook it already runs. No new component, no new file another module imports,
no ownership moves.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `agent(prompt, opts)` calls in shipped workflows | `model` and `effort` keys added to an existing options object | T1 | the host's Workflow runtime |
| `tests/workflows.test.mjs` | new: every spawned role declares a capability | T1 | this repository's own gate |
| `SubagentStart` hook payload | unchanged in shape; T2 only reads what is already there | T2 | spawned agents |

No public contract changes for a plugin CONSUMER: a workflow's inputs, outputs and schemas are
untouched, and a host that ignores the keys behaves exactly as today.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| every shipped `agent()` call carries `model` | T1 | T2 | No — T2 reports on what T1 establishes and degrades to silence if a call lacks it |

## Consequences

- **Positive:** role capability becomes a declared, greppable property instead of an accident of
  which session spawned the work. §114's delegation experiment becomes runnable at all.
- **Positive:** the expensive roles are named as expensive, which is the half PEAR says must not be
  cut when someone later optimises for cost.
- **Negative:** eleven more things to keep right, in files that are already dense. Mitigated by the
  test — the property is asserted rather than remembered — and by the pre-registered deletion
  criterion.
- **Negative, and honest:** this does not make any role perform better. It makes the choice
  explicit. Whether a cheaper alias is adequate for the reviewer roles is exactly what §114 is for,
  and this record deliberately does not pre-judge it.
- **Neutral:** a host that does not honour `model`/`effort` ignores unknown keys, so nothing breaks
  where the feature is absent.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| An alias is retired by the host and the spawn degrades silently | Low | Med | Aliases are a stable class-level API, unlike version-pinned ids; the Alternatives records why ids were refused |
| Every role gets the same alias and the knob becomes ceremony | Med | Low | The pre-registered failure, with a named command |
| Declaring capability reads as a cost-optimisation mandate and someone cheapens the synthesis role | Med | High — PEAR says that is the one role that cannot be cheapened | The Decision names synthesis as planner-shaped work and cites the asymmetry; §114 must measure before anyone acts |
| The test passes because it only checks presence, not sense | High | Low — presence is the claim being made | Stated in the Decision: the test asserts a declaration exists, and no more. Judging the choice is review's job and §114's |

## Rollback

Remove the `model`/`effort` keys and the test. The keys are additive options on an existing call, so
deleting them returns every role to the host default — which is today's behaviour exactly. No
persistent state, no migration, no evidence row touched.

## Out of Scope

- Deciding whether a cheaper alias is adequate for any role (deferred: docs/BACKLOG.md §114)
- `plugin/agents/*.md` named definitions (deferred: docs/BACKLOG.md §115)
- `permissionMode`, `maxTurns`, `memory`, `isolation` — the other subagent knobs (deferred: docs/BACKLOG.md §115)
- Prompt-time routing via `UserPromptSubmit`/`UserPromptExpansion` (deferred: docs/BACKLOG.md §115)
- Naming which alias each role receives, in this record (permanent: boundary: an assignment in prose drifts from the call sites it describes, which is the restatement defect this corpus exists to refuse; the call sites are the source of truth and the test reads them)
- Any claim that role capability improves outcomes here (permanent: fact: PEAR measures planner/executor asymmetry on its own benchmarks and not on this corpus, and this repository has never run the comparison; citation: url https://arxiv.org/html/2510.07505v3)

## Follow-ups

- [ ] Run the pre-registered check after the next few workflow edits and delete the declaration if
      every role carries the same alias.
