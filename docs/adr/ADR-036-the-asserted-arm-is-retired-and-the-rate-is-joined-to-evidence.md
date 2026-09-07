# ADR-036: The `asserted` arm is retired, and the false-success rate is joined to evidence rather than read off the prose

**Status:** Accepted
**Date:** 2026-09-07
**Owner:** zy
**Spec:** None — the requirement is the measured finding in `docs/research/2026-08-28-verification-is-the-bottleneck.md` §2 and §11, and the outside result cited under Context
**Cross-references:** ADR-005, ADR-010, ADR-035, `docs/research/2026-08-28-verification-is-the-bottleneck.md`, `docs/BACKLOG.md`
**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/claims-rate.mjs`
**Enforced-by:** None — Proposed. The check is named in Implementation and lands with the task that retires the arm.
**Invalidates:** none — ADR-035 stands; this retires one arm of its vocabulary and keeps the rest
**Served-path change:** The harness stops trying to decide from a sentence whether an agent claimed completion, and reports the false-success rate from what the ledger already knows about whether a check ran. No message is told it claimed something.

## Context

ADR-035 shipped a five-kind classifier over the final assistant message and pre-registered a
threshold against its `asserted` arm: precision ≥ 0.90 over ≥ 30 real final messages, or the arm is
withdrawn. On the first real measurement the arm scored **0/3** and was withdrawn the same day
(BACKLOG §124). ADR-035 T4 has stood open since, asking for the ≥ 30-message calibration.

**T4 cannot be run as written, and this is not a scheduling problem.** The arm is off, so it
produces no `asserted` rows; `scripts/claims-calibrate.mjs` refuses to print a precision over an
empty set and says why. Measured 2026-09-06 over the 80 newest transcripts on this machine (68 with
a final assistant message): `none` 63, `hedged` 5, `limited` 0, `unavailable` 0, `asserted` 0.

**The outside evidence says the threshold is unreachable by this mechanism.** *From Confident Closing
to Silent Failure: Characterizing False Success in LLM Agents* (arXiv 2606.09863) measures exactly
this class of detector — surface text over closing messages. At a 10% flag rate, TF-IDF + XGBoost
reaches **72% recall [63–80] and 50% precision [40–60]**; the best LLM judge reaches 13% recall and
58% precision. The authors state plainly: *"For autonomous deployment without human review, neither
structural detection nor LLM-as-judge currently provides sufficient precision"*, and recommend such
detectors as **triage signals requiring human review, not autonomous monitors**.

`completionClaim` is a surface-text detector over the final message. ADR-035 asked it for 0.90. The
field's best published result for the class is 0.50, with a confidence interval topping out at 0.60.

**And the harness already holds the signal that does work.** The same paper points past surface text
to trajectory–environment consistency. ADR-035's ledger survived the withdrawal intact: every
completion event is recorded with its evidence kind — `verified`, `unverified`, `no-check`,
`could-not-look` — and `claims-rate.mjs` partitions those in ADR-010's buckets. That is the claim
checked against what actually ran, which is this project's own thesis.

## Decision

**Retire the `asserted` arm permanently.** `ASSERTION_ARM_WITHDRAWN` stops being a switch awaiting a
future measurement and becomes the decision, with the reason and the citation beside it. No message
is classified as having claimed completion.

**Report the false-success rate from the evidence partition.** The project's answer to "how often did
work claim to be done without being checked" is the `unverified` and `no-check` share of completion
events, which is measured rather than inferred from wording.

**ADR-035 T4 is retired, not deferred.** Its criterion was met by being applied: the arm it guarded
was withdrawn on the evidence, and this record explains why re-attempting the calibration would
re-confirm the withdrawal at greater cost.

**`hedged`, `limited` and `unavailable` stay**, because none of them accuses anyone. They describe
the message; only `asserted` made a claim about the author's honesty.

## Alternatives Considered

- **Restore the arm with a larger negation vocabulary, then measure.** Rejected on the arithmetic:
  at the base rate this corpus shows, a candidate arm would have to run over several hundred
  transcripts and be hand-labelled to yield 30 `asserted` rows, then clear 0.90 against a published
  ceiling of 0.50 for the class. `docs/BACKLOG.md` §124 also names the methodological trap — a
  vocabulary tuned against the sample that failed is a threshold cleared by adjusting until it
  clears.
- **Keep the arm as an explicitly-labelled triage hint below 0.90.** This is what the paper
  recommends for its own detector and it is coherent where a human triages. Rejected here because
  the Stop hook has no reviewer: §124's objection is decisive — a detector that flags *"I can't
  verify anything here"* as a false success is the gate people learn to ignore, which this project
  holds to be worse than no gate.
- **Do nothing and leave ADR-035 T4 open.** Rejected: an open task whose measurement cannot be taken
  is debt that reads as a plan, and it has already cost one session an attempt.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `completionClaim` vocabulary | the `asserted` arm is removed rather than switched off; `ASSERTION_ARM_WITHDRAWN` becomes a retired-with-reason note | `lifecycle.mjs` | Stop advisory, `claims-rate.mjs` |
| `claims-rate.mjs` output | the false-success rate is reported from the evidence partition alone, and says so | `claims-rate.mjs` | a human reading it, `qh-doctor` |
| `scripts/claims-calibrate.mjs` | keeps refusing a precision over an empty set; its refusal now cites this record | repository-owned | a session tempted to re-run T4 |

## Implementation

One task: retire the arm, re-word `claims-rate.mjs`'s header so a zero in the false half is read as
the evidence partition rather than a silenced accusation, and add
`tests/lifecycle.test.mjs::the asserted arm is retired and says so` — asserting that the three
sentences §124 recorded (`"tests not yet run on my side"`, `"Haven't run the suite yet"`, `"I can't
verify anything here"`) classify as `none`, and that no input classifies as `asserted`.

## Consequences

The project loses the ability to say "this sentence claimed completion" and keeps the ability to say
"this completion event had no check behind it", which is the stronger claim and the one it can back.

⚠ Anyone comparing this project's false-success number to the literature's 75.8% must not read them
as the same measurement. That figure is about an agent's status assertions mid-task; this is recorded
completion events partitioned by whether a check ran. ADR-035 already carries that caution and it
survives here.

## Out of Scope

Trajectory-level detection beyond the evidence kind already recorded. The paper's stronger results
use features across whole trajectories; nothing here proposes building that.

## Risks

**The retirement could be read as "false success is not measurable here".** It is measurable and is
measured — by evidence, not by wording. The record has to say so where a reader will meet it.

**A future model generation may make surface text work.** The paper reports cross-temporal transfer
at AUROC 0.68–0.73, so the phenomenon persists while its surface expression drifts. Re-opening needs
a new measurement, not a new opinion.

## Rollback

Restore the arm by reverting the retirement and re-arming `ASSERTION_ARM_WITHDRAWN`. The ledger,
`claims-rate.mjs` and `trajectory-metrics.mjs` are untouched by this record, so nothing else moves.
