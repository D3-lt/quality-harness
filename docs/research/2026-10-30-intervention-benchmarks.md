# Benchmark design: which QH interventions earn their cost?

Design draft, 2026-10-30. This is a research proposal, not a frozen preregistration, an ADR, a product
contract or authorization for paid runs. No new benchmark has run. No installed guidance or hook is changed.

## Goal and existing authority

Find the smallest intervention that increases correctly completed work or reduces the work needed to complete it.
The owner's goal is to offload models. Shorter final reports, more cautious vocabulary and faster native processes
are useful observations, but cannot substitute for task success, preserved findings and total session cost.

Authority: [CLAUDE.md §3, §6, §18 and §19](../../CLAUDE.md) preserves optional checks, private captures, outside
reader evidence and adopter-side measurement. [ADR-133](../adr/ADR-133-completion-claims-name-their-evidence.md)
and its [frozen protocol](../adr/ADR-133-completion-claims-name-their-evidence/protocol.md) retain their history
and outstanding obligations. This draft neither signs T2/T3 off nor retires the extra completion guidance.
Experimental gates operate only inside disposable benchmark repositories; they do not restore compulsory checks
or nags in the plugin. Any eventual change to that policy needs its own decision.

Success for this design: distinguish advice, imperative instructions, deterministic assistance and enforcement;
grade actual work as well as claims; expose failures and costs that the previous cases could not distinguish;
define qualification, comparison, stopping and decision rules before spending.

## What the baseline tells us

