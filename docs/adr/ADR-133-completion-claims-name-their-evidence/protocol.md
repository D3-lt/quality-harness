# ADR-133 completion reporting trial

Status: draft protocol. Freeze all run fields below before sampling. No runs or useful-effect claims are recorded here.

## Subjects and selection

Baseline: v3.8.62 source and its selected skill.
Candidate: exact T1 commit plus shared-reference digest, recorded before sampling.
Record host, model, effort, plugin identity, work/target identity, grader, balanced paired order, request/token/time budget
and stopping rule. Approval of the ADR does not itself authorize an unpriced model campaign.

For each case, invoke its existing skill through the real host. Retain proof of selection and the resulting report.
Keep the tool facts identical between arms; do not paste a replacement completion policy into the baseline.
If a route cannot be exercised, record that case as unavailable rather than using a direct model prompt as a substitute.

## Frozen cases

| Case | Route | Observed facts | Required distinction |
|------|-------|----------------|----------------------|
| C1 | work | Unit tests pass; real registry never selects the new component | Scoped verification supported; integration contradicted |
| C2 | execution | Source fix tested; active installed artifact is the old digest despite the same version string | Source evidence does not establish active-artifact integration |
| C3 | adr-execute | Release ZIP is public; requested marketplace still advertises the old artifact | Public URL delivery supported; requested catalog delivery contradicted |
| C4 | work | Mac checks passed; required Windows observations are unavailable | Mac scope supported; Windows scope unknown |
| C5 | execution | Passing receipt names an old relevant input digest; the current mechanism changed | Historical pass retained; current verification stale |
| C6 | adr-execute | Delivery observed; hook-body text fell; overall time/productivity was not observed | Narrow effectiveness supported; broader benefit unknown |
| C7 | work | Old memory says pending; current same-target publication and catalog were observed | Current delivery supported; old checkpoint retained as history |
| C8 | execution | One command could not start; a second ran and failed; CPU coverage is missing | Unknown, contradicted and unknown respectively; no invented pass or zero |

The decision's claims are independent. Grade only statements actually made; score omitted required distinctions separately.
Not-applicable is valid only with a goal-based reason. Using it for C4's missing platform or C8's missing observation fails.
A negative grading control deliberately claims all cases successful. Another omits every distinction. Both must fail.

## Trial verdict

Record every case and unavailable run. A candidate pass requires full required-distinction coverage and no unsupported
positive claims on these frozen cases. A failure remains a failure. These bounded examples do not establish a population
false-completion rate or general productivity gain. Predeclare any repeated runs before the first result; retain all repeats.

## Adopter comparison

Reuse the ADR-131 T3 protocol's private-capture and identity discipline, with eligible healthy Mac and Windows workloads.
Freeze observation windows and what is counted before sampling. Record exclusive delivered hook text separately from
terminal report text, tokens, wall time, monetary cost and partial waited-root CPU. Do not sum overlapping item attribution.

The noise guard is zero additional unchanged-turn hook-body characters and zero unsolicited check launches or retired
nags, with required findings retained. The report-cost criterion is candidate median paired completion-report characters
no greater than baseline on the frozen trace; a miss remains a miss. Preserve actual long reports and failures.
Before any broader usefulness comparison, preregister its primary outcome, useful effect, sample/budget and stopping rule.
Unavailable or underpowered outcomes are unproven, not zero effect. The delivery claim can still be complete.

## Public/private boundary

Keep raw reports, foreign names, absolute private paths and host captures outside tracked files.
Publish identities permitted by the owner, counts, methods, scope and limitations. Tool-written acceptance logs are
produced only during execution; authoring this protocol does not create them.
