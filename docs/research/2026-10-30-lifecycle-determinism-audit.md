# Lifecycle determinism: current mechanisms and proposed changes

Audit and change plan, 2026-10-30, against source at 6d90fef7. The owner defines QH's purpose as imposing and
following a grounded specify/plan/execute process, with soft guidance, firm correction and intervention where
needed. Cost and context are constraints; cheaper model calls and zero mistakes are not the product promise.

This is a bounded source audit and one cheap execution-helper probe. It is not a shipped workflow contract,
a completed implementation, a full security audit or permission to reverse existing policy.

## Current strengths and gaps

| Concern | Existing mechanism and evidence | Gap to address |
|---|---|---|
| Groundwork | work/SKILL.md:31-41 instructs repository, intent, memory and code grounding; execution/SKILL.md:11-19 repeats the local checks | Instructions express the right behavior; the inspected routing paths do not turn their outputs into a stage prerequisite |
| User discovery | spec-write/SKILL.md:63-96 requires scouting, interviews, fact/test links and a grill log; spec-verify checks structure and open questions | A valid document is not proof of a real interview or agreement; provenance and unresolved decisions must be represented explicitly |
| Planning | task-template.md:63-83 names affected files and ordered steps; work-next derives next corpus stage | Corpus readiness and the current user-authorized change need a shared active-work identity |
| Actual execution | execution/SKILL.md:21-48 requires minimal scoped edits and verification; Go turn-end code observes unchanged writes | An observed write or unchanged tree alone does not establish whether this task delivered its requested behavior |
| Scope and plan adherence | work's delegation contract and task Affected Files/Steps already describe ownership and expected work | Reconcile actual task changes with the agreed scope and steps; path differences alone cannot determine semantic scope |
| Verification | adr-verify runs acceptance fences and writes logs; spec-verify binds tests, executes checks and distinguishes UNRUN | Different proof strengths must be explicit; a generic successful override is not proof the named test executed |
| Completion and recovery | adr-lint rejects certain unbacked done claims; work-next reads records/tasks and returns a recommended stage | Stage recommendation is advisory; current workflow prerequisites and evidence need to govern advancement and resumption |

Source paths for the table: plugin/skills/work/SKILL.md, plugin/skills/spec-write/SKILL.md,
plugin/skills/execution/SKILL.md, plugin/templates/task-template.md, plugin/scripts/work-next.mjs,
plugin/bin/spec-verify, plugin/bin/adr-verify, plugin/bin/adr-lint, core/hooks/turnend.go.

### Evidence that matters to the design

- work-next.nextStage (757-780) deterministically selects a stage from corpus observations. Its CLI prints a
  recommendation and returns zero on the inspected recommendation paths (970-1041). It is not a stage-transition
  enforcement API. work/SKILL.md:20-29 explicitly says it suggests and can be disagreed with.
- core/hooks/lifecycle.go:579-584 records a QH Skill invocation and returns. That observation proves invocation,
  not the skill's successful execution, grounding, agreement or task completion.
- spec-verify.check_spec (793-932) checks facts, bindings, grill-log references and unresolved questions.
  Implemented mode runs items tagged implemented. No implemented item produces advice that no test ran;
  main (1033-1066) can still report PASS when only structure/existence was checked. This is an existing mode
  contract, not evidence a requested implementation was verified.
- spec-verify.test_runs (492-597) rejects recognized do-nothing overrides, then classifies other overrides by
  subprocess exit. Probe: the helper received tests/nonexistent.py::absent and the override printf audit-marker.
  It returned pass and audit-marker; no test ran. The full CLI separately checks binding existence, so this probe
  does not demonstrate that the full CLI accepts a nonexistent binding. A change needs an outer-boundary regression
  using a real existing binding and a command that does not execute it.
- adr-verify.record_run (3262-3354) records actual acceptance execution, exit, command digest, duration and test-lock
  information, and detects recognized zero-test runs. The acceptance digest binds the fence text; it is not by
  itself proof of implementation-input freshness or the command's semantic adequacy.
- adr-lint.check_status_allows_execution (3047-3077) rejects completed tasks under pending/rejected decisions.
  This validates a represented state; it does not itself stop an earlier code edit.
- core/hooks/turnend.go:107-173 and 194-258 already observe unchanged writes and assemble completion facts.
  Reuse those observations where appropriate. They are not proof of grounding or agreement.

## Changes in dependency order

### 1. Define the explicit managed-work boundary

One selected work item binds the requested outcome, accepted requirements/decision references, scope/non-goals,
task/step identities and required verification. Derive state from the existing corpus and evidence where possible.
Do not introduce a competing copy of task status or turn unrelated backlog items into the current assignment.

