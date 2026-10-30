# ADR-133: Completion claims name their evidence

**Status:** Accepted
**Accepted:** 2026-10-30 by Zy: "accept"
**Date:** 2026-10-30
**Owner:** Zy
**Spec:** None — the owner approved the five-claim plan in conversation
**Cross-references:** docs/adr/ADR-130-checks-are-optional-tools.md, docs/adr/ADR-131-native-reader-identity-and-measured-cost.md, docs/adr/ADR-132-the-installed-plugin-includes-its-go-core.md
**Governs:** plugin/skills/work/SKILL.md, plugin/skills/execution/SKILL.md, plugin/skills/adr-execute/SKILL.md, plugin/skills/work/references/completion-proof.md
**Enforced-by:** tests/completion-report-contract.test.mjs::completion producers select the shared reference through their real completion sections
**Invalidates:** none — existing task evidence, optional checks and release requirements remain authoritative
**Served-path change:** The work, execution and ADR-execute skills select one compact completion contract, distinguishing implementation, verification, integration, delivery and observed usefulness.

## Context

The owner agreed on 2026-10-30 to distinguish these claims after the v3.8.62 release. The release and its catalog promotion
completed while adopter productivity evidence remained open. One task-wide word, done, hides that distinction.

The controlled replay in docs/research/2026-10-29-check-cost.md measured less hook-body text and zero automatic project
checks. It does not establish whole-session CPU, token or productivity savings. README.md records an earlier benchmark
that did not demonstrate fewer false completions. A new reporting format must earn its usefulness too.

The memoryd recall test on 2026-10-30 found the final checkpoint through chronological listing and an exact query, while
broad current-state recall returned historical release states. Memories are historical evidence, not authority over a
newer observation. The retrieval implementation belongs to memory-runtime.

## Existing Primitives Audit

Reuse the existing skill completion sections, adr-verify evidence, check ledgers, actual caller observations and release
verification. The work skill already asks about wiring, discoverability and use. This decision supplies a shared
vocabulary; it does not add a runtime classifier, ledger or command.

Class: main-session implementation skills with an explicit terminal Completion report or Return section.
Enumeration on 2026-10-30:
`mrw read --grep '^## (Completion [Rr]eport|Completion proof|Return)$' plugin/skills`
returned adr-execute/SKILL.md:435, execution/SKILL.md:50 and work/SKILL.md:156. These are the initial consumers.
Review verdicts, intermediate progress and Stop hooks keep their own contracts; expanding them is outside this decision.

The authoring adr-state and adr-context reads found existing evidence authority in ADR-010, ADR-013, ADR-016, ADR-025,
ADR-057, ADR-062, ADR-088, ADR-098, ADR-107, ADR-109 and ADR-120. Preserve their evidence and reachability obligations.
The debt sweep also surfaced ADR-131 T3 adopter confirmation and ADR-128/ADR-121 outcome research. T3 reuses the former's
measurement discipline; the latter remains separate research and is not represented as completed by a reporting change.

## Decision

One shared reference, plugin/skills/work/references/completion-proof.md, defines independent claims. The existing
completion sections explicitly select it. It is loaded for a substantive terminal report or an explicit status request,
not injected into unchanged prompt turns. Put the observable result first, summarize the claims compactly, then expand
only material gaps. Routine conversational answers do not acquire a completion form.

| Claim | Evidence required for support |
|-------|-------------------------------|
| Implemented | An inspected change or artifact that implements the frozen requested scope |
| Verified | The relevant command, observed result, coverage and subject identity |
| Integrated | The intended entry point actually selecting the behavior, with environment and artifact identity |
| Delivered | Observed availability through the requested delivery channel; publishing and active installation are separate scopes |
| Effective | An observed intended outcome at a stated scope; comparative claims also name their baseline and limits |

Each reported claim names result, scope, target and evidence or limitation. Results are supported, contradicted, unknown,
stale or not-applicable. Not-applicable needs a goal-based reason; unavailable observation is unknown. Known failure is
contradicted, not unknown. A positive observation may be narrow: a source test does not cover an installed binary or an
unobserved platform. A partial success names the supported and uncovered scopes instead of using an aggregate green.

These claims are not a ladder or score. Delivery can be supported while effectiveness remains unknown. Verification
may be supported by a relevant scoped check; the format does not require every project to run a full suite or a benchmark.
Usefulness means the requested outcome, not a mandatory claim about general developer productivity.

