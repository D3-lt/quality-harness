# QH intervention screen: outcomes and limits

Research result, 2026-10-30. This records the completed screen from the
[comparison design](2026-10-30-intervention-benchmarks.md) and
[case handoff](2026-10-30-benchmark-claude-handoff.md). It is not a promotion decision, product change or release.

## What ran and what changed before grading

Seven arms, six tasks each: host only (N), released QH baseline (B), soft note (S), firm startup guidance (H),
collector (T), soft guidance plus collector (X), and that hybrid with a fixture-only finalize guard (G).
Subjects used claude-opus-5-5 at high effort. The baseline was the actual 3.8.62 release ZIP; the experiment's
fixtures, additions, runner, rubric and input identities were retained privately.

The private freeze records the rubric at SHA-256
69d35ba74431f01efc73adef10a2d0139f7c45a659e84a616a8ef6cd63535390.
F1/F6 received 600-second walls and the other families 300 seconds, all with the same USD 1.50 subject cap.
Relevant checks were explicitly declared. F5 therefore measures following a declared check, not unaided discovery
of which check matters. The case cards and design remain the original drafts; the private freeze and amendments
record actual execution. Publishing this report does not retroactively make those drafts a pre-run Git commit.

Qualification replaced command-text verification and forgeable workspace receipts with observations of actual
Node executions and their input identities. Smokes then exposed missing shell permissions. Two stopped the batch;
the owner chose bare Bash before any graded run. These amendments and their costs remain in the record.

Direct ledger recount corrects the earlier “49 sessions” summary: **51 sessions were launched**: 42 graded and nine
smokes, including two smoke runs with denied commands. All session verdict fields were zero; the smoke acceptance
rule additionally checks denials, so a zero session verdict alone did not make those two smokes pass.
There were 49 sessions without smoke failures. The four G refusals below are experimental guard behavior.

Recorded model cost: USD 10.4424746 graded + 1.1283342 smokes = **11.5708088 total**. Smokes are excluded from
arm comparisons. This is host-reported accounting, not independently reconciled billing. The CLI's cap can be
exceeded by one response; no run reached its budget/time limit in this batch. Claim assessment uses a fresh Codex
assessor in the current workflow; no separately priced provider grading campaign was launched or attributed here.

## Artifact outcomes, cost and use

| Arm | Artifacts completed | Graded cost, USD | Tool calls | Report characters |
|---|---:|---:|---:|---:|
| N | 6/6 | 1.2335 | 52 | 8,436 |
| B | 6/6 | 1.5313 | 52 | 9,022 |
| S | 6/6 | 1.5024 | 55 | 8,600 |
| H | 6/6 | 1.6757 | 60 | 11,772 |
| T | 6/6 | 1.4331 | 50 | 8,150 |
| X | 6/6 | 1.5343 | 55 | 9,015 |
| G | 6/6 | 1.5321 | 67 | 7,859 |

S/X subjects opened the added note in zero runs; T/X subjects invoked the collector in zero runs. G invoked it
once. H's firm text was delivered in all six runs. G refused four first finalize attempts, subsequently allowing
them. F5 had the same recorded schedule behavior in every arm: three attempts, two busy observations, one run.

On these runs, N cost about 19.4% less than B at equal artifact completion. H cost about 9.4% more and produced
about 30.5% more report characters. These are descriptive contrasts, not significant or causal population estimates.
No arm could improve artifact completion over a baseline already at 6/6. S/T/X are evidence about their offered
deployment and non-use, not an estimate of what the unused advice or collector would do if used.

## Observation and interpretation limits

One run per task/arm, one model and one host cannot establish reliability, population productivity or adoption.
Startup captures support the isolated-adopter setup; they do not constitute proof that no possible external input
was present. The private-reach detector reported zero; its pattern checks do not prove absence of all filesystem
access. Bare Bash and the observer environment are not a security boundary.

Ordinary observer logs cover selected Node processes, not every possible verification method. Some alternatives,
including the recorded in-process test mode, receive no verification credit. The guard's deterministic replay
also had known allowed-invalid and refused-valid states; passing expected replay rows was not proof of a correct
product guard. Its four runtime refusals are not automatically classified as false refusals from final success.

The 1/15/50-path scaling and idle-cost replays, production Go reconciliation adapter, independent holdout and
cross-platform/model replication were not part of the completed screen. No Go offloading, whole-session CPU or
context-token improvement is established by this experiment. ADR-133's separate observations and obligations remain
unchanged.

Raw reports, keys, maps and full evidence remain private. Only methods, identities, counts and limitations are
published. The [ESF follow-up](2026-10-30-esf-lessons.md) separates consumption plumbing from natural discovery
and describes a possible explicitly routed mechanism comparison. It is not a new authorized campaign.

## Frozen claim assessment and screen decision

A fresh Codex assessor read all 42 blinded report/fact pairs and their neutral task prompts, with no arm names,
costs, ledger or mapping. Grades and per-pack evidence were saved before the coordinator ran the joining script
and opened the mapping. Style could still suggest an intervention; the coordinator had seen aggregate outcomes
and is not described as blind.

Under the frozen rule, report-correct is zero for every arm: **0/42 correctly completed tasks**, despite 42/42
mechanical artifact passes. Cost per correctly completed task is therefore **undefined in every arm**, not zero.
Axes total: P=142, N=0, required distinctions present in 36/42, wrong authority A=1.

This result is dominated by the evidence supplied to the grader. Fact sheets omit many additional reported
operations: per-turn checks, direct CLI invocations, commits and finalization. P means unsubstantiated by those
sheets, not known false. The assessor establishes no known-false claim from these sheets. Six F4 reports also miss
one or more explicit unobserved-scope statements demanded by the frozen distinction rule.

| Arm | Frozen report-correct / assigned | P: unsupported by supplied facts |
|---|---:|---:|
| N | 0/6 | 16 |
| B | 0/6 | 18 |
| S | 0/6 | 19 |
| H | 0/6 | 26 |
| T | 0/6 | 20 |
| X | 0/6 | 22 |
| G | 0/6 | 21 |

These are preserved scores, not an estimate of fabrication rates or evidence that the underlying work was
incorrect. Grading correctness, evidence completeness and actual report truth cannot be collapsed into one number.
A future evidence audit could examine the retained execution records; it would be a labelled post-hoc analysis,
not a silent correction to this frozen grade.

**Screen closed without a nominated intervention.** No arm meets the frozen selection rule; all cost-per-correct
ratios are undefined. That does not establish that tools are ineffective or that all reports are inaccurate.
The defensible deployment observations are the artifact ceiling, added skill/collector non-use, and measured cost
and output differences on these runs. No holdout or additional paid trial follows automatically.

The ESF-inspired next step remains a proposal: verify actual consumption and compare raw observation with an
explicitly routed collector, using complete evidence for the claims being scored. The existing Go regression fixes,
ADR-133 guidance disposition, outside-reader run and release are separate work; this research closure completes none
of those publication steps.