Preserve the bounded-change route: a small decided fix need not acquire a whole ADR lifecycle. A requirements
question enters discovery; an existing accepted plan resumes from its real state. Stage choice must be explicit
and inspectable rather than inferred from which skill name most recently appeared.

### 2. Make advancement an executable contract

Define stage prerequisites and a transition operation that returns advance, needs-correction or unknown, with
the missing evidence and the next action. Start by reusing work-next's observations and existing validators.
Neither a hand-edited Ready/done label nor a skill invocation alone satisfies a transition.

Record grounding outputs, unresolved user decisions and actual acceptance separately. A transcript/grill log
can carry evidence but cannot authenticate itself. Human approval must refer to what was approved and its revision.
The exact provenance and host integration need design; do not claim current document checks provide them.

### 3. Close verification ambiguity at the workflow boundary

A verification result needs command/runner identity, selected check, observed execution and result, target/task,
and relevant input identity. Preserve distinctions between structure checked, test exists, test executed,
passed, failed, unrun and stale. Reuse adr-verify logs and spec-verify runners rather than run the same check again
just to create another receipt.

First reproduce the ordinary-spec override case through the public command with a valid existing test binding.
Then decide the compatible contract for custom commands: which can establish test execution and which establish
a different proof. Cover zero selection, printed fake output, failed checks, missing runner, changed inputs and
legitimate non-test work. Do not expand a no-op blacklist and call it general execution proof.

### 4. Reconcile changes and recover from drift

Associate observed changes with the active task's baseline and existing user edits. Compare them with affected
files, agreed behavior and step evidence. Surface unexplained work and missing implementation; do not automatically
deny every unlisted path or require a new edit when the requested behavior already exists and is demonstrated.

A material change of intent revises the plan and invalidates only dependent conclusions. An interruption resumes
the selected task from observed evidence. Recovery must preserve history and avoid repeated checks on unchanged
inputs. Semantic relevance, adequate grounding and good test design still need model/human judgment.

### 5. Escalate at the agreed workflow boundaries

Soft: a specific missing prerequisite with a corrective action. Firm: an attempted advancement cannot satisfy its
contract. Intervention: hold that stage transition and direct the agent to repair or seek the unresolved decision.
Exact triggers, repeat behavior, authorized exceptions, cancellation and host failure semantics need a concrete
contract before implementation.

A transition command alone is insufficient if the agent can bypass it. Once a work item is active, the relevant
host adapters must apply the same prerequisite checks at real managed-write and completion boundaries. Reuse
existing hook entry points, scoped to that work item. Prove each supported tool path and interrupted/resumed
session; an unsupported or unobservable operation is a stated coverage limit, not claimed enforcement.
This is event-bound enforcement of the selected workflow, not periodic global supervision.

Keep intervention tied to the explicitly managed work. ADR-130 still removes unsolicited check refusals, nags and
automatic project baselines. Restoring a global publish refusal is not this plan. A new intercepted-command refusal
would need its own accepted contract; a deliberately invoked workflow command can have declared preconditions.

## Existing authority and unfinished work

ADR-123 already accepts dependency-aware interview rounds and observing real interview behavior. Its T1 task
currently ends with an empty Verification Log; the inspected T2/T3 tasks do too. The derived index lists them
pending. Reconcile and reuse that accepted work, particularly T1/T8, rather than author a second interview method.
This audit does not assert that every ADR-123 task is unimplemented or that its entire product-model scope is
required before the lifecycle can improve.

The current work skill's routing, spec validation, task templates and execution contracts are useful foundations.
The principal change is to connect them into an explicit work contract with observed prerequisites and guarded
advancement. No new runtime policy, state schema or public API is introduced by this document.

## Acceptance and evaluation for the first implementation slice

Use failure-focused lifecycle cases: unresolved requirement before execution; a proposed plan treated as accepted;
unrelated edits; a task claiming implementation with no delivered behavior; a check that never ran; stale passing
evidence; interruption and resumption; and a legitimate small change that must not enter an unnecessary ceremony.

Check real entry-point selection and state transitions deterministically first. Then compare a plain agent with
an explicitly invoked QH lifecycle on complete multi-step changes, including scripted user decisions and a changed
requirement. Primary outcomes: required groundwork/discovery, scope and plan adherence, actual requested delivery,
correct verification and recovery from deviations. Measure human interventions, context and cost as constraints.
Do not reuse the earlier cost-first screen as proof of this workflow's effectiveness.

Tier 2 graph/source evidence was used. Graph generation at final coverage check: 2026-10-30T17:17:52Z.
All inspected evidence paths had no recorded coverage gap and matching metadata; this is not a completeness
guarantee. Named functions and relevant caller links were checked; non-code contracts and exact source ranges
were read directly. Findings concern the inspected paths, not every possible CLI, hook or adopter integration.
No full suite, model trial or paid campaign was run for this prose-only audit.