Tie evidence to the observed revision, relevant input digest or artifact identity and environment. A version string,
model assertion or remembered pass alone cannot support a different subject. Reuse existing validity rules; when
current applicability cannot be established, retain the old observation as historical and disclose the current gap.
Do not rewrite historical task done states or tool-written evidence.

Handoffs carry the work identity, observed target, compact claims and authoritative evidence/checkpoint references.
Consult chronological project threads and fetch the relevant checkpoint before relying on a recalled status. A newer
timestamp alone does not supersede another work item, and an older pending note cannot overrule observed delivery of the
same target. Preserve unresolved contradictions explicitly. This is producer/reader guidance, not a memoryd ranking fix.

Checks remain optional under ADR-130. This reporting change adds no automatic test launch, check-demanding nag, publishing
refusal, always-on hook output or Stop continuation. Keep runtime hook files and existing ledger schemas unchanged.

T2 freezes the cases and comparison before running the candidate. It passes the bounded behavior trial only when every
required distinction is reported without unsupported positive claims; omissions cannot win by making no claims.
T3 separately measures noise and adoption. Missing data remains unknown; a miss remains a miss. Neither a linked reference
nor a green structural test proves that an agent used it correctly or that productivity improved.

## Alternatives Considered

- **One completed level:** Rejected because independent scope disappears and delivery can imply usefulness.
- **A five-state Stop classifier:** Rejected because prose cannot establish external delivery or user benefit and would add unsolicited work.
- **Separate copies in each skill:** Rejected because the contract can drift between producers.
- **Outcome research before every publication:** Rejected because delivery and observed usefulness have separate evidence obligations.

## Component / Boundary Impact

The skills component in docs/architecture.md owns agent-facing reporting. Add one reference within that existing
component; no new service, module boundary, ledger, runtime API or hook registration is introduced. memory-runtime owns
retrieval changes. A report is an agent-authored account referencing evidence, not a new tool-written evidence receipt.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Completion prose | Shared scoped claim contract | work, execution, adr-execute | User and subsequent coordinator |
| Skill reference selection | Explicit completion-section links | Existing skill routes | Agent loading that skill |
| Memory handoff | Work/target/evidence references | Coordinator | Coordinator reading the relevant checkpoint |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| completion-proof-v1 | T1 | T2, T3 | No ledger change; report wording changes |
| completion-case-evidence-v1 | T2 | T3 | No; private reports and public counts |

## Implementation

See ADR-133-completion-claims-name-their-evidence/tasks/README.md. T1 serves the reporting slice first. T2 checks actual
agent behavior; T3 checks adopter noise and outcome limits. Each task retains its own completion evidence.

T1 was implemented on 2026-10-30: the first-red assertion run and subsequent passing fence are in its tool-written log.
The release packager includes the actual shared reference and rejects its removal. Removing each real consumer selector
was independently noticed in an isolated worktree. These checks establish structural selection and packaging only;
T2 model compliance and T3 adopter usefulness remain pending. Runtime hooks and evidence schemas did not change.

## Consequences

The user can distinguish verified source work, active integration, delivery and benefit. Reports retain unknowns without
restarting checks. Explicit distinctions cost terminal-report space; T3 measures that cost instead of assuming it away.

## Out of Scope

- Runtime inference of these claims from transcript keywords (permanent: boundary: this decision changes selected skill guidance).
- New ledger schemas or rewriting historical done/evidence rows (permanent: boundary: existing tools retain evidence authority).
- Fixing memoryd candidate selection, ranking or sessionless delivery (external: memory-runtime: recall finding 04ca73a721b278e894d269f478fd3e2b).
- General watcher/productivity research already carried by ADR-121 and ADR-128 (deferred: docs/BACKLOG.md §436).

## Risks

Instruction compliance can fail despite correct reference wiring; T2 observes actual reports. An unknown claim can be
hidden behind not-applicable; the cases include that escape. Extra terminal text can outweigh avoided ambiguity; T3
retains raw counts and reports regressions. Private adopter receipts cannot enter this public corpus.

## Rollback

Revert the shared reference and its consumer links together. Keep historical reports and measurement receipts labelled
with the revision that produced them. No evidence migration or service rollback is needed.

## Follow-ups

- [x] Execute T1 with its own reference-selection, packaging and mutation evidence.
- [ ] Complete T2 and T3 observations; keep actual report compliance and usefulness unproven until then.
