# ESF mechanisms worth testing in QH

Research note, 2026-10-30. Read-only inspection of the owner's supplied ESF archive, whose README identifies
0.7.1 as a candidate. No ESF code, installer, build, test, VM or model session was executed. This is a bounded
source review, not a runtime qualification or claim about the current upstream release.

## What the source supports

| Mechanism | Source inspected in ESF | Relevance to QH |
|---|---|---|
| Actual instruction consumption canary | internal/factory/improvement_canary_test.go, TestOpenCode2ActuallyLoadsInstructionProfileAndSkill | A deterministic provider drives a real client read, then checks that skill content appears in a later request |
| Independent operational conditions | internal/factory/conditions.go | Agent exit, verification, artifact collection and cleanup carry separate True/False/Unknown states and reasons |
| Immutable instructional identity | internal/harnessprofile/profile.go | Profile content is bound to runtime, model, repository, scope and template identities |
| Qualification before promotion | internal/harnessprofile/qualification.go | Accepted work also needs verification; missing usage, serious defects and weak comparative evidence prevent promotion |
| Repeated baseline comparator | internal/factory/improvement_suite.go and qualification.go | Adaptive multi-attempt approaches must also beat repeated baseline attempts |
| Direct, original and optimized guidance comparison | tools/brief_lab/esf_brief_lab/lab.py | Final holdout is kept outside optimization; generated guidance must beat both direct work and the original brief |

The canary's provider chooses the read. It proves delivery plumbing, not that a real model discovers a skill,
chooses to use it or benefits from it. The ESF documentation itself separates deterministic-provider qualification
from model-backed quality and production acceptance. Its operational conditions also do not prove that a feature
was delivered to an adopter or improved productivity.

The small brief-lab scorer leaves missing cost explicitly unknown, but applies no extra cost penalty when it is
missing. QH should preserve unknown cost as a limitation, rather than allowing it to improve a candidate's rank.
ESF's published task counts, promotion thresholds and adaptive resource allowances are not QH policy.

ESF is not in this machine's code graph. Coverage lookup returned not indexed; the evidence above uses targeted
direct source reads. No exhaustive architecture, security, call-chain or dead-code audit was performed.

## What the current QH experiment can answer

The completed screen observes deployment as offered: whether added skills and tools are selected voluntarily,
their cost, the resulting artifacts and the accuracy of reports. It cannot estimate a collector's effect when the
collector was never invoked. Installed, advertised, read, invoked and beneficial remain separate observations.

The independent claim grade belongs to the frozen screen. Complete it before choosing new experiments. Preserve
the original task allocation, qualification fixes, permission amendments, failed smokes and all charged runs.
Nothing in this note changes the frozen rubric or turns an artifact-only pass into correct completion.

## Small next experiment, if the screen justifies one

Question: with access actually exercised, can deterministic reconciliation reduce model work while retaining
current findings? This is a mechanism experiment, separate from voluntary discovery.

Compare the ordinary raw-evidence path with an explicitly routed collector at the same decision point. Both arms
receive the same task, evidence availability and required observation step; one gathers the raw observations and
the other invokes the candidate collector. Record the additional routing text and invocation cost. Do not call
this a pure wording comparison or infer natural adoption from forced exposure.

Use F3/F6-style state-changing tasks with real current defects, out-of-order historical results and repeated
unchanged output. Add 1/15/50-path deterministic replays first. If testing the Go reconciliation, invoke its actual
production boundary; a private lookalike cannot establish that the shipped mechanism was used.

Qualification and outcomes:

1. Observer receipts prove the intended reader and exact input identities ran. A forced canary tests this plumbing.
2. Negative controls retain current and unobservable findings; reordered obsolete findings do not regain authority.
3. All required final behavior is checked independently. A short response with a missed defect fails.
4. Count model evidence reads, corrective turns, total delivered input, cost, file observations and process starts.
   Keep missing token/CPU coverage unknown; compare real elapsed time only under measured quiet conditions.
5. The collector's status summary is computed from evidence, with explicit unknowns and detail available on demand.
   The model still decides intent and explains exceptions; a longer mandatory completion template is not required.

Freeze concrete tasks, commands, profiles, accounting, limits and decision rules before any new paid run. No new
trial, budget, product API, status schema, hook, refusal, daemon or infrastructure migration is authorized by this
research note. Changes to QH's behavior still follow its accepted contracts and decision process.

## Disposition

Borrow consumption receipts, independently computed state and immutable comparison identities as small, measured
mechanisms. Keep the current experiment's grades and limitations as evidence. Product changes and another model
campaign are subsequent decisions, not accomplishments of this source inspection.

The completed screen and its frozen claim-assessment limits are recorded in
[the results](2026-10-30-intervention-results.md). The screen closes without a nominee; the routed comparison above
remains proposed.