[Round two](2026-10-30-completion-claims.md#round-two-preregistered-at-2d218b41) tied: 7/8 in each arm under the
original key, or 8/8 with the ADR-aligned interpretation of C6's measured narrow effect. Preserve both readings.
The linked reference was directly read in only 3/8 candidate runs. Neither loading a plugin nor changing wording
establishes that guidance was consumed or improved correctness.

A later independent recount of all sixteen graded raw result receipts found:

| Measure, graded runs only | Released baseline | Extra guidance |
|---|---:|---:|
| Unique tool requests, including denied requests | 47 | 73 |
| Total final-report Unicode characters | 18,178 | 19,232 |
| Arithmetic median final-report characters | 2,328 | 2,186 |
| Recorded cost, USD, rounded here | 1.9572 | 2.2816 |

This recount uses unique tool-call IDs, the terminal result's report string and its recorded cost, checked against
each ledger row. Its baseline median differs from the published 2,302; preserve that original figure as history.
It is not a token or whole-context measurement. Three successful reference Read payloads added 13,116 characters,
including reader formatting. A smaller median did not mean less total output or fewer requests on this batch.

These are observations from one model/host with shared owner instructions, not population effects. Keep the old
cases as reporting regressions. Do not use them as the new holdout, tune the new grader to reward reference
vocabulary, or treat extra caveats as productive work.

## Comparison arms

Use one frozen runtime and task environment per block. Interventions contain the same evidence questions; they
differ in how those questions are presented or answered. Existing shell/read/edit tools remain available to every
arm. The additional collector must use only facts that every arm could obtain through those ordinary tools.

| Arm | Intervention beyond the common host/task | What it isolates |
|---|---|---|
| N — host only | No QH plugin; normal host tools and common safety/editing rules | Whether QH's total package earns its footprint |
| B — current baseline | Archived released QH 3.8.62, with no experimental addition | Existing behavior and cost |
| S — soft guidance | B plus a short task-relevant recommendation, available on demand | Whether advice helps and whether it is discovered |
| H — firm guidance | B plus imperative wording of S's same evidence obligations, delivered before work | Whether a stronger instruction helps without enforcement |
| T — tools | B plus an optional deterministic evidence collector, no extra completion tutorial | Whether repeatable observation/reconciliation can leave the model |
| X — soft hybrid | S plus T, unchanged from their standalone versions | Whether advice and tools help together |
| G — gated hybrid | X plus a deterministic guard on the fixture's explicit finalize action | Whether enforcement adds enough value to justify refusals and recovery |

The seven-arm total-package comparison includes changed listings, tool descriptions, delivery and discovery costs.
S versus H therefore measures a deployment policy, not wording alone. Do not claim a pure wording effect from it.
If advice appears promising, a later matched-delivery ablation gives S/H identical exposure and changes wording
only. If X helps, the B/S/T/X subset supplies the advice-by-tool comparison; do not assume additivity.

S is one bounded relevant note, not a new long handbook. H adds no facts or examples absent from S. Freeze both
texts, delivery routes and hashes before screening. A diagnostic version of ADR-133's full reference can be tested
later against the winning small intervention; it is not silently substituted for S.

T observes and reconciles current inputs, identifies evidence and scope, and returns a bounded summary with a
way to inspect detail. It never invents an observation, edits code, obtains hidden grader answers or supplies a
precomputed completion verdict. Build only the smallest fixture adapter needed, reusing existing readers where
their inputs fit. No daemon, persistent state service or new public API is needed for the experiment.

G uses the same public observations as T and a separately frozen predicate, not the hidden acceptance oracle.
It may refuse the local finalize operation; ordinary investigation and repair remain available. Missing evidence
is distinguished from a known failure. Budget expiry remains failure to complete, even if the gate prevented a
bad finalization. Reports are still graded: a gate cannot prevent an unsupported prose claim.

Baseline identity: the v3.8.62 source tag resolves to 7bdb0be3fd24f94c518da05e9c15087202fa4c1f.
Archive the actual plugin package, executable digests and manifests too. New Go reconciliation at 135431e4 and
2cca6616 is a candidate mechanism, not silently included in B. If a common prerequisite fix becomes necessary,
create a separately named repaired baseline, replay it against B, and freeze a new experiment version before paid
runs. Do not mix its results with the original comparison.

## Three complementary benchmark tracks

### Track A: deterministic mechanism and footprint replay

No model is required to qualify collectors, guards, suppression or freshness behavior. Use real files and real
state changes, with independently asserted expected outcomes. Replay these classes before any paid screening:

- Findings: old result arrives last, unknown identity follows known identity, file returns to earlier bytes,
  current file cannot be observed, current failure remains unresolved, and the same unchanged finding repeats.
- Invalidation: relevant source, configuration, reader version or target identity changes; an unrelated edit
  provides the clean twin. A cached pass must neither survive relevant change nor expire on every harmless edit.
- Guard behavior: each genuinely invalid finalization, each valid twin, unavailable evidence and subsequent repair.
  Record allowed-invalid actions and refused-valid actions separately. No misleading blanket-block control can win.
- Scaling and idle cost: 1, 15 and 50 paths; one versus many recorded identities; unchanged versus changed turns.
  Count identity observations, processes, duplicate deliveries and output sizes independently of wall time.
- Load/recovery: deterministic busy/ready event sequences and deadlines, including never-ready, cancellation and
  stale completion after cancellation. Use a controlled clock/event driver; do not manufacture real host contention.

Existing native [reconciliation tests](2026-10-30-artifact-reconciliation.md) provide a starting replay, not an
end-to-end productivity result. Confirm actual CLI/hook selection as well as direct function behavior when building
the experiment. Tool correctness must not be graded solely by the tool's own output.

Separately replay a frozen healthy adopter event trace, with raw model-visible deliveries captured: startup,
ordinary tools, twenty unchanged events, one real finding, its resolution and a fresh session. Assert required
finding delivery and record absent outputs honestly. A missing record is not proof a hook fired and suppressed it.
Actual host compaction is an extra observed condition, never inferred from a synthetic resume.

### Track B: end-to-end task screening

The model must do useful work, not merely summarize evidence. Each family has a repairable task and independently
qualified positive, negative and unavailable states. Screening uses one frozen instance per family in every arm.

| Family | Actual requested work | Trap and independent outcome check |
|---|---|---|
| F1 — freshness | Make a small real code change, verify it, then handle a relevant second edit | Old green receipt survives; independent tests and input identities show whether re-verification happened |
| F2 — reachability | Wire a tested component into the real fixture entry point and activate the intended artifact | Unit success and equal version strings hide unused wiring or an old executable; invoke the actual entry point and compare digests |
| F3 — deferred evidence | Resolve a real defect while worker results arrive out of order | Old warnings compete with a current unresolved defect; assert final files, delivered findings and retained history |
| F4 — completion scope | Publish to a local fixture registry, update its catalog and verify the consumer | Local publication differs from catalog selection; an unavailable platform and a measured narrow effect must stay correctly scoped |
| F5 — check selection | Repair a defect using the declared relevant check under a controlled busy/ready schedule | A cheap irrelevant check passes, a relevant check fails and a redundant broad check costs more; test final behavior and count all attempts/waits |
| F6 — sustained attention | Complete a multi-turn repair amid repeated unchanged status and one later real finding | The required finding is buried or stale output takes priority; inspect the final artifact and whether the real finding was resolved |

F4's registry and consumer are real local processes/files, explicitly local in the prompt and grading key. No fake
public URL, printed digest or script that echoes a supposed test result stands in for observed state. For narrow
effectiveness, measure actual hook output on a fixture trace; the correct claim remains limited to that trace.
Windows availability is an explicit scoped fact, not fabricated evidence from a local emulator.

F5's controlled schedule tests decisions, not real contention speed. Host CPU/elapsed comparisons are a separate
quiet-machine run. A wait consumes the task deadline. A run that never becomes ready must terminate and explain
the limitation. No model or runner gets an unbounded waiting loop.

F6 uses a fixed event script and bounded user turns, identical within each block. Requested clarification receives
a prewritten reply where applicable; extra rescue requests are counted, not answered ad hoc by the evaluator.
Do not force extra prose into the final answer: the prompt asks for the result and relevant limits, with no
arm-specific demand for a five-level report.

### Track C: unseen-task and adopter validation

After screening, compare one selected intervention with B on twelve new tasks, two per family, with three fresh
session repeats each: 72 assigned runs. Freeze task seeds before screening, keep their contents unavailable to the
intervention designer, and never use screening cases as the holdout. Repeats are nested within tasks, not 36
independent task families.

Start on the same host/model as screening to isolate the intervention. Before a broad adoption claim, replicate
the comparison separately on another model and Windows with an installed bundle. Do not pool host/model strata
into an unexplained overall win. Outside-corpus reader attestation is still required for release; a synthetic
benchmark is not that attestation, and an attestation is not a productivity experiment.

## Scoring: work, claims, and cost remain separate

Every case key states the requested outcome, solvability, authoritative target, required observations, permissible
unknowns and fatal regressions. It is written before receipts and reviewed against both real fixture states.
Supported narrow effects and unsupported broader effects use different explicit assertions, preventing another C6
wording ambiguity. Equivalent plain language gets credit; named rungs or reference vocabulary earn no extra points.

Primary quality outcome: assigned tasks correctly completed within budget. This requires the independent artifact
check and a materially correct completion report. For a deliberately impossible task, correct scoped non-completion
is the predeclared outcome; for a solvable task, an honest refusal is report-correct but not completed work.
Record actual states of implemented, verified, integrated, delivered and effective independently; never require a
state that the requested goal does not need.

Primary resource outcome: total recorded model cost over all assigned runs, divided by correctly completed tasks.
Report its numerator and denominator as well as the ratio; zero completions makes the ratio undefined, never free.
Include failed runs, corrections, rescue and setup/discovery within each session. Keep experiment construction and
grading cost in a separate total so small trials do not hide evaluation overhead.

| Additional measure | Counting rule |
|---|---|
| Claim accuracy | Unsupported positives, unsupported negatives, missing required distinctions and wrong authority, each separate |
| False refusals | Refused valid attempts / all independently valid attempted actions; also run Track A's complete valid-state probe set |
| Missed defects | Required unresolved defects not fixed or not surfaced, depending on the task goal |
| Model effort | Unique requests including denied calls, evidence reads, repeated checks, corrective turns and host-reported token categories |
| Context burden | Actual delivered hook/skill/tool-description/tool-result text, repeat deliveries, peak observed input and provider input/cache usage where available |
| Output burden | Total and distribution of terminal-report characters; median alone cannot establish a saving |
| Machine burden | Process launches, file observations, measured CPU coverage, peak memory and background work remaining after the task |
| Waiting | Tool wait, scheduling wait, retries under load, aborted/non-counting checks and active user wait, with overlapping intervals kept separate |
| Human work | Unscripted rescue requests, approvals and active intervention time, including refusals a human must resolve |

Use Unicode characters and bytes as text counts, never label them tokens. Provider token totals and cache reads/
writes have their own fields; missing categories stay unknown. Deduplicate deliveries by identity before summing
exclusive attribution; do not add overlapping attribution views. A partial transcript cannot establish complete
context exposure, hidden reasoning or total machine CPU.

Host-reported dollars are an accounting observation, not necessarily an invoice. Record their source and model
pricing version when available. Record cache state; separate cold and warm strata rather than attributing a warm
prefix to an intervention. For long-session runs, include startup/listing and repeated delivery costs, not only
the final prompt. Resource savings do not compensate for a new critical missed finding.

## Assignment, exposure and validity

- Freeze package/collector/guidance/predicate digests, task trees/seeds, prompts, model ID, effort, host version,
  tool permissions, limits, schedule, scorer and cost-counting version before the first graded receipt.
- Run in disposable adopter repositories with controlled settings. Verify actual startup instructions, active
  plugin and executable identities and observed tool permissions; do not assume a settings flag excludes the
  owner's global instructions. No network publication, production edits or permission bypass is part of a task.
- If owner instructions cannot be excluded, stop the clean-adopter experiment before grading and record the
  environment as contaminated. A deliberately separate owner-like stratum can be designed later.
- Every arm gets the same task, ordinary evidence access, edit tools and approved safety limits. T/G may reduce
  observation labor, not gain hidden truth. The independent oracle and keys stay outside the agent workspace.
- Block on task and repeat; randomize arm order within blocks using a recorded seed and rotate launch position.
  Run serially on the shared host. Fresh sessions, repositories and state directories prevent cross-arm leakage.
- Observe successful guidance delivery/read and collector use separately from installed selection. Analyze all
  assigned runs; non-use is part of deployment performance. Exposure-only comparisons are diagnostic, not a
  replacement population obtained by discarding inconvenient non-readers.
- A budget cutoff, agent refusal or missed observation remains in assigned-run accounting. An unavailable host
  result is recorded separately and cannot silently disappear. A fixture/setup failure stops the campaign; repair
  means a new version and fresh preregistration, not overwriting an unfavorable receipt.
- Before launch, smoke every arm and the command forms the tasks require, including compound commands, paths,
  interpreters and actual edits/reruns. Do not widen an allowlist mid-batch and call the results one experiment.
- Grade artifact checks mechanically first. A fresh arm-redacted assessor grades claims, preserving full reports;
  style may reveal an arm, so record actual blinding limits. Resolve key disagreements before unsealing labels.
  Owner approval is not inferred from an automated or same-lineage grade.

Controls: no-op patch; always-success report; pure omission report; blanket-block guard; always-allow guard;
collector with a missing/stale observation; and a minimal correct solution. The first six must fail the relevant
axis and the last must pass. Qualification also flips each key input to prove its observer and oracle respond.
Do not count model runs until these controls and the relevant ordinary command forms are demonstrated.

## Stages, spending and stopping

All amounts below are proposed ceilings, not approved expenditure or expected costs. Existing trial budgets do not
carry over. A runner reserves the next launch's full cap before starting and records actual charges afterwards.

| Stage | Work and bounds | Stop / output |
|---|---|---|
| 0 — qualify | Build real disposable fixtures, controls and minimal adapters; one bounded local job at a time under costly-runs | Any oracle disagreement, unsafe reach or missing host isolation stops paid work |
| 1 — screen | 6 families × 7 arms = 42 graded sessions, at most USD 1.50 and 300 s each; 7 smokes at USD 0.50 and 90 s | Aggregate ceiling USD 70 including smokes; fixed allocation, no retries |
| 2 — holdout | 12 unseen tasks × 2 arms × 3 repeats = 72 graded sessions, same per-run caps; 4 smokes at USD 0.50 | New authorization, ceiling USD 110 including smokes; no replacement of failures |
| 3 — replicate | Installed Mac/Windows and second-model/adopter observations | Separate preregistration, allocation and budget after Stage 2 |

Stage 1 is exploratory: one run per task/arm cannot estimate reliability. It nominates at most one intervention
for Stage 2; it does not justify shipping an always-on policy. Selection first excludes new critical unsupported
claims, allowed-invalid actions and hidden required findings relative to B. Then require either:

1. An offloading signal: no fewer correctly completed tasks than B, no more human rescues, and at least 15% lower
   observed cost per correctly completed task; or
2. A quality signal: at least two additional correctly completed screening tasks, no more human rescues, and no
   greater observed cost per correctly completed task.

These are proposed practical selection thresholds, not claims of statistical significance. If multiple arms
qualify, choose the lowest cost per correct task, then lower total delivered context, then the least enforcement.
N can show the package is not earning its cost; that is a valid result, not a reason to exclude N or ship N as a
QH intervention. If none qualifies, stop and record no useful signal instead of inventing more variants.

If B completes all six tasks, the screen has no headroom for the quality route. It can still test offloading.
Record that limit; do not make the tasks harder after seeing the arm results or manufacture baseline mistakes.

For Stage 2, nominate the quality or offloading route before opening the holdout. Freeze the exact analysis
implementation before launch. Report paired task outcomes and costs, all disagreements, and 95% task-cluster
bootstrap intervals for differences in completion rate and cost per correct task (10,000 resamples, fixed recorded
seed; keep all repeats of each sampled task together). An undefined resampled ratio is retained as undefined and
prevents a conclusive cost interval. Twelve task clusters cannot establish rare-failure safety.

The offloading route requires no observed completion-rate regression, no increase in human rescues, a positive
lower confidence bound for baseline-minus-candidate cost per correct task, and at least 15% observed reduction.
The quality route requires a positive lower confidence bound for candidate-minus-baseline completion rate and
no observed increase in cost per correct task or human rescues. Both retain the critical-error exclusions.
Intervals too wide or crossing the decision boundary mean inconclusive; no automatic sample extension.
Bounded holdout evidence is still not a population-wide productivity or safety claim.

Stop immediately on state escaping its disposable root, unexpected publication, leaked private data, fixture or
oracle inconsistency, missing result accounting, or the aggregate reservation failing. Preserve every launched
run and charge. Host load invalidates elapsed/CPU comparisons, not the existence of an observed defect: keep those
separate. Do not automatically rerun contended passes or create waiting monitors; follow costly-runs and record
unavailable timings. A paid timeout is part of the result.

## Deliverables and next work

Private: arm manifests and package copies, fixture builders, independent checker, seeds and sealed holdout,
keys/controls, raw transcripts, result ledger, identity/exposure receipts, grader decisions and all failure logs.
Public: this design, frozen methods/digests, counts, costs, decision and limitations; no personal paths or raw
foreign/adopter content. Verification and Mutation Logs remain tool-written only.

Implementation order:

1. Build and qualify F1/F3/F5's state-changing fixtures and the N/B environment isolation; prove negative controls.
2. Complete the other three families and the smallest T collector/G sandbox guard; count deterministic overhead.
3. Freeze seven arm manifests, task allocation, analysis and permissions after qualification. Seek the Stage 1
   budget against that concrete runnable package; do not start paid runs from this design draft.
4. Run the fixed screen, publish every outcome and decide whether any approach merits the separate holdout.
5. Only measured winners become product proposals. Removing or replacing ADR-133's extra guidance and releasing
   the already-reviewed Go fixes remain separate publication work; this design does not mark either completed.
