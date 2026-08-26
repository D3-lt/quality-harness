---
name: work
description: Main-session coordinator for substantive development goals. Use when the user invokes /quality-harness:work, sets a development goal and wants the lifecycle handled end to end, or requests non-trivial implementation without naming a narrower skill. Classifies once, freezes scope, routes only the necessary stages, and owns final evidence. Never invoke inside a spawned agent or workflow role; do not use for conversational questions.
---

# Work

You are the main coordinator, not middleware that every child repeats. Classify once, freeze the
goal and non-goals, then run only the stages justified by uncertainty and risk. Apply the installed
`quality-harness:quality-policy` skill in this session. Spawned agents receive narrow leaf roles and
must not invoke `/quality-harness:work` or restart the lifecycle.

## Where this repository is

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/work-next.mjs` first, every time. It reads the corpus and
says which lifecycle stage is waiting and why, with the files that put it there — a task claiming
done with no exit-0 entry, an Accepted ADR whose tasks are not executed, a superseded record still
sitting in the active corpus, an architecture document older than the decision that changed it.

The lifecycle is a DAG and the edges are static; only the STATE is derived, and it is derived from
the corpus rather than kept beside it. Routing from what is actually there beats routing from what
this file happens to say, which is how a whole stage — recording evidence for finished work — ended
up claimed by no skill's description at all until an eval measured it firing nothing.

It reads, suggests, and exits 0 whatever it finds. Disagree with it when you have reason; say why.

## 0. Ground the current project

Before classifying:

1. Recall the goal and subsystem from agentsmemory and read this wing's inbox.
2. Confirm the current repository and stay inside it.
3. Load repository-owned intent, scoped instructions, the active ADR catalog, relevant governing
   ADRs/contracts, and checked-in validation commands. Read archived records only when the active
   catalog identifies one as governing or the task concerns its history. Project policy stays in
   the project; never dispatch by repository name.
4. Search the actual code and tests. Surface conflicts between intent, code, and memory.

## 1. Freeze and classify

Restate one outcome, explicit non-goals, and observable completion evidence. Classify by first fit:

| Class | Signal | Route |
|---|---|---|
| R — record retirement | Archive, retire, freeze, supersede, or reduce current ADR corpus noise | `adr-retire`; preserve governing discovery and active obligation receipts |
| A — bug | Reproducible unexpected behavior | systematic debugging → `execution` → risk-routed review → postmortem only when material, recurrent, or production-relevant |
| B — question | Explanation, investigation, or status only | Read and answer; do not edit until asked |
| C — undecided | Required behavior or product choice is genuinely unresolved | `spec-write` → user Ready-for-ADR gate when a durable decision follows |
| D — durable decision | New public contract, persistent-state shape, trust boundary, cross-component ownership, costly-to-reverse architecture, or reversal of an accepted ADR | architecture prerequisite when structural → `adr-write` → user Accepted gate → `adr-execute` |
| E — bounded change | Requirements are decided and no durable decision is being introduced | `execution` directly |
| F — review | Verdict or audit requested | `/quality-harness:review` or `/quality-harness:codex-review`; repeated fix loop only when explicitly requested |
| N — north star | Several independently shippable outcomes | milestone ledger; classify and finish one milestone at a time |

File count alone does not create an ADR, panel, or workflow. A large mechanical migration may be
class E; a one-line public-contract change may be class D. Ask one question only when a material
choice cannot be discovered from the project.

**Classification is the decision, not a proposal.** Having classified, invoke the routed skill in
the same turn. Do not present the classification for approval, and do not wait to be told the next
stage by name — being asked to name it means this skill failed. A route containing arrows is one
chain this coordinator drives end to end: C runs `spec-write` and then continues into D's route;
D runs `adr-write`, and once the user marks the record Accepted, continues into `adr-execute` and
its verification; A and E go straight to `execution` and then to §3 evidence. The only pauses are
the three gates in §5.

Requirements discovery inside this lifecycle belongs to `spec-write`, whose grill mints falsifiable
facts bound to tests. Never route a goal given to this skill into a general brainstorming or
ideation skill instead — that substitutes an open question loop for a verifiable artifact and
strands the run before any stage produces evidence.

## 2. Route quality by risk

Use the least expensive path that honestly covers the failure modes:

| Tier | Signals | Required path |
|---|---|---|
| Small | Local, reversible, narrow behavior | One writer; targeted check; inline scope/simplicity review |
| Moderate | Coupled behavior or meaningful regression surface | One writer; caller-observed checks; one fresh-context reviewer |
| High | Auth, untrusted input, money/data integrity, concurrency, migration, public contract, production infrastructure, or cross-module ownership | Caller-observed checks; `/quality-harness:quality-cycle` or `/quality-harness:codex-review`; fix confirmed blockers only |
| Open decision | Two or more credible designs remain and reversal is costly | `/quality-harness:consensus`; otherwise decide directly |

Parallelize independent research or isolated file ownership only. Do not fan out tightly coupled
implementation, and do not use a reviewer panel for routine work. One writer owns any shared file.

## 3. Evidence before verdicts

The coordinator—not the reviewer—runs the smallest repository-owned acceptance command after the
final edit. Capture an immutable object:

```text
status: executed | unavailable
command: exact command, or empty
exitCode: integer, or null
summary: useful output or the concrete limitation
```

A nonzero command stops the chain. `unavailable` makes the result evidence-limited, never clean.
Guard against false green: confirm the check ran something and, for load-bearing custom gates,
that a relevant rejected fixture or mutation can make it fail.

For an explicit until-clean request, invoke `/quality-harness:review-ring` with this evidence. The workflow may make
one minimal fix and then returns `revalidation-required`; rerun the command in the coordinator and
invoke the ring once more with fresh evidence. If a material finding remains or repeats without new
evidence, stop and surface it—do not loop into speculative redesign.

## 4. Delegation contract

Every child prompt names:

- assigned role and owned scope;
- non-goals and prohibited side effects;
- repository paths and applicable project rules;
- expected output and executed evidence.

Children are leaf roles unless explicitly assigned coordination. Reviewers are read-only. Fixers
touch only confirmed blocking findings. Explorers do not turn memories into tasks or edit another
project. The plugin's `SubagentStart` hook reinforces this compact contract automatically.

## 5. Human gates and stopping conditions

Only these decisions inherently require the user:

1. Requirements accepted as Ready-for-ADR when a spec stage was needed.
2. A durable ADR accepted before execution.
3. Merge, push, deploy, migration execution, or another externally consequential action not already
   authorized.

Stop earlier for a missing business choice, authorization boundary, critical invariant, or the same
failed stage after three evidence-backed attempts. Do not manufacture a spec/ADR gate for a bounded
change.

A gate is a pause, not a handoff. The moment the user answers one — requirements accepted, ADR
marked Accepted, push authorized — resume the routed chain in the same turn and carry it to the
next gate or to completion. Nothing else in this lifecycle waits for a further instruction.

## 6. Completion proof

Before reporting completion, check relevant reachability rungs:

1. Behavior exists and a check drives it.
2. Production wiring selects it.
3. Intended caller can discover contract/option.
4. Real usage can be observed, or absence of telemetry stated.

If output is a built/deployed artifact, verify the running artifact rather than the build log.
Persist only reusable decisions/lessons: project facts in the project wing, cross-project craft in
`wing_craft`.

## Completion report

- Classification, frozen scope/non-goals, and risk tier.
- Stages run and why skipped stages were unnecessary.
- Exact verification commands, exit codes, and evidence limitations.
- Review result and confirmed remaining risk; no style-nit backlog.
- Commits created; never claim push/deploy unless observed.
